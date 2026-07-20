/**
 * In-memory retry queue for WhatsApp media downloads.
 *
 * When all inline download attempts fail, the message is placed here.
 * A background worker retries every 30 seconds until either the download
 * succeeds or the item exceeds its maximum lifetime (10 minutes).
 *
 * After a WhatsApp client restart the queued Message objects hold stale
 * references to the old pupPage.  The worker detects this and swaps in the
 * current active Client so downloadMedia() runs against the live browser
 * context.
 */

import util from 'util';
import { Client, Message } from 'whatsapp-web.js';
import logger from '../utils/logger';
import { storeMedia } from './imageStorage';
import { sendWebhook, sendPaymentScreenshotWebhook } from '../webhooks/webhookSender';

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

// ── State ──────────────────────────────────────────────────────────────────────

const queue: QueueItem[] = [];
let workerTimer: ReturnType<typeof setInterval> | null = null;

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Add a failed media message to the retry queue.
 *
 * Called by the inline download handler after all immediate retry attempts
 * have been exhausted.
 */
export function enqueueMedia(
  restaurantId:  number,
  msg:           Message,
  customerPhone: string,
  timestamp:     string,
): void {
  queue.push({
    restaurantId,
    msg,
    customerPhone,
    timestamp,
    enqueuedAt: Date.now(),
    attempts: 0,
  });

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
 * @param getClient - dependency-injected getter that returns the live Client
 *   for a given restaurant, or null if the client is not yet ready.
 *   Using DI here avoids a circular import:
 *   whatsappClient → incomingMessages → mediaQueue → whatsappClient
 */
export function startRetryWorker(
  getClient: (restaurantId: number) => Client | null,
): void {
  if (workerTimer !== null) return; // idempotent

  logger.info('[media] retry worker started');

  workerTimer = setInterval(() => {
    runWorkerTick(getClient).catch((err: unknown) => {
      logger.error('[media] retry worker tick threw unexpectedly', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack  : undefined,
      });
    });
  }, WORKER_INTERVAL_MS);
}

// ── Internal ───────────────────────────────────────────────────────────────────

async function runWorkerTick(
  getClient: (restaurantId: number) => Client | null,
): Promise<void> {
  if (queue.length === 0) return;

  // ── Step 1: expire old items ────────────────────────────────────────────────
  const now = Date.now();
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

  logger.info(`[media] retry worker tick — processing ${queue.length} queued item(s)`);

  // ── Step 2: attempt each queued item (iterate backwards so splice is safe) ──
  for (let i = queue.length - 1; i >= 0; i--) {
    const item = queue[i];
    item.attempts++;

    // Get the currently-active client for this restaurant.
    const activeClient = getClient(item.restaurantId);
    if (!activeClient) {
      logger.info('[media] client not ready — skipping item this tick', {
        id:           item.msg.id?._serialized,
        restaurantId: item.restaurantId,
        attempt:      item.attempts,
      });
      continue;
    }

    // If a client restart has occurred since the message was received, the
    // Message object's internal `client` property still points to the old
    // (dead) Client and its dead pupPage.  Swap it to the live Client so
    // downloadMedia() runs against the current browser context.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgInternal = item.msg as any;
    if (msgInternal.client !== activeClient) {
      logger.info('[media] swapping stale client reference on queued message', {
        id:           item.msg.id?._serialized,
        restaurantId: item.restaurantId,
      });
      msgInternal.client = activeClient;
    }

    logger.info('[media] retry worker attempting download', {
      id:           item.msg.id?._serialized,
      restaurantId: item.restaurantId,
      phone:        item.customerPhone,
      attempt:      item.attempts,
    });

    try {
      const media = await item.msg.downloadMedia();

      if (!media) {
        logger.warn('[media] retry failed — downloadMedia() returned null/undefined', {
          id:      item.msg.id?._serialized,
          attempt: item.attempts,
        });
        // Leave in queue to retry next tick (unless it ages out).
        continue;
      }

      // ── Success ────────────────────────────────────────────────────────────
      const imageUrl = await storeMedia(item.restaurantId, media, item.timestamp);

      await sendWebhook({
        restaurantId:  item.restaurantId,
        customerPhone: item.customerPhone,
        messageType:   'image',
        imageUrl,
        timestamp:     item.timestamp,
      });

      await sendPaymentScreenshotWebhook({
        restaurantId:  item.restaurantId,
        customerPhone: item.customerPhone,
        imageUrl,
        timestamp:     item.timestamp,
      });

      logger.info('[media] retry success', {
        id:           item.msg.id?._serialized,
        restaurantId: item.restaurantId,
        phone:        item.customerPhone,
        attempts:     item.attempts,
      });

      queue.splice(i, 1);

    } catch (err) {
      logger.warn('[media] retry failed', {
        id:           item.msg.id?._serialized,
        restaurantId: item.restaurantId,
        attempt:      item.attempts,
        isError:      err instanceof Error,
        errName:      err instanceof Error ? err.name    : typeof err,
        errMsg:       err instanceof Error ? err.message : String(err),
        stack:        err instanceof Error ? err.stack   : undefined,
        inspected:    util.inspect(err, { depth: 10 }),
      });
      // Leave in queue to retry next tick.
    }
  }
}
