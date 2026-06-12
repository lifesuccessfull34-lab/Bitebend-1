import { Request, Response } from 'express';
import { initClient, destroyClient, getClientStatus, getAllStatuses } from '../services/whatsappClient';
import logger from '../utils/logger';

export async function connectWhatsApp(req: Request, res: Response): Promise<void> {
  const restaurantId = parseInt(req.body.restaurantId, 10);
  if (!restaurantId || isNaN(restaurantId)) {
    res.status(400).json({ success: false, error: 'restaurantId is required' });
    return;
  }

  try {
    initClient(restaurantId).catch((err) => {
      logger.error(`Background init failed for restaurant ${restaurantId}`, { error: err.message });
    });
    res.json({ success: true, message: 'WhatsApp client initialising. Listen for QR via Socket.IO.', restaurantId });
  } catch (err) {
    logger.error('connectWhatsApp error', { error: (err as Error).message });
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function disconnectWhatsApp(req: Request, res: Response): Promise<void> {
  const restaurantId = parseInt(req.body.restaurantId, 10);
  if (!restaurantId || isNaN(restaurantId)) {
    res.status(400).json({ success: false, error: 'restaurantId is required' });
    return;
  }

  try {
    await destroyClient(restaurantId, true);
    res.json({ success: true, message: `Restaurant ${restaurantId} disconnected` });
  } catch (err) {
    logger.error('disconnectWhatsApp error', { error: (err as Error).message });
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export function getStatus(req: Request, res: Response): void {
  const restaurantId = parseInt(req.params.restaurantId, 10);
  if (!restaurantId || isNaN(restaurantId)) {
    res.status(400).json({ success: false, error: 'restaurantId is required' });
    return;
  }
  const status = getClientStatus(restaurantId);
  res.json({ success: true, restaurantId, status });
}

export function getAllStatus(_req: Request, res: Response): void {
  const statuses = getAllStatuses();
  res.json({ success: true, statuses });
}
