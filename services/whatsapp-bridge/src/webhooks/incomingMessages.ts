/**
 * Incoming WhatsApp message handler.
 *
 * WHY MEDIA METADATA IS NULL AT message-event TIME
 * ──────────────────────────────────────────────────
 * whatsapp-web.js fires the `message` event as soon as the basic message
 * object arrives from WA's internal Msg store.  At that point the Message
 * constructor sets:
 *
 *   this.hasMedia = Boolean(data.directPath)   // line 49, Message.js
 *
 * So hasMedia=true means directPath was truthy when the object was built.
 * However, WA then hydrates the media metadata (directPath, mimetype, filesize,
 * mediaData) asynchronously into the same _data object after the event fires.
 * By the time our handler reads those fields they can still be null.
 *
 * Fix: poll msg._data every 250 ms (up to 5 s) until directPath and mimetype
 * are non-null before calling downloadMedia().
 *
 * Media-download resilience strategy
 * ────────────────────────────────────
 * 1. Wait for media metadata to be hydrated (waitForMediaMetadata).
 * 2. Inline: retry downloadMedia() up to 6 attempts with exponential backoff
 *    (500 ms → 1 s → 2 s → 4 s → 8 s between retries).
 * 3. On ExecutionContext / detached-frame errors: trigger a per-restaurant
 *    client restart via reportClientFailure().
 * 4. On total inline failure: enqueue in mediaQueue for background retry
 *    every 30 s for up to 10 minutes.  Never discard a customer message.
 */

import util from 'util';
import { Message, MessageTypes } from 'whatsapp-web.js';
import logger from '../utils/logger';
import { sendWebhook, sendPaymentScreenshotWebhook } from './webhookSender';
import { storeMedia } from '../services/imageStorage';
import {
  getBrowserDiagnostics,
  getClientSyncInfo,
  reportClientFailure,
} from '../services/whatsappClient';
import { enqueueMedia } from '../services/mediaQueue';

const IMAGE_URL_REGEX = /https?:\/\/[^\s]+\.(jpe?g|png)/i;

// ── Retry / poll configuration ─────────────────────────────────────────────────

/** Delays (ms) before each successive retry attempt after the initial try. */
const RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000];

/** Poll interval (ms) while waiting for media metadata to be hydrated. */
const METADATA_POLL_INTERVAL_MS = 250;

/** Maximum time (ms) to wait for directPath / mimetype to become non-null. */
const METADATA_TIMEOUT_MS = 5_000;

/** Puppeteer stale execution-context patterns that indicate a dead page. */
const STALE_CONTEXT_RE =
  /execution context was destroyed|detached\s*frame|executioncontext|target\s*closed|TargetCloseError|session\s*closed|protocol\s*error/i;

// ── Phone resolution ───────────────────────────────────────────────────────────

/**
 * Resolve the sender's real phone number from a WhatsApp message.
 *
 *   @c.us  — "917086670033@c.us"  → strip suffix → "917086670033"
 *   @lid   — Linked Device ID (multi-device): must resolve via getContact()
 *            because the raw LID value is NOT a phone number.
 */
async function resolvePhone(msg: Message): Promise<string> {
  const raw = msg.from;

  if (raw.endsWith('@c.us')) return raw.replace('@c.us', '');

  if (raw.endsWith('@lid')) {
    try {
      const contact = await msg.getContact();
      const resolved = contact.number || contact.id.user;
      logger.debug(`Resolved @lid ${raw} → phone ${resolved}`);
      return resolved;
    } catch (err) {
      logger.warn(`Could not resolve @lid to phone: ${raw}`, {
        error: (err as Error).message,
      });
      return raw.split('@')[0];
    }
  }

  return raw.split('@')[0];
}

// ── Diagnostic helpers ─────────────────────────────────────────────────────────

/**
 * Log raw message internals immediately after the message event fires.
 *
 * Captures rawData / _data (same object via getter), mediaData sub-key, and
 * all top-level keys so we can see exactly which fields WA has populated at
 * event-fire time versus after hydration.
 */
function logRawMessageData(msg: Message): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = msg as any;

  // rawData is a getter that returns this._data — same reference.
  // Log both so the reader can confirm they alias each other.
  const _data    = raw._data    ?? null;
  const rawData  = raw.rawData  ?? null;    // === _data
  const mediaData = _data?.mediaData ?? null;

  let dataKeys: string[] = [];
  try { dataKeys = _data ? Object.keys(_data) : []; } catch { /* ignore */ }

  logger.info('[media:raw] Message internal data at event-fire time', {
    // Summarised fields we care most about
    hasMedia:          msg.hasMedia,
    type:              msg.type,
    id:                msg.id?._serialized,
    from:              msg.from,
    fromSuffix:        msg.from?.includes('@lid')  ? '@lid'
                     : msg.from?.includes('@c.us') ? '@c.us'
                     : 'other',
    // Media metadata — these are the fields that may be null at event time
    directPath:        _data?.directPath          ?? null,
    mimetype:          _data?.mimetype            ?? null,
    filesize:          _data?.size                ?? null,
    mediaKey:          _data?.mediaKey            ?? null,
    mediaKeyTimestamp: _data?.mediaKeyTimestamp   ?? null,
    mediaStage:        mediaData?.mediaStage      ?? null,
    // Raw dump of mediaData sub-object
    mediaData:         util.inspect(mediaData, { depth: 3 }),
    // All keys present in _data so we know what WA has populated
    _dataKeys:         dataKeys,
    // Full _data dump (depth-limited to avoid flooding logs)
    _data:             util.inspect(_data,   { depth: 4 }),
    // rawData for cross-check — should match _data
    rawDataSameRef:    rawData === _data,
  });
}

