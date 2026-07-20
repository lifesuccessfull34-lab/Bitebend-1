import util from 'util';
import { Message, MessageTypes } from 'whatsapp-web.js';
import logger from '../utils/logger';
import { sendWebhook, sendPaymentScreenshotWebhook } from './webhookSender';
import { storeMedia } from '../services/imageStorage';
import { getBrowserDiagnostics } from '../services/whatsappClient';

const IMAGE_URL_REGEX = /https?:\/\/[^\s]+\.(jpe?g|png)/i;

// ── Root-cause note ────────────────────────────────────────────────────────────
//
// The "r: r" error seen in production ("ExecutionContext.evaluate … r: r") is
// Puppeteer re-serializing a plain WA-internal JS object thrown inside
// pupPage.evaluate().  Specifically, `downloadAndMaybeDecrypt` throws
// { r: 'r' } — WA's internal "retry" or "error" response code — instead of
// a real Error.  Puppeteer serialises a non-Error thrown value as
// "Error: <key>: <value>" pairs, producing the misleading "Error: r: r".
//
// The WhatsApp page / Chromium browser is ALIVE when this happens; the failure
// is entirely inside WA's own JS executing in the browser sandbox.
//
// Known triggers (in order of likelihood):
//   1. Media expired on WA's CDN before the bridge could fetch it.
//      (mediaStage stays FETCHING / REUPLOADING; WA returns a retry code.)
//   2. @lid multi-device accounts: directPath / mediaKey may arrive in a format
//      that the installed version of whatsapp-web.js does not yet decrypt
//      correctly, causing downloadAndMaybeDecrypt to throw internally.
//   3. Transient network failure inside Chromium's fetch context.
//
// The retry wrapper below handles cases 1 & 3.  Pre-download logging of all
// message fields lets us distinguish case 2 by correlating the JID suffix
// (@lid vs @c.us) against the failure rate once we have enough data.
//
// whatsapp-web.js 1.34.7 is the latest stable release as of this change.
// No upgrade is available that resolves the @lid issue definitively.
// ──────────────────────────────────────────────────────────────────────────────

const DOWNLOAD_MAX_ATTEMPTS = 3;
const DOWNLOAD_RETRY_DELAY_MS = 1_000;

/**
 * Resolve the sender's real phone number from a WhatsApp message.
 *
 * WhatsApp-web.js exposes two JID formats for msg.from:
 *
 *   @c.us  — classic format: "917086670033@c.us"
 *            Strip the suffix → "917086670033"
 *
 *   @lid   — Linked Device ID, used by newer WhatsApp accounts that have enabled
 *            the new multi-device architecture: "268641748652129@lid"
 *            This is an internal WA identifier, NOT a phone number.
 *            Must be resolved via msg.getContact() to get the real number.
 *
 * Sending the raw @lid string to the API causes normalization to fail (422)
 * because the digit sequence (15 chars) matches none of the expected Indian
 * phone formats (10 / 12 / 11 digits).
 */
async function resolvePhone(msg: Message): Promise<string> {
  const raw = msg.from;

  if (raw.endsWith('@c.us')) {
    return raw.replace('@c.us', '');
  }

  if (raw.endsWith('@lid')) {
    try {
      const contact = await msg.getContact();
      // contact.number is the phone without '+', e.g. "917086670033"
      // contact.id.user is the same value but falls back to the LID user part
      const resolved = contact.number || contact.id.user;
      logger.debug(`Resolved @lid ${raw} → phone ${resolved}`);
      return resolved;
    } catch (err) {
      logger.warn(`Could not resolve @lid to phone: ${raw}`, {
        error: (err as Error).message,
      });
      // Fall through: return the user part of the JID — the API will 422
      // but this is better than silently dropping the message
      return raw.split('@')[0];
    }
  }

  // Any other suffix (@g.us for groups, etc.) — extract the user part
  return raw.split('@')[0];
}

/**
 * Log all diagnostic properties of the message before attempting downloadMedia().
 *
 * This lets us correlate the @lid / @c.us JID type with the failure rate and
 * confirm whether the mediaKey / directPath fields are populated, which is the
 * key indicator for the @lid multi-device media issue.
 */
