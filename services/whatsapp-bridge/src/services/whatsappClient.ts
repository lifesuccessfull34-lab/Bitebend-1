import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import { Server as SocketIOServer } from 'socket.io';
import config from '../config';
import logger from '../utils/logger';
import { getSessionDataPath, deleteSessionFiles } from './fileSessionStore';
import { handleIncomingMessage } from '../webhooks/incomingMessages';

export type ClientStatus =
  | 'initialising'
  | 'qr_pending'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'auth_failed';

interface ManagedClient {
  restaurantId: number;
  client: Client;
  status: ClientStatus;
  retryCount: number;
}

const clients = new Map<number, ManagedClient>();
let io: SocketIOServer | null = null;

const MAX_AUTO_RECONNECT = 3;

export function setSocketIO(socketServer: SocketIOServer): void {
  io = socketServer;
}

export async function initClient(restaurantId: number): Promise<void> {
  if (clients.has(restaurantId)) {
    const existing = clients.get(restaurantId)!;
    if (existing.status === 'connected' || existing.status === 'connecting') {
      logger.info(`Client for restaurant ${restaurantId} already active (${existing.status})`);
      return;
    }
    await destroyClient(restaurantId, false);
  }

  logger.info(`Initialising WhatsApp client for restaurant ${restaurantId}`);

  const dataPath = getSessionDataPath(restaurantId);

  const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu',
  ];

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: `restaurant_${restaurantId}`,
      dataPath,
    }),
    puppeteer: {
      headless: true,
      args: puppeteerArgs,
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {}),
    },
  });

  const managed: ManagedClient = {
    restaurantId,
    client,
    status: 'initialising',
    retryCount: 0,
  };

  clients.set(restaurantId, managed);
  attachEventHandlers(managed);

  try {
    await client.initialize();
  } catch (err) {
    logger.error(`client.initialize() threw for restaurant ${restaurantId}`, {
      error: (err as Error).message,
    });
    managed.status = 'auth_failed';
    emitStatus(restaurantId, 'auth_failed');
    clients.delete(restaurantId);
    throw err;
  }
}

function attachEventHandlers(managed: ManagedClient): void {
  const { client, restaurantId } = managed;

  client.on('qr', (qr) => {
    managed.status = 'qr_pending';
    logger.info(`QR generated for restaurant ${restaurantId}`);
    io?.to(`restaurant_${restaurantId}`).emit('whatsapp:qr', { restaurantId, qr });
    emitStatus(restaurantId, 'qr_pending');
  });

  client.on('authenticated', () => {
    managed.status = 'connecting';
    logger.info(`Restaurant ${restaurantId} authenticated`);
    emitStatus(restaurantId, 'connecting');
  });

  client.on('auth_failure', (msg) => {
    managed.status = 'auth_failed';
    logger.error(`Auth failure for restaurant ${restaurantId}: ${msg}`);
    emitStatus(restaurantId, 'auth_failed');
    deleteSessionFiles(restaurantId);
    clients.delete(restaurantId);
  });

  client.on('ready', () => {
    managed.status = 'connected';
    managed.retryCount = 0;
    logger.info(`WhatsApp ready for restaurant ${restaurantId}`);
    emitStatus(restaurantId, 'connected');
  });

  client.on('disconnected', async (reason) => {
    managed.status = 'disconnected';
    logger.warn(`Restaurant ${restaurantId} disconnected: ${reason}`);
    emitStatus(restaurantId, 'disconnected');

    if (managed.retryCount < MAX_AUTO_RECONNECT && reason !== 'LOGOUT') {
      managed.retryCount++;
      const delay = managed.retryCount * 5_000;
      logger.info(
        `Auto-reconnect attempt ${managed.retryCount}/${MAX_AUTO_RECONNECT} for restaurant ${restaurantId} in ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
      if (clients.get(restaurantId) === managed) {
        await initClient(restaurantId);
      }
    } else {
      logger.warn(`Restaurant ${restaurantId} requires manual reconnect (QR scan)`);
      clients.delete(restaurantId);
    }
  });

  client.on('message', async (msg: Message) => {
    try {
      await handleIncomingMessage(restaurantId, msg);
    } catch (err) {
      logger.error(`Error handling incoming message for restaurant ${restaurantId}`, {
        error: (err as Error).message,
      });
    }
  });
}

export function getClientStatus(restaurantId: number): ClientStatus | 'not_initialised' {
  return clients.get(restaurantId)?.status ?? 'not_initialised';
}

export function getReadyClient(restaurantId: number): Client {
  const managed = clients.get(restaurantId);
  if (!managed) throw new Error(`No client found for restaurant ${restaurantId}`);
  if (managed.status !== 'connected')
    throw new Error(`WhatsApp not connected for restaurant ${restaurantId} (status: ${managed.status})`);
  return managed.client;
}

export function getAllStatuses(): Record<number, ClientStatus | 'not_initialised'> {
  const result: Record<number, ClientStatus | 'not_initialised'> = {};
  for (const [id, managed] of clients.entries()) {
    result[id] = managed.status;
  }
  return result;
}

export async function destroyClient(restaurantId: number, wipeSession = true): Promise<void> {
  const managed = clients.get(restaurantId);
  if (!managed) return;

  try {
    await managed.client.destroy();
  } catch (err) {
    logger.warn(`Error destroying client for restaurant ${restaurantId}`, {
      error: (err as Error).message,
    });
  }

  if (wipeSession) deleteSessionFiles(restaurantId);
  clients.delete(restaurantId);
  logger.info(`Client destroyed for restaurant ${restaurantId}`);
}

function emitStatus(restaurantId: number, status: ClientStatus): void {
  io?.to(`restaurant_${restaurantId}`).emit('whatsapp:status', { restaurantId, status });
}