/**
 * Log the complete _data object only when metadata never became available.
 * Deeper inspection than logRawMessageData because this is the final
 * failure-mode log the developer will read to understand the root cause.
 */
function logMissingMetadataDump(msg: Message): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = msg as any;
  logger.error('[media] metadata never became available — complete _data dump', {
    id:       msg.id?._serialized,
    from:     msg.from,
    _data:    util.inspect(raw._data,   { depth: 10 }),
    rawData:  util.inspect(raw.rawData, { depth: 10 }),
  });
}

/**
 * Log WhatsApp client synchronisation state.
 * Helps determine whether the client was fully synced when the message arrived —
 * a not-yet-synced client can deliver messages whose media CDN URLs are absent.
 */
async function logClientSyncDiagnostics(restaurantId: number): Promise<void> {
  const info = await getClientSyncInfo(restaurantId);
  logger.info('[media:sync] WhatsApp client synchronisation state', {
    clientStatus:    info.clientStatus,
    waState:         info.waState,
    clientInfo:      util.inspect(info.clientInfo, { depth: 4 }),
    browserConnected: info.browserConnected,
    pageClosed:      info.pageClosed,
    pageUrl:         info.pageUrl,
  });
}

// ── Media metadata polling ─────────────────────────────────────────────────────

/**
 * Wait until the Message's _data has both directPath and mimetype populated.
 *
 * whatsapp-web.js fires `message` before WA finishes hydrating media metadata
 * into the same _data object.  Polling _data directly detects the moment
 * hydration completes so downloadMedia() has the fields it needs.
 *
 * @returns true if metadata became available within the timeout, false if not.
 */
async function waitForMediaMetadata(msg: Message): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = msg as any;

  // Fast path — already hydrated at event time (ideal case).
  if (raw._data?.directPath && raw._data?.mimetype) return true;

  logger.info('[media] directPath/mimetype not yet present — polling for hydration', {
    id:   msg.id?._serialized,
    from: msg.from,
    pollIntervalMs: METADATA_POLL_INTERVAL_MS,
    timeoutMs:      METADATA_TIMEOUT_MS,
  });

  const deadline = Date.now() + METADATA_TIMEOUT_MS;
  let elapsed = 0;

  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, METADATA_POLL_INTERVAL_MS));
    elapsed += METADATA_POLL_INTERVAL_MS;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (msg as any)._data;
    if (d?.directPath && d?.mimetype) {
      logger.info('[media] metadata hydrated — proceeding to download', {
        id:         msg.id?._serialized,
        elapsed:    `${elapsed}ms`,
        directPath: d.directPath,
        mimetype:   d.mimetype,
        filesize:   d.size ?? null,
        mediaStage: d.mediaData?.mediaStage ?? null,
      });
      return true;
    }
  }

  return false;
}

// ── Download with retry ────────────────────────────────────────────────────────

/**
 * Attempt msg.downloadMedia() with exponential-backoff retries.
 *
 * Logs "[media] download attempt N" before each attempt and full error detail
 * (name, message, stack, util.inspect) after each failure.
 *
 * Detects stale Puppeteer execution context and calls reportClientFailure()
 * to trigger a per-restaurant restart (never restarts the whole bridge).
 *
 * Returns the downloaded media on success, or null when all attempts fail.
 */
