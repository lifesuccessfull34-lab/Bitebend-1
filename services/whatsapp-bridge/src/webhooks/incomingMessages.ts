/**
 * Incoming WhatsApp message handler.
 *
 * ROOT CAUSE OF THE "r: r" DOWNLOAD FAILURE (fixed here)
 * ────────────────────────────────────────────────────────
 * whatsapp-web.js 1.34.7 (latest stable) Message.downloadMedia() calls
 * WA's internal msg.downloadMedia() to resolve the media, then checks
 * mediaStage — but NEVER verifies that directPath was actually written.
 * WA sets mediaStage = 'RESOLVED' optimistically BEFORE populating
 * directPath.  So downloadAndMaybeDecrypt({directPath: null, …}) is called,
 * WA's CDN rejects the null-path request, throws plain object {r: 'r'}, and
 * Puppeteer serialises the non-Error thrown value as "Error: r: r".
 *
 * THE FIX:
 *   downloadMediaDirect() (whatsappClient.ts) runs our own pupPage.evaluate
 *   that mirrors the library's logic but adds the missing poll: after calling
 *   WA's internal resolution, wait until directPath is genuinely non-null
 *   before calling downloadAndMaybeDecrypt.  Structured values are returned
 *   instead of throwing, so Puppeteer never serialises a plain WA error object.
 */

import util from 'util';
import { Message, MessageMedia, MessageTypes } from 'whatsapp-web.js';
import logger from '../utils/logger';
import { sendWebhook, sendPaymentScreenshotWebhook } from './webhookSender';
import {
  downloadMediaDirect,
  getClientSyncInfo,
  reportClientFailure,
  probeMsgIdb,
} from '../services/whatsappClient';
import { enqueueMedia } from '../services/mediaQueue';

const IMAGE_URL_REGEX = /https?:\/\/[^\s]+\.(jpe?g|png)/i;

// ── Retry configuration ────────────────────────────────────────────────────────

/** Delays (ms) before each successive retry — index 0 is the wait before attempt 2. */
const RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000];

/** Puppeteer stale execution-context patterns that indicate a dead page. */
const STALE_CONTEXT_RE =
  /execution context was destroyed|detached\s*frame|executioncontext|target\s*closed|TargetCloseError|session\s*closed|protocol\s*error/i;

// ── Phone resolution ───────────────────────────────────────────────────────────

/**
 * Resolve the sender's real phone number from a WhatsApp message.
 *
 *   @c.us  — "917086670033@c.us"  → strip suffix
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
 * Log raw message internals at event-fire time.
 * Captures _data fields so we can see what WA has populated before any
 * hydration and after, confirming the root cause timing in production logs.
 */
function logRawMessageData(msg: Message): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = msg as any;
  const _data = raw._data ?? null;
  let dataKeys: string[] = [];
  try { dataKeys = _data ? Object.keys(_data) : []; } catch { /**/ }

  logger.info('[media:diag] Message _data at event-fire time', {
    hasMedia:          msg.hasMedia,
    type:              msg.type,
    id:                msg.id?._serialized,
    from:              msg.from,
    fromSuffix:        msg.from?.includes('@lid')  ? '@lid'
                     : msg.from?.includes('@c.us') ? '@c.us' : 'other',
    directPath:        _data?.directPath          ?? null,
    mimetype:          _data?.mimetype            ?? null,
    filesize:          _data?.size                ?? null,
    mediaKey:          _data?.mediaKey            ?? null,
    mediaKeyTimestamp: _data?.mediaKeyTimestamp   ?? null,
    mediaStage:        _data?.mediaData?.mediaStage ?? null,
    _dataKeys:         dataKeys,
    _data:             util.inspect(_data, { depth: 4 }),
  });
}

/** Log WhatsApp client synchronisation state (useful if media arrives while not fully synced). */
async function logClientSyncDiagnostics(restaurantId: number): Promise<void> {
  const info = await getClientSyncInfo(restaurantId);
  logger.info('[media:sync] WhatsApp client state', {
    clientStatus:     info.clientStatus,
    waState:          info.waState,
    clientInfo:       util.inspect(info.clientInfo, { depth: 3 }),
    browserConnected: info.browserConnected,
    pageClosed:       info.pageClosed,
    pageUrl:          info.pageUrl,
  });
}

// ── Download with retry ────────────────────────────────────────────────────────

