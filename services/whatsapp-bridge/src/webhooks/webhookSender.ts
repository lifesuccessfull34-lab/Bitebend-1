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