async function downloadMediaWithRetry(
  msg: Message,
  restaurantId: number,
): Promise<NonNullable<Awaited<ReturnType<Message['downloadMedia']>>> | null> {
  const totalAttempts = 1 + RETRY_DELAYS_MS.length; // 6
  let lastErr: unknown = null;
  let staleContextReported = false;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    logger.info(`[media] download attempt ${attempt}`, {
      id:   msg.id?._serialized,
      from: msg.from,
    });

    try {
      const media = await msg.downloadMedia();

      if (!media) {
        lastErr = new Error(
          `downloadMedia() returned ${media === null ? 'null' : 'undefined'} — media unavailable`,
        );
        logger.warn(`[media] download attempt ${attempt} — null result (media unavailable/expired)`, {
          id: msg.id?._serialized,
        });
      } else {
        logger.info(`[media] download attempt ${attempt} — success`, {
          id:       msg.id?._serialized,
          mimetype: media.mimetype,
          size:     media.data?.length ?? 0,
        });
        return media;
      }
    } catch (err) {
      lastErr = err;
      const errMsg   = err instanceof Error ? err.message : String(err);
      const errName  = err instanceof Error ? err.name    : typeof err;
      const errStack = err instanceof Error ? err.stack   : undefined;

      logger.warn(`[media] download attempt ${attempt} — error`, {
        id:        msg.id?._serialized,
        from:      msg.from,
        name:      errName,
        message:   errMsg,
        stack:     errStack,
        inspected: util.inspect(err, { depth: 10 }),
      });

      // Detect stale Puppeteer page — trigger per-restaurant restart at most once.
      if (!staleContextReported && STALE_CONTEXT_RE.test(errMsg)) {
        staleContextReported = true;
        logger.warn('[media] restarting client after repeated download failures', {
          restaurantId,
          id:   msg.id?._serialized,
          attempt,
        });
        reportClientFailure(restaurantId, err).catch((e: unknown) => {
          logger.error('[media] reportClientFailure threw', {
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }
    }

    if (attempt < totalAttempts) {
      const delay = RETRY_DELAYS_MS[attempt - 1];
      logger.info(`[media] waiting ${delay}ms before next attempt`, {
        nextAttempt: attempt + 1,
      });
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  // All attempts exhausted — final diagnostic snapshot.
  const diag = await getBrowserDiagnostics(restaurantId);
  logger.error('[media] all download attempts failed — final diagnostic snapshot', {
    id:         msg.id?._serialized,
    from:       msg.from,
    fromSuffix: msg.from?.includes('@lid')  ? '@lid'
              : msg.from?.includes('@c.us') ? '@c.us'
              : 'other',
    attempts:   totalAttempts,
    finalError: {
      isError:   lastErr instanceof Error,
      name:      lastErr instanceof Error ? lastErr.name    : typeof lastErr,
      message:   lastErr instanceof Error ? lastErr.message : String(lastErr),
      stack:     lastErr instanceof Error ? lastErr.stack   : undefined,
      inspected: util.inspect(lastErr, { depth: 10 }),
    },
    browser: {
      connected:     diag.browserConnected,
      pageClosed:    diag.pageClosed,
      pageUrl:       diag.pageUrl,
      clientStatus:  diag.clientStatus,
      clientIsReady: diag.clientStatus === 'connected',
    },
  });

  return null;
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function handleIncomingMessage(restaurantId: number, msg: Message): Promise<void> {
  if (msg.fromMe) return;

  const customerPhone = await resolvePhone(msg);
  const timestamp = new Date(msg.timestamp * 1000).toISOString();

  logger.info(`Incoming message from ${customerPhone} → restaurant ${restaurantId}`, {
    rawFrom: msg.from,
    type:    msg.type,
  });

  if (msg.type === MessageTypes.IMAGE) {
    // ── Step 1: log raw _data immediately at event-fire time ────────────────
    // This captures what WA has populated before any async hydration occurs,
    // letting us see exactly which fields are missing and confirm the timing.
    logRawMessageData(msg);

    // ── Step 2: log client sync state ───────────────────────────────────────
    // A not-yet-synced client can deliver messages whose media CDN URLs (directPath)
    // are absent from the WA internal Msg store at event-fire time.
    await logClientSyncDiagnostics(restaurantId);

    // ── Step 3: wait for media metadata to be hydrated ──────────────────────
    // WA fires `message` before populating directPath / mimetype into _data.
    // downloadMedia() needs both — we poll until they appear or we time out.
    const metadataReady = await waitForMediaMetadata(msg);

    if (!metadataReady) {
      // Dump the complete _data so the developer can see exactly what WA sent.
      logMissingMetadataDump(msg);
      // Still attempt the download in case WA resolves partially — some
      // implementations can succeed even without directPath in _data.
      logger.warn('[media] proceeding to download despite missing metadata', {
        id: msg.id?._serialized,
      });
    }

    // ── Step 4: attempt download with retries ───────────────────────────────
    const media = await downloadMediaWithRetry(msg, restaurantId);

    if (!media) {
      // All inline retries failed — enqueue for background retry (never discard).
      enqueueMedia(restaurantId, msg, customerPhone, timestamp);
      return;
    }

    logger.info('[media] before storeMedia');
    const imageUrl = await storeMedia(restaurantId, media, timestamp);
    logger.info('[media] after storeMedia');

    // Webhook delivery is not retried — only the download path is resilient.
    await sendWebhook({ restaurantId, customerPhone, messageType: 'image', imageUrl, timestamp });
    await sendPaymentScreenshotWebhook({ restaurantId, customerPhone, imageUrl, timestamp });
    return;
  }

  if (msg.type === MessageTypes.TEXT) {
    const urlMatch = msg.body.match(IMAGE_URL_REGEX);
    if (urlMatch) {
      const imageUrl = urlMatch[0];
      logger.info(`Detected image URL in text message from ${customerPhone}`, { imageUrl });
      await sendWebhook({ restaurantId, customerPhone, messageType: 'image', imageUrl, timestamp });
      await sendPaymentScreenshotWebhook({ restaurantId, customerPhone, imageUrl, timestamp });
      return;
    }
    await sendWebhook({ restaurantId, customerPhone, messageType: 'text', text: msg.body, timestamp });
    return;
  }

  logger.debug(`Skipping unsupported message type: ${msg.type} from ${customerPhone}`);
}
