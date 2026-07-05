import { Request, Response } from 'express';
import { MessageMedia } from 'whatsapp-web.js';
import { getReadyClient, reportClientFailure } from '../services/whatsappClient';
import config from '../config';
import logger from '../utils/logger';

interface SendMediaBody {
  restaurantId: number;
  phone: string;
  imageBase64: string;
  mimeType?: string;
  caption?: string;
}

export async function sendMedia(req: Request, res: Response): Promise<void> {
  const {
    restaurantId,
    phone,
    imageBase64,
    mimeType = 'image/png',
    caption = '',
  }: Partial<SendMediaBody> = req.body;

  if (!restaurantId || typeof restaurantId !== 'number') {
    res.status(400).json({ success: false, error: 'restaurantId (number) is required' });
    return;
  }
  if (!phone || typeof phone !== 'string') {
    res.status(400).json({ success: false, error: 'phone (string) is required' });
    return;
  }
  if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.trim() === '') {
    res.status(400).json({ success: false, error: 'imageBase64 (non-empty string) is required' });
    return;
  }

  const normalised = phone.replace(/[^\d]/g, '');
  if (normalised.length < 10) {
    res.status(400).json({ success: false, error: 'Invalid phone number format' });
    return;
  }
  const chatId = `${normalised}@c.us`;

  try {
    getReadyClient(restaurantId);
  } catch (err) {
    res.status(409).json({
      success: false,
      error: (err as Error).message,
      hint: 'Ensure the restaurant has a connected WhatsApp session',
    });
    return;
  }

  const media = new MessageMedia(mimeType, imageBase64, 'payment-bill.png');

  const maxAttempts = config.messageRetryAttempts;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let client;
    try {
      // Re-fetch on every attempt so a mid-retry reconnect (triggered by
      // reportClientFailure below) is picked up instead of reusing a client
      // whose Puppeteer page/frame has already died.
      client = getReadyClient(restaurantId);
    } catch (err) {
      lastError = err as Error;
      logger.warn(`Client unavailable on attempt ${attempt}/${maxAttempts}`, {
        restaurantId,
        to: normalised,
        error: lastError.message,
      });
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      break;
    }

    try {
      await client.sendMessage(chatId, media, { caption: caption.trim() });
      logger.info(`Media sent`, { restaurantId, to: normalised, attempt });
      res.json({ success: true, message: 'Media sent', restaurantId, to: normalised });
      return;
    } catch (err) {
      lastError = err as Error;
      logger.warn(`Media send attempt ${attempt}/${maxAttempts} failed`, {
        restaurantId,
        to: normalised,
        error: lastError.message,
      });
      await reportClientFailure(restaurantId, lastError);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  res.status(500).json({
    success: false,
    error: 'Failed to send media after retries',
    detail: lastError?.message,
  });
}