/**
 * Attempt downloadMediaDirect() up to 6 times with exponential backoff.
 *
 * downloadMediaDirect() is the fixed replacement for msg.downloadMedia():
 *   - runs its own pupPage.evaluate
 *   - polls until directPath is genuinely set (the missing check in the library)
 *   - returns structured values instead of throwing, eliminating the "r: r" problem
 *
 * Returns the downloaded MessageMedia on success, or null to signal enqueueing.
 */
async function downloadMediaWithRetry(
  msg: Message,
  restaurantId: number,
): Promise<MessageMedia | null> {
  const totalAttempts = 1 + RETRY_DELAYS_MS.length; // 6
  let staleContextReported = false;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    logger.info(`[media] download attempt ${attempt}`, {
      id:   msg.id?._serialized,
      from: msg.from,
    });

    try {
      const result = await downloadMediaDirect(restaurantId, msg.id._serialized);

      if (result instanceof MessageMedia) {
        logger.info(`[media] download attempt ${attempt} — success`, {
          id:       msg.id?._serialized,
          mimetype: result.mimetype,
          size:     result.data?.length ?? 0,
        });
        return result;
      }

      // Structured failure from downloadMediaDirect.
      // `step`      — which evaluate step threw (key for root-cause attribution)
      // `msgFoundVia` — whether msg was in memory, IDB, or absent
      // `mediaDump` — all media fields from the WA internal object (logged
      //               separately at INFO so it appears even when warn-level
      //               filtering is active, without flooding the warn stream)
      const failResult = result.ok === false ? result : null;
      logger.warn(`[media] download attempt ${attempt} — ${failResult?.reason ?? 'unknown'}`, {
        id:          msg.id?._serialized,
        from:        msg.from,
        reason:      failResult?.reason      ?? undefined,
        detail:      failResult?.detail      ?? undefined,
        step:        failResult?.step        ?? undefined,
        msgFoundVia: failResult?.msgFoundVia ?? undefined,
      });
      if (failResult?.mediaDump) {
        logger.info('[media:dump] Node-side view of WA internal message properties', {
          id:        msg.id?._serialized,
          attempt,
          mediaDump: failResult.mediaDump,
        });
      }

    } catch (err) {
      // downloadMediaDirect should not throw, but guard anyway.
      const errMsg   = err instanceof Error ? err.message : String(err);
      const errName  = err instanceof Error ? err.name    : typeof err;

      logger.warn(`[media] download attempt ${attempt} — unexpected exception`, {
        id:        msg.id?._serialized,
        from:      msg.from,
        name:      errName,
        message:   errMsg,
        stack:     err instanceof Error ? err.stack : undefined,
        inspected: util.inspect(err, { depth: 10 }),
      });

      // Detect stale Puppeteer page — trigger per-restaurant restart at most once.
      if (!staleContextReported && STALE_CONTEXT_RE.test(errMsg)) {
        staleContextReported = true;
        logger.warn('[media] restarting client after stale execution-context error', {
          restaurantId, id: msg.id?._serialized, attempt,
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
      logger.info(`[media] waiting ${delay}ms before attempt ${attempt + 1}`);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  logger.error('[media] all download attempts failed', {
    id:         msg.id?._serialized,
    from:       msg.from,
    fromSuffix: msg.from?.includes('@lid')  ? '@lid'
              : msg.from?.includes('@c.us') ? '@c.us' : 'other',
    attempts:   totalAttempts,
  });
  return null;
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function handleIncomingMessage(restaurantId: number, msg: Message): Promise<void> {
  if (msg.fromMe) return;

  // Skip WhatsApp Status/Stories updates (from: "status@broadcast" or any
  // other @broadcast JID).  These fire the standard 'message' event but are
  // not customer messages — their media is stored under a different IDB key
  // scheme that causes DataError on every getMessagesById() call.
  if (msg.from?.endsWith('@broadcast')) {
    logger.debug(`[incoming] Skipping broadcast message (${msg.from}), type=${msg.type}`);
    return;
  }

  const customerPhone = await resolvePhone(msg);
  const timestamp = new Date(msg.timestamp * 1000).toISOString();

  logger.info(`Incoming message from ${customerPhone} → restaurant ${restaurantId}`, {
    rawFrom: msg.from,
    type:    msg.type,
  });

  if (msg.type === MessageTypes.IMAGE) {
    // Log raw _data at event-fire time for root-cause tracing.
    logRawMessageData(msg);

    // Log client sync state — confirms whether WA was fully ready.
    await logClientSyncDiagnostics(restaurantId);

    // ── TEST 1 / TEST 2 / TEST 4: Pre-download IDB probe ──────────────────
    // Runs automatically on EVERY incoming IMAGE message — both @c.us and
    // @lid senders — so the two result sets can be compared directly.
    //
    // Captures:
    //   mem  — WAWebCollections.Msg.get(msgId)          (sync, in-memory)
    //   idb  — WAWebCollections.Msg.getMessagesById()   (async, IndexedDB)
    //   interceptor.callsDuringGetById — the EXACT IDB key(s) constructed
    //     by WA Web for the getMessagesById() call.  If an @lid JID produces
    //     an undefined key component the entry will have isInvalid: true and
    //     the queryPreview will show "[undefined,\"<HEXID>\"]".
    //
    // Compare the probe log lines for a @c.us sender (should succeed) versus
    // an @lid sender (expected DataError source) to prove root cause.
    const fromSuffix = msg.from?.includes('@lid')  ? '@lid'
                     : msg.from?.includes('@c.us') ? '@c.us' : 'other';
    logger.info('[test:pre-probe] Running IDB probe before download', {
      id:         msg.id?._serialized,
      from:       msg.from,
      fromSuffix,
    });
    const probeResult = await probeMsgIdb(restaurantId, msg.id._serialized);
    if ('error' in probeResult) {
      logger.warn('[test:pre-probe] probeMsgIdb failed', {
        id:    msg.id?._serialized,
        error: probeResult.error,
      });
    } else {
      logger.info('[test:pre-probe] IDB probe complete', {
        id:         msg.id?._serialized,
        fromSuffix,
        // ── TEST 1 & 2: key comparison fields ──────────────────────────────
        mem_found:                probeResult.mem.found,
        mem_error:                probeResult.mem.error,
        mem_msgId_serialized:     probeResult.mem.msgId_serialized,
        mem_msgId_remote:         probeResult.mem.msgId_remote,
        mem_msgId_id:             probeResult.mem.msgId_id,
        mem_msgId_fromMe:         probeResult.mem.msgId_fromMe,
        mem_directPath:           probeResult.mem.directPath,
        mem_mediaKey:             probeResult.mem.mediaKey,
        mem_mediaKeyTimestamp:    probeResult.mem.mediaKeyTimestamp,
        mem_mimetype:             probeResult.mem.mimetype,
        mem_mediaStage:           probeResult.mem.mediaStage,
        idb_found:                probeResult.idb.found,
        idb_error:                probeResult.idb.error,
        idb_msgId_serialized:     probeResult.idb.msgId_serialized,
        idb_msgId_remote:         probeResult.idb.msgId_remote,
        idb_msgId_id:             probeResult.idb.msgId_id,
        idb_msgId_fromMe:         probeResult.idb.msgId_fromMe,
        idb_directPath:           probeResult.idb.directPath,
        idb_mediaKey:             probeResult.idb.mediaKey,
        idb_mediaStage:           probeResult.idb.mediaStage,
        // ── TEST 4: exact IDB key passed to objectStore.get() ──────────────
        interceptor_patched:       probeResult.interceptor.patched,
        interceptor_totalCalls:    probeResult.interceptor.totalCallsEver,
        callsDuringGetById:        probeResult.interceptor.callsDuringGetById,
        allInvalidKeyCalls:        probeResult.interceptor.allInvalidKeyCalls,
        // ── Full snapshots for diff ─────────────────────────────────────────
        mem_allKeys:   probeResult.mem.allKeys,
        idb_allKeys:   probeResult.idb.allKeys,
        mem_rawProps:  probeResult.mem.rawProps,
        idb_rawProps:  probeResult.idb.rawProps,
      });
    }

    // Attempt download using the fixed implementation that polls for directPath.
    const media = await downloadMediaWithRetry(msg, restaurantId);

    if (!media) {
      // All inline retries exhausted — enqueue for background retry (never discard).
      enqueueMedia(restaurantId, msg, customerPhone, timestamp);
      return;
    }

    // Send base64 data URL directly in the webhook payload.
    // The API server's /whatsapp/payment-screenshot handler already accepts
    // "data:" URIs natively (no extra fetch needed).  This eliminates the
    // fragile HTTP round-trip from the API server back to the bridge just
    // to retrieve a file that is already in memory.
    const dataUrl = `data:${media.mimetype};base64,${media.data}`;

    // Webhook delivery is never retried — only the download is resilient.
    await sendWebhook({ restaurantId, customerPhone, messageType: 'image', imageUrl: dataUrl, timestamp });
    await sendPaymentScreenshotWebhook({ restaurantId, customerPhone, imageUrl: dataUrl, timestamp });
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
