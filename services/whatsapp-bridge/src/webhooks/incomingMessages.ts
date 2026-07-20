/**
 * Incoming WhatsApp message handler.
 *
 * Media-download resilience strategy
 * ────────────────────────────────────
 * 1. Inline handler retries downloadMedia() up to 5 times with exponential
 *    backoff (500 ms → 1 s → 2 s → 4 s → 8 s between retries).
 *
 * 2. If a retry throws an ExecutionContext / evaluate error the Puppeteer page
 *    is likely stale.  reportClientFailure() is called, which checks browser
 *    health and triggers a per-restaurant client restart if needed — without
 *    touching any other restaurant's session.
 *
 * 3. If all inline retries are exhausted the message is enqueued in the
 *    in-memory retry queue (mediaQueue.ts).  A background worker retries every
 *    30 seconds for up to 10 minutes.  After a client restart the worker swaps
 *    the stale client reference on the queued Message object so downloads
 *    succeed automatically.
 *
 * Root-cause note — the "r: r" error
 * ────────────────────────────────────
 * downloadMedia() calls pupPage.evaluate() which executes inside Chromium.
 * WhatsApp's internal downloadAndMaybeDecrypt() can throw a plain JS object
 * { r: 'r' } (WA's internal retry/error code) instead of a real Error.
 * Puppeteer serialises non-Error thrown values as "Error: <key>: <value>",
 * producing the misleading "Error: r: r" in logs.
 *
 * The browser and WA session are ALIVE when this happens; the failure is
 * entirely inside WA's JS sandbox.  Known triggers:
 *   1. Media expired on WA's CDN (mediaStage = REUPLOADING / FETCHING).
 *   2. @lid multi-device accounts with mismatched directPath / mediaKey.
 *   3. Transient network hiccup inside Chromium's fetch context.
 */

import util from 'util';
import { Message, MessageTypes } from 'whatsapp-web.js';
import logger from '../utils/logger';
import { sendWebhook, sendPaymentScreenshotWebhook } from './webhookSender';
import { storeMedia } from '../services/imageStorage';
import { getBrowserDiagnostics, reportClientFailure } from '../services/whatsappClient';
import { enqueueMedia } from '../services/mediaQueue';

const IMAGE_URL_REGEX = /https?:\/\/[^\s]+\.(jpe?g|png)/i;

// ── Retry configuration ────────────────────────────────────────────────────────

/**
 * Delays (ms) to wait BEFORE each successive retry attempt.
 * Index 0 → wait before attempt 2, index 4 → wait before attempt 6.
 * Total attempts = 1 (initial) + RETRY_DELAYS_MS.length = 6.
 */
const RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000];

/** Puppeteer execution-context error patterns that indicate a stale page. */
const STALE_CONTEXT_RE =
  /execution context was destroyed|detached\s*frame|executioncontext|target\s*closed|TargetCloseError|session\s*closed|protocol\s*error/i;

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Resolve the sender's real phone number from a WhatsApp message.
 *
 * WhatsApp-web.js exposes two JID formats for msg.from:
 *
 *   @c.us  — classic format: "917086670033@c.us"
 *            Strip the suffix → "917086670033"
 *
 *   @lid   — Linked Device ID, used by newer WhatsApp accounts that have
 *            enabled the new multi-device architecture: "268641748652129@lid"
 *            This is an internal WA identifier, NOT a phone number.
 *            Must be resolved via msg.getContact() to get the real number.
 */
async function resolvePhone(msg: Message): Promise<string> {
  const raw = msg.from;

  if (raw.endsWith('@c.us')) {
    return raw.replace('@c.us', '');
  }

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

/**
 * Log all diagnostic properties of the message before attempting any download.
 *
 * Captures hasMedia, JID type (@lid vs @c.us), mediaKey/directPath presence,
 * and mediaStage — the primary fields needed to diagnose the @lid media-key
 * bug and CDN-expiry issues from logs alone.
 */
function logPreDownloadDiagnostics(msg: Message): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = msg as any;
  logger.info('[media:diag] Pre-download message properties', {
    hasMedia:          msg.hasMedia,
    type:              msg.type,
    id:                msg.id?._serialized ?? msg.id,
    from:              msg.from,
    fromSuffix:        msg.from?.includes('@lid')  ? '@lid'
                     : msg.from?.includes('@c.us') ? '@c.us'
                     : 'other',
    timestamp:         msg.timestamp,
    isForwarded:       msg.isForwarded,
    hasQuotedMsg:      msg.hasQuotedMsg,
    mediaKey:          raw.mediaKey            ?? null,
    mediaKeyTimestamp: raw.mediaKeyTimestamp   ?? null,
    directPath:        raw.directPath          ?? null,
    mediaStage:        raw.mediaData?.mediaStage ?? null,
    mimetype:          raw.mimetype             ?? null,
    filesize:          raw.filesize             ?? null,
  });
}