function logPreDownloadDiagnostics(msg: Message): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = msg as any;
  logger.info('[media:diag] Pre-download message properties', {
    hasMedia:        msg.hasMedia,
    type:            msg.type,
    id:              msg.id?._serialized ?? msg.id,
    from:            msg.from,
    fromSuffix:      msg.from?.includes('@lid') ? '@lid' : msg.from?.includes('@c.us') ? '@c.us' : 'other',
    timestamp:       msg.timestamp,
    isForwarded:     msg.isForwarded,
    hasQuotedMsg:    msg.hasQuotedMsg,
    // mediaKey is present on the raw WA message object but not typed in the
    // whatsapp-web.js Message class; access via any.
    mediaKey:        raw.mediaKey           ?? null,
    mediaKeyTimestamp: raw.mediaKeyTimestamp ?? null,
    directPath:      raw.directPath         ?? null,
    mediaStage:      raw.mediaData?.mediaStage ?? null,
    mimetype:        raw.mimetype            ?? null,
    filesize:        raw.filesize            ?? null,
  });
}

/**
 * Attempt msg.downloadMedia() up to DOWNLOAD_MAX_ATTEMPTS times.
 *
 * Logs every attempt.  On final failure, collects a full diagnostic snapshot
 * (complete error object, browser/page health, client READY status) so the
 * root cause can be determined from logs alone without further instrumentation.
 *
 * Returns the MessageMedia on success, or throws on final failure.
 */
async function downloadMediaWithRetry(
  msg: Message,
  restaurantId: number,
): Promise<NonNullable<Awaited<ReturnType<Message['downloadMedia']>>>> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= DOWNLOAD_MAX_ATTEMPTS; attempt++) {
    logger.info(`[media:download] Attempt ${attempt}/${DOWNLOAD_MAX_ATTEMPTS}`, {
      id:   msg.id?._serialized,
      from: msg.from,
    });

    try {
      const media = await msg.downloadMedia();

      if (!media) {
        // downloadMedia() returned null/undefined — WA says the media is
        // unavailable (e.g. mediaStage = REUPLOADING).  Treat as a retryable
        // soft failure.
        const softErr = new Error(
          `downloadMedia() returned ${media === null ? 'null' : 'undefined'} — media unavailable or expired`,
        );
        logger.warn(`[media:download] Soft failure on attempt ${attempt}/${DOWNLOAD_MAX_ATTEMPTS}`, {
          id:   msg.id?._serialized,
          from: msg.from,
          result: String(media),
        });
        lastErr = softErr;
      } else {
        logger.info(
          `[media:download] Success on attempt ${attempt}/${DOWNLOAD_MAX_ATTEMPTS}`,
          { id: msg.id?._serialized, mimetype: media.mimetype, size: media.data?.length ?? 0 },
        );
        return media;
      }
    } catch (err) {
      lastErr = err;
      logger.warn(`[media:download] Exception on attempt ${attempt}/${DOWNLOAD_MAX_ATTEMPTS}`, {
        id:        msg.id?._serialized,
        from:      msg.from,
        // Log isError / name / message for quick human scanning.
        isError:   err instanceof Error,
        errName:   err instanceof Error ? err.name   : typeof err,
        errMsg:    err instanceof Error ? err.message : String(err),
        // Full deep-inspection so that non-Error thrown values (e.g. WA's {r:'r'})
        // are captured verbatim — this is the primary tool for diagnosing the
        // "r: r" class of failures.
        inspected: util.inspect(err, { depth: 10 }),
      });
    }

    if (attempt < DOWNLOAD_MAX_ATTEMPTS) {
      logger.info(
        `[media:download] Waiting ${DOWNLOAD_RETRY_DELAY_MS}ms before retry…`,
        { nextAttempt: attempt + 1 },
      );
      await new Promise<void>((resolve) => setTimeout(resolve, DOWNLOAD_RETRY_DELAY_MS));
    }
  }

  // ── All attempts exhausted — capture full diagnostics ──────────────────────
  const diag = await getBrowserDiagnostics(restaurantId);

  logger.error('[media:download] All attempts failed — full diagnostic snapshot', {
    id:               msg.id?._serialized,
    from:             msg.from,
    fromSuffix:       msg.from?.includes('@lid') ? '@lid' : msg.from?.includes('@c.us') ? '@c.us' : 'other',
    attempts:         DOWNLOAD_MAX_ATTEMPTS,

    // Complete error capture
    finalError: {
      isError:   lastErr instanceof Error,
      name:      lastErr instanceof Error ? lastErr.name    : typeof lastErr,
      message:   lastErr instanceof Error ? lastErr.message : String(lastErr),
      stack:     lastErr instanceof Error ? lastErr.stack   : undefined,
      // util.inspect at depth 10 captures non-Error thrown values verbatim,
      // e.g. the {r: 'r'} WA internal retry object serialised by Puppeteer
      // as "Error: r: r".
      inspected: util.inspect(lastErr, { depth: 10 }),
    },

    // Browser / page health snapshot
    browser: {
      connected:    diag.browserConnected,
      pageClosed:   diag.pageClosed,
      pageUrl:      diag.pageUrl,
      clientStatus: diag.clientStatus,
      // If clientStatus !== 'connected', the WA client is not READY — this is a
      // separate problem from the media download failure and should be investigated
      // independently.
      clientIsReady: diag.clientStatus === 'connected',
    },

    // Root-cause guide:
    //   "r: r" with browser.connected=true, pageClosed=false, clientIsReady=true
    //     → WA CDN / media-key issue inside downloadAndMaybeDecrypt (not a crash)
    //       Check fromSuffix: @lid accounts are more likely to hit the media-key bug.
    //   finalError.name = "TargetCloseError" / "Execution context was destroyed"
    //     → Puppeteer page died mid-evaluate; browser health will show the cause.
    //   browser.connected=false
    //     → Chromium crashed; reconnect will be triggered by the browser listener.
  });

  throw lastErr;
}

