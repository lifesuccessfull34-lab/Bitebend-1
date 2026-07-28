import axios from 'axios';
import config from '../config';
import logger from '../utils/logger';

interface WebhookPayload {
  restaurantId: number;
  customerPhone: string;
  messageType: 'text' | 'image';
  text?: string;
  imageUrl?: string;
  timestamp: string;
}

interface PaymentScreenshotPayload {
  restaurantId: number;
  customerPhone: string;
  imageUrl: string;
  timestamp: string;
  /**
   * Raw msg.from JID from whatsapp-web.js at the moment the inbound image
   * arrived — e.g. "917086670033@c.us" or "268641748652129@lid".
   *
   * This is the same value that was stored in session_bills.chat_jid when
   * the bill was sent (captured from sentMsg.id.remote._serialized), so the
   * API server can do a deterministic Priority 0 lookup without relying on
   * phone normalisation or the number of concurrent pending bills.
   *
   * Optional: bridge versions that pre-date this field omit it and the API
   * server falls through to the existing phone-match / LID-fallback chain.
   */
  senderJid?: string;
}

export async function sendWebhook(payload: WebhookPayload): Promise<void> {
  const maxAttempts = config.webhookRetryAttempts;
  const baseDelay = config.webhookRetryDelayMs;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await axios.post(config.bitebendWebhookUrl, payload, {
        timeout: 10_000,
        headers: {
          'Content-Type': 'application/json',
          ...(config.bitebendWebhookSecret
            ? { 'x-webhook-secret': config.bitebendWebhookSecret }
            : {}),
        },
      });

      logger.info(`Webhook delivered to Bitebend`, {
        restaurantId: payload.restaurantId,
        phone: payload.customerPhone,
        type: payload.messageType,
        attempt,
      });
      return;
    } catch (err) {
      lastError = err;
      const status = axios.isAxiosError(err) ? err.response?.status : null;
      logger.warn(`Webhook attempt ${attempt}/${maxAttempts} failed`, {
        restaurantId: payload.restaurantId,
        status,
        error: (err as Error).message,
      });

      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  logger.error(`Webhook permanently failed after ${maxAttempts} attempts`, {
    restaurantId: payload.restaurantId,
    phone: payload.customerPhone,
    error: (lastError as Error)?.message,
  });
}

export async function sendPaymentScreenshotWebhook(payload: PaymentScreenshotPayload): Promise<void> {
  const maxAttempts = config.webhookRetryAttempts;
  const baseDelay = config.webhookRetryDelayMs;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await axios.post(config.bitebendPaymentScreenshotUrl, payload, {
        timeout: 15_000,
        headers: {
          'Content-Type': 'application/json',
          ...(config.bitebendWebhookSecret
            ? { 'x-webhook-secret': config.bitebendWebhookSecret }
            : {}),
        },
      });

      logger.info(`Payment screenshot webhook delivered`, {
        restaurantId: payload.restaurantId,
        phone: payload.customerPhone,
        attempt,
      });
      return;
    } catch (err) {
      lastError = err;
      const status = axios.isAxiosError(err) ? err.response?.status : null;
      logger.warn(`Payment screenshot webhook attempt ${attempt}/${maxAttempts} failed`, {
        restaurantId: payload.restaurantId,
        status,
        error: (err as Error).message,
      });

      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  logger.error(`Payment screenshot webhook permanently failed after ${maxAttempts} attempts`, {
    restaurantId: payload.restaurantId,
    phone: payload.customerPhone,
    error: (lastError as Error)?.message,
  });
}
