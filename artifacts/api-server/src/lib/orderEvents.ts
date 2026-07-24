import type { Response } from "express";
import { logger } from "./logger";

interface OrderEventPayload {
  id: number;
  customerName: string | null;
  tableNumber: string | null;
  total: number;
  itemCount: number;
}

const connections = new Map<number, Set<Response>>();

export function addConnection(restaurantId: number, res: Response) {
  if (!connections.has(restaurantId)) {
    connections.set(restaurantId, new Set());
  }
  connections.get(restaurantId)!.add(res);
}

export function removeConnection(restaurantId: number, res: Response) {
  connections.get(restaurantId)?.delete(res);
  if (connections.get(restaurantId)?.size === 0) {
    connections.delete(restaurantId);
  }
}

export function emitOrderEvent(restaurantId: number, payload: OrderEventPayload) {
  const clients = connections.get(restaurantId);
  if (!clients || clients.size === 0) return;
  const data = JSON.stringify(payload);
  for (const res of clients) {
    try {
      res.write(`event: new-order\ndata: ${data}\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}

interface ScreenshotEventPayload {
  orderId: number;
  customerPhone: string;
  customerName: string | null;
  total: number;
}

export function emitScreenshotEvent(restaurantId: number, payload: ScreenshotEventPayload) {
  const clients = connections.get(restaurantId);
  if (!clients || clients.size === 0) return;
  const data = JSON.stringify(payload);
  for (const res of clients) {
    try {
      res.write(`event: screenshot-received\ndata: ${data}\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}

interface SessionScreenshotEventPayload {
  sessionId: number;
  billId: number;
  tableNumber: string;
  billNumber: string;
  total: number;
  customerPhone: string;
}

export function emitSessionScreenshotEvent(restaurantId: number, payload: SessionScreenshotEventPayload) {
  const clients = connections.get(restaurantId);
  const clientCount = clients?.size ?? 0;
  logger.info(
    { restaurantId, clientCount, sessionId: payload.sessionId, billId: payload.billId, tableNumber: payload.tableNumber },
    "[sse:emit] session-screenshot-received event fired"
  );
  if (!clients || clients.size === 0) return;
  const data = JSON.stringify(payload);
  for (const res of clients) {
    try {
      res.write(`event: session-screenshot-received\ndata: ${data}\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}