export async function handleIncomingMessage(restaurantId: number, msg: Message): Promise<void> {
  if (msg.fromMe) return;

  const customerPhone = await resolvePhone(msg);
  const timestamp = new Date(msg.timestamp * 1000).toISOString();

  logger.info(`Incoming message from ${customerPhone} → restaurant ${restaurantId}`, {
    rawFrom: msg.from,
    type: msg.type,
  });

  if (msg.type === MessageTypes.IMAGE) {
    let imageUrl: string;
    try {
      // Step 1: log all relevant message properties before touching downloadMedia().
      // This gives us the full picture if the download fails, without having to
      // reproduce the message in a test environment.
      logPreDownloadDiagnostics(msg);

      // Step 2: attempt download with retries and full per-attempt logging.
      const media = await downloadMediaWithRetry(msg, restaurantId);

      logger.info('[media] before storeMedia');
      imageUrl = await storeMedia(restaurantId, media, timestamp);
      logger.info('[media] after storeMedia');
    } catch (err) {
      // downloadMediaWithRetry already logged the per-attempt details and the
      // final diagnostic snapshot.  Log a concise summary here so operators
      // can grep for "Image download failed" as a single-line signal.
      logger.error('Image download failed — see [media:download] entries above for root cause', {
        restaurantId,
        phone: customerPhone,
        rawFrom: msg.from,
      });
      return;
    }

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
      logger.info('[media] before sendWebhook (text-image-url)');
      await sendWebhook({ restaurantId, customerPhone, messageType: 'image', imageUrl, timestamp });
      logger.info('[media] after sendWebhook (text-image-url)');
      logger.info('[media] before sendPaymentScreenshotWebhook (text-image-url)');
      await sendPaymentScreenshotWebhook({ restaurantId, customerPhone, imageUrl, timestamp });
      logger.info('[media] after sendPaymentScreenshotWebhook (text-image-url)');
      return;
    }

    logger.info('[media] before sendWebhook (text)');
    await sendWebhook({ restaurantId, customerPhone, messageType: 'text', text: msg.body, timestamp });
    logger.info('[media] after sendWebhook (text)');
    return;
  }

  logger.debug(`Skipping unsupported message type: ${msg.type} from ${customerPhone}`);
}