/**
 * Attempt msg.downloadMedia() with exponential-backoff retries.
 *
 * - Logs "[media] download attempt N" before each attempt.
 * - Logs error.name / error.message / stack / util.inspect after each failure.
 * - Detects stale Puppeteer execution context and triggers a per-restaurant
 *   client restart via reportClientFailure() (does not restart the bridge).
 *
 * Returns the downloaded MessageMedia on success, or null on total failure.
 * The caller is responsible for enqueueing on null.
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
        // WA returned null — media unavailable (expired / REUPLOADING stage).
        lastErr = new Error(
          `downloadMedia() returned ${media === null ? 'null' : 'undefined'} — media unavailable`,
        );
        logger.warn(`[media] download attempt ${attempt} — null result (media unavailable)`, {
          id:   msg.id?._serialized,
          from: msg.from,
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

      // Detect stale Puppeteer execution context.
      // Call reportClientFailure() at most once per download sequence — it
      // checks browser health internally and only schedules a restart when
      // the browser/page is confirmed dead.  Each restaurant's client is
      // restarted independently; this never affects other restaurants.
      if (!staleContextReported && STALE_CONTEXT_RE.test(errMsg)) {
        staleContextReported = true;
        logger.warn('[media] restarting client after repeated download failures', {
          restaurantId,
          id:      msg.id?._serialized,
          attempt,
          errName,
          errMsg,
        });
        // Fire-and-forget: reconnect happens asynchronously; we continue
        // retrying in case the page recovers without a full restart.
        reportClientFailure(restaurantId, err).catch((e: unknown) => {
          logger.error('[media] reportClientFailure threw', {
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }
    }

    // Wait before the next retry (no wait after the final attempt).
    if (attempt < totalAttempts) {
      const delay = RETRY_DELAYS_MS[attempt - 1];
      logger.info(`[media] waiting ${delay}ms before next attempt`, {
        nextAttempt: attempt + 1,
      });
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  // ── All attempts exhausted — capture full diagnostic snapshot ────────────
  const diag = await getBrowserDiagnostics(restaurantId);

  logger.error('[media] all download attempts failed — full diagnostic snapshot', {
    id:         msg.id?._serialized,
    from:       msg.from,
    fromSuffix: msg.from?.includes('@lid')  ? '@lid'
              : msg.from?.includes('@c.us') ? '@c.us'
              : 'other',
    attempts: totalAttempts,

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

    // Root-cause guide:
    //   "r: r" + browser.connected=true + clientIsReady=true
    //     → WA CDN/media-key failure inside downloadAndMaybeDecrypt (not a crash).
    //       Check fromSuffix: @lid accounts are more likely to hit the media-key bug.
    //   TargetCloseError / "Execution context was destroyed"
    //     → Puppeteer page died mid-evaluate; restart was triggered above.
    //   browser.connected=false
    //     → Chromium crashed; reconnect triggered by the browser-disconnect listener.
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
    type: msg.type,
  });

  if (msg.type === MessageTypes.IMAGE) {
    // Log all message fields before touching downloadMedia() so failures can
    // be root-caused purely from logs.
    logPreDownloadDiagnostics(msg);

    const media = await downloadMediaWithRetry(msg, restaurantId);

    if (!media) {
      // All inline retries failed.  Enqueue for background retry (never discard).
      enqueueMedia(restaurantId, msg, customerPhone, timestamp);
      return;
    }

    logger.info('[media] before storeMedia');
    const imageUrl = await storeMedia(restaurantId, media, timestamp);
    logger.info('[media] after storeMedia');

    // Webhook delivery is never retried — only the download is resilient.
    logger.info('[media] before sendWebhook (image)');
    await sendWebhook({ restaurantId, customerPhone, messageType: 'image', imageUrl, timestamp });
    logger.info('[media] after sendWebhook (image)');

    logger.info('[media] before sendPaymentScreenshotWebhook');
    await sendPaymentScreenshotWebhook({ restaurantId, customerPhone, imageUrl, timestamp });
    logger.info('[media] after sendPaymentScreenshotWebhook');
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
