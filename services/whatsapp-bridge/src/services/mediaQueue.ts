/**
 * In-memory retry queue for WhatsApp media downloads.
 *
 * When all inline download attempts fail, the message is placed here.
 * A background worker retries every 30 seconds until either the download
 * succeeds or the item exceeds its maximum lifetime (10 minutes).
 *
 * Uses dependency injection for the download function so this module does not
 * import from whatsappClient.ts — avoiding the circular import chain:
 *   whatsappClient → incomingMessages → mediaQueue → whatsappClient
 */

import util from 'util';
import { Message, MessageMedia } from 'whatsapp-web.js';
import logger from '../utils/logger';
import { sendWebhook, sendPaymentScreenshotWebhook } from '../webhooks/webhookSender';
import type { MediaDownloadResult } from './whatsappClient';

// ── Constants ──────────────────────────────────────────────────────────────────

const QUEUE_MAX_AGE_MS   = 10 * 60 * 1_000; // 10 minutes
const WORKER_INTERVAL_MS = 30_000;           // 30 seconds

// ── Types ──────────────────────────────────────────────────────────────────────

interface QueueItem {
  restaurantId:  number;
  msg:           Message;
  customerPhone: string;
  timestamp:     string;
  enqueuedAt:    number;
  attempts:      number;
}

/** Injected download function — same signature as downloadMediaDirect. */
type DownloadFn = (restaurantId: number, msgId: string) => Promise<MessageMedia | MediaDownloadResult>;

// ── State ──────────────────────────────────────────────────────────────────────

const queue: QueueItem[] = [];
let workerTimer: ReturnType<typeof setInterval> | null = null;

// ── Public API ─────────────────────────────────────────────────────────────────

/** Add a failed media message to the retry queue. */
export function enqueueMedia(
  restaurantId:  number,
  msg:           Message,
  customerPhone: string,
  timestamp:     string,
): void {
  queue.push({ restaurantId, msg, customerPhone, timestamp, enqueuedAt: Date.now(), attempts: 0 });
  logger.info('[media] queued for retry', {
    id:          msg.id?._serialized,
    restaurantId,
    phone:       customerPhone,
    queueLength: queue.length,
  });
}

/**
 * Start the background retry worker.
 *
 * @param downloadMedia - injected download function (downloadMediaDirect from
 *   whatsappClient).  DI avoids a circular import; the caller (index.ts) wires it.
 */
export function startRetryWorker(downloadMedia: DownloadFn): void {
  if (workerTimer !== null) return;
  logger.info('[media] retry worker started');
  workerTimer = setInterval(() => {
    runWorkerTick(downloadMedia).catch((err: unknown) => {
      logger.error('[media] retry worker tick threw unexpectedly', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack   : undefined,
      });
    });
  }, WORKER_INTERVAL_MS);
}

// ── Internal ───────────────────────────────────────────────────────────────────

async function runWorkerTick(downloadMedia: DownloadFn): Promise<void> {
  if (queue.length === 0) return;

  const now = Date.now();

  // Expire items that have exceeded their maximum lifetime.
  for (let i = queue.length - 1; i >= 0; i--) {
    const item = queue[i];
    if (now - item.enqueuedAt > QUEUE_MAX_AGE_MS) {
      queue.splice(i, 1);
      logger.warn('[media] retry expired — dropping message (exceeded 10-minute lifetime)', {
        id:          item.msg.id?._serialized,
        restaurantId: item.restaurantId,
        phone:        item.customerPhone,
        attempts:     item.attempts,
        ageMs:        now - item.enqueuedAt,
      });
    }
  }

  if (queue.length === 0) return;
  logger.info(`[media] retry worker tick — ${queue.length} queued item(s)`);

  // Iterate backwards so splice() by index is safe.
  for (let i = queue.length - 1; i >= 0; i--) {
    const item = queue[i];
    item.attempts++;

    logger.info('[media] retry worker attempting download', {
      id:           item.msg.id?._serialized,
      restaurantId: item.restaurantId,
      phone:        item.customerPhone,
      attempt:      item.attempts,
    });

    try {
      const result = await downloadMedia(item.restaurantId, item.msg.id._serialized);

      if (!(result instanceof MessageMedia)) {
        // Structured failure from downloadMediaDirect.
        logger.warn('[media] retry failed', {
          id:      item.msg.id?._serialized,
          attempt: item.attempts,
          reason:  (result as MediaDownloadResult).ok === false
                   ? (result as MediaDownloadResult & { ok: false }).reason
                   : 'unknown',
          detail:  (result as MediaDownloadResult).ok === false
                   ? (result as MediaDownloadResult & { ok: false }).detail
                   : undefined,
        });
        continue; // leave in queue for next tick
      }

      // ── Success ────────────────────────────────────────────────────────────
      // Send base64 data URL directly — same as the hot path in incomingMessages.ts.
      const dataUrl = `data:${result.mimetype};base64,${result.data}`;

      await sendWebhook({
        restaurantId:  item.restaurantId,
        customerPhone: item.customerPhone,
        messageType:   'image',
        imageUrl:      dataUrl,
        timestamp:     item.timestamp,
      });
      await sendPaymentScreenshotWebhook({
        restaurantId:  item.restaurantId,
        customerPhone: item.customerPhone,
        imageUrl:      dataUrl,
        timestamp:     item.timestamp,
      });

      logger.info('[media] retry success', {
        id:           item.msg.id?._serialized,
        restaurantId: item.restaurantId,
        phone:        item.customerPhone,
        attempts:     item.attempts,
        imageUrl:     dataUrl.slice(0, 80) + '…',  // log prefix only — full base64 floods logs
      });

      queue.splice(i, 1);

    } catch (err) {
      logger.warn('[media] retry failed — unexpected exception', {
        id:        item.msg.id?._serialized,
        attempt:   item.attempts,
        error:     err instanceof Error ? err.message : String(err),
        inspected: util.inspect(err, { depth: 5 }),
      });
    }
  }
}
