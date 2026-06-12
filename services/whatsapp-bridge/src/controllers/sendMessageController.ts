import { Request, Response } from 'express';
import { getReadyClient } from '../services/whatsappClient';
import config from '../config';
import logger from '../utils/logger';

interface SendMessageBody {
  restaurantId: number;
  phone: string;
  message: string;
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const { restaurantId, phone, message }: Partial<SendMessageBody> = req.body;

  if (!restaurantId || typeof restaurantId !== 'number') {
    res.status(400).json({ success: false, error: 'restaurantId (number) is required' });
    return;
  }
  if (!phone || typeof phone !== 'string') {
    res.status(400).json({ success: false, error: 'phone (string) is required' });
    return;
  }
  if (!message || typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ success: false, error: 'message (non-empty string) is required' });
    return;
  }

  const normalised = phone.replace(/[^\d]/g, '');
  if (normalised.length < 10) {
    res.status(400).json({ success: false, error: 'Invalid phone number format' });
    return;
  }
  const chatId = `${normalised}@c.us`;

  let client;
  try {
    client = getReadyClient(restaurantId);
  } catch (err) {
    res.status(409).json({
      success: false,
      error: (err as Error).message,
      hint: 'Ensure the restaurant has a connected WhatsApp session',
    });
    return;
  }

  const maxAttempts = config.messageRetryAttempts;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.sendMessage(chatId, message.trim());
      logger.info(`Message sent`, { restaurantId, to: normalised, attempt });
      res.json({ success: true, message: 'Message sent', restaurantId, to: normalised });
      return;
    } catch (err) {
      lastError = err as Error;
      logger.warn(`Send attempt ${attempt}/${maxAttempts} failed`, {
        restaurantId,
        to: normalised,
        error: lastError.message,
      });
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  res.status(500).json({
    success: false,
    error: 'Failed to send message after retries',
    detail: lastError?.message,
  });
}
