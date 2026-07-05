import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import { Server as SocketIOServer } from 'socket.io';
import config from '../config';
import logger from '../utils/logger';
import { getSessionDataPath, deleteSessionFiles } from './fileSessionStore';
import { handleIncomingMessage } from '../webhooks/incomingMessages';

// ── Chromium auto-detection ────────────────────────────────────────────────────
// Precedence:
//   1. PUPPETEER_EXECUTABLE_PATH env var (explicit override)
//   2. `which chromium` / `which chromium-browser` / `which google-chrome`
//   3. Common Nix/Linux paths
//   4. undefined → puppeteer uses its bundled copy
const CHROMIUM_CANDIDATES = [
  '/nix/store',                  // trigger path-scan below
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/snap/bin/chromium',
];

function findChromiumPath(): string | undefined {
  // 1. Explicit override
  const explicit = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (explicit && existsSync(explicit)) return explicit;

  // 2. PATH lookup
  for (const candidate of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    try {
      const found = execSync(`which ${candidate} 2>/dev/null`, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
      if (found && existsSync(found)) return found;
    } catch { /* not in PATH */ }
  }

  // 3. Well-known paths
  for (const p of CHROMIUM_CANDIDATES) {
    if (p === '/nix/store') continue; // handled by `which` above
    if (existsSync(p)) return p;
  }

  return undefined;
}

export const CHROMIUM_PATH = findChromiumPath();

if (CHROMIUM_PATH) {
  logger.info(`[chromium] Using: ${CHROMIUM_PATH}`);
} else {
  logger.warn('[chromium] Not found in PATH or common locations — puppeteer will use its bundled version (may fail in headless environments)');
}

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
      ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
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
    await scheduleReconnect(managed, reason);
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

// ── Shared reconnect flow ──────────────────────────────────────────────────────
// Used both by the library's own 'disconnected' event and by reportClientFailure()
// below, so there is exactly one reconnect code path regardless of how the
// unhealthy state was detected.
async function scheduleReconnect(managed: ManagedClient, reason: string): Promise<void> {
  const { restaurantId } = managed;

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
}

// ── Detached-Frame / dead-page failure detection ───────────────────────────────
// whatsapp-web.js drives a real Puppeteer page. When that page silently reloads
// or navigates internally (a known upstream behaviour, independent of the
// auth/socket lifecycle), the cached Frame/execution context can die WITHOUT
// the library ever emitting a 'disconnected' event. status stays 'connected',
// so getReadyClient() keeps handing out a dead client. reportClientFailure()
// lets callers (e.g. sendMessage/sendMedia error handlers) report exactly this
// condition so it gets funnelled into the same reconnect flow as a normal
// disconnect.
const RECOVERABLE_ERROR_PATTERNS = [
  /Attempted to use detached Frame/i,
  /Execution context was destroyed/i,
  /Session closed/i,
  /Protocol error/i,
];

export function isRecoverableClientFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return RECOVERABLE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export async function reportClientFailure(restaurantId: number, error: unknown): Promise<boolean> {
  if (!isRecoverableClientFailure(error)) return false;

  const managed = clients.get(restaurantId);
  if (!managed) return false;

  // Already being torn down / reconnected by another path — nothing to do.
  if (managed.status === 'disconnected') return false;

  const message = error instanceof Error ? error.message : String(error);
  logger.error(
    `Detected dead Puppeteer page/frame for restaurant ${restaurantId} — forcing reconnect`,
    { error: message }
  );

  managed.status = 'disconnected';
  emitStatus(restaurantId, 'disconnected');

  await scheduleReconnect(managed, 'FRAME_DETACHED');
  return true;
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
