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

// ── Types ──────────────────────────────────────────────────────────────────────

export type ClientStatus =
  | 'initialising'
  | 'qr_pending'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'auth_failed';

// Classification of Puppeteer/WA errors so callers can decide how to react.
// browser_closed → full client rebuild required.
// detached_frame / timeout / protocol → transient; check browser health first.
// wa_disconnected → WA-level logout, not a Puppeteer crash.
export type ErrorKind =
  | 'timeout'
  | 'detached_frame'
  | 'browser_closed'
  | 'protocol'
  | 'wa_disconnected'
  | 'unknown';

interface ManagedClient {
  restaurantId: number;
  client: Client;
  status: ClientStatus;
  retryCount: number;
  /** Last QR string received, kept so late Socket.IO joiners can receive it immediately. */
  lastQr?: string;
}

// ── State ──────────────────────────────────────────────────────────────────────

const clients = new Map<number, ManagedClient>();
/** Prevents concurrent reconnect loops for the same restaurant. */
const reconnectingIds = new Set<number>();
let io: SocketIOServer | null = null;

const MAX_AUTO_RECONNECT = 5;

// ── Helpers ────────────────────────────────────────────────────────────────────

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Exponential backoff: 5 s → 10 s → 20 s → 40 s → 60 s (capped). */
function backoffMs(attempt: number): number {
  return Math.min(5_000 * Math.pow(2, attempt - 1), 60_000);
}

/**
 * Classify a Puppeteer/WA error so the reconnect logic can decide
 * whether a full client rebuild is actually needed.
 */
export function classifyError(error: unknown): ErrorKind {
  const msg = errMsg(error);
  if (/timed?\s*out|timeout/i.test(msg))                                          return 'timeout';
  if (/detached\s*frame|execution context was destroyed/i.test(msg))              return 'detached_frame';
  if (/target\s*closed|TargetCloseError|browser.*clos|session\s*closed/i.test(msg)) return 'browser_closed';
  if (/protocol\s*error/i.test(msg))                                              return 'protocol';
  return 'unknown';
}

// Patterns that indicate the failure might be recoverable without losing the WA session.
const RECOVERABLE_ERROR_PATTERNS = [
  /Attempted to use detached Frame/i,
  /Execution context was destroyed/i,
  /Session closed/i,
  /Protocol error/i,
  /Target closed/i,
  /TargetCloseError/i,
  /timed?\s*out/i,
];

export function isRecoverableClientFailure(error: unknown): boolean {
  const message = errMsg(error);
  return RECOVERABLE_ERROR_PATTERNS.some((p) => p.test(message));
}

/**
 * Check whether the underlying Puppeteer browser and page are still alive.
 * Returns false on any access error (treats uncertainty as dead).
 */
async function isBrowserHealthy(client: Client): Promise<boolean> {
  try {
    // whatsapp-web.js exposes pupBrowser and pupPage as public properties.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const browser = (client as any).pupBrowser;
    if (!browser || !browser.isConnected()) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = (client as any).pupPage;
    if (!page || page.isClosed()) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely destroy a whatsapp-web.js client.
 * TargetCloseError and ProtocolError are expected when the browser is already
 * dead — log them and continue rather than letting them propagate.
 */
async function safeDestroy(client: Client, restaurantId: number): Promise<void> {
  // First, attempt to close the page gracefully so destroy() doesn't trip over
  // an already-closed target.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = (client as any).pupPage;
    if (page && !page.isClosed()) {
      await page.close().catch(() => { /* ignore */ });
    }
  } catch { /* ignore page.close errors */ }

  try {
    await client.destroy();
  } catch (err) {
    const msg = errMsg(err);
    if (/TargetCloseError|Target closed|Protocol error|Session closed/i.test(msg)) {
      // Expected when Chromium crashed/exited before destroy() was called.
      logger.warn(`[wa] Expected error destroying client for restaurant ${restaurantId} (browser was already dead): ${msg}`);
    } else {
      logger.warn(`[wa] Unexpected error destroying client for restaurant ${restaurantId}: ${msg}`);
    }
  }
}

function emitStatus(restaurantId: number, status: ClientStatus): void {
  io?.to(`restaurant_${restaurantId}`).emit('whatsapp:status', { restaurantId, status });
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function setSocketIO(socketServer: SocketIOServer): void {
  io = socketServer;
}

export function getClientStatus(restaurantId: number): ClientStatus | 'not_initialised' {
  return clients.get(restaurantId)?.status ?? 'not_initialised';
}

/**
 * Return the most recent QR string for a restaurant if the client is in
 * qr_pending state, or undefined otherwise.  Used to re-deliver QR to
 * Socket.IO sockets that join the room after the QR was originally emitted.
 */
export function getPendingQr(restaurantId: number): string | undefined {
  const managed = clients.get(restaurantId);
  if (managed?.status === 'qr_pending') return managed.lastQr;
  return undefined;
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

  await safeDestroy(managed.client, restaurantId);

  clients.delete(restaurantId);
  reconnectingIds.delete(restaurantId);

  // Only wipe session files when explicitly requested (user-initiated disconnect).
  // Internal teardown before a reconnect always passes wipeSession=false so that
  // LocalAuth can reuse the existing session without requiring a new QR scan.
  if (wipeSession) {
    deleteSessionFiles(restaurantId);
    logger.info(`[wa] Client destroyed and session wiped for restaurant ${restaurantId}`);
  } else {
    logger.info(`[wa] Client destroyed (session kept) for restaurant ${restaurantId}`);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────────

export async function initClient(restaurantId: number): Promise<void> {
  if (clients.has(restaurantId)) {
    const existing = clients.get(restaurantId)!;
    if (existing.status === 'connected' || existing.status === 'connecting') {
      logger.info(`[wa] Client for restaurant ${restaurantId} already active (${existing.status})`);
      return;
    }
    // Tear down the dead client, keeping session files so LocalAuth can reuse them.
    await destroyClient(restaurantId, false);
  }

  logger.info(`[wa] Initialising WhatsApp client for restaurant ${restaurantId}`);

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
      // Raise CDP protocol timeout from the default 30 s to 5 min.
      // This prevents Runtime.callFunctionOn timeouts from destroying
      // healthy clients during brief slowdowns.
      protocolTimeout: 300_000,
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
  attachClientEventHandlers(managed);

  try {
    await client.initialize();
  } catch (err) {
    logger.error(`[wa] client.initialize() threw for restaurant ${restaurantId}`, {
      error: errMsg(err),
    });
    managed.status = 'auth_failed';
    emitStatus(restaurantId, 'auth_failed');
    clients.delete(restaurantId);
    throw err;
  }
}

// ── Event handlers ─────────────────────────────────────────────────────────────

function attachClientEventHandlers(managed: ManagedClient): void {
  const { client, restaurantId } = managed;

  client.on('qr', (qr) => {
    managed.status = 'qr_pending';
    managed.lastQr  = qr;   // cache so late Socket.IO joiners can receive it
    const room = `restaurant_${restaurantId}`;
    const roomSize = io?.sockets.adapter.rooms.get(room)?.size ?? 0;
    logger.info(`[wa:qr] QR generated for restaurant ${restaurantId} — length=${qr.length} room=${room} subscribers=${roomSize}`);
    io?.to(room).emit('whatsapp:qr', { restaurantId, qr });
    emitStatus(restaurantId, 'qr_pending');
    if (roomSize === 0) {
      logger.warn(`[wa:qr] No Socket.IO subscribers in room ${room} — QR cached in memory; will be re-delivered when a socket joins the room.`);
    }
  });

  client.on('authenticated', () => {
    managed.status = 'connecting';
    logger.info(`[wa] Restaurant ${restaurantId} authenticated`);
    emitStatus(restaurantId, 'connecting');
  });

  client.on('auth_failure', (msg) => {
    managed.status = 'auth_failed';
    managed.lastQr = undefined;   // QR is no longer valid
    logger.error(`[wa] Auth failure for restaurant ${restaurantId}: ${msg}`);
    emitStatus(restaurantId, 'auth_failed');
    // WhatsApp explicitly rejected the stored session — the files are no longer
    // valid, so delete them so the next initClient starts fresh with a new QR.
    deleteSessionFiles(restaurantId);
    clients.delete(restaurantId);
    reconnectingIds.delete(restaurantId);
  });

  client.on('ready', () => {
    managed.status = 'connected';
    managed.retryCount = 0;
    managed.lastQr = undefined;   // QR consumed — connection established
    // Clear the in-progress guard so future reconnects are allowed.
    reconnectingIds.delete(restaurantId);
    logger.info(`[wa] WhatsApp ready for restaurant ${restaurantId}`);
    emitStatus(restaurantId, 'connected');

    // Attach Puppeteer-level resilience listeners now that pupBrowser/pupPage exist.
    attachBrowserListeners(managed);
  });

  client.on('disconnected', async (reason) => {
    try {
      managed.status = 'disconnected';
      logger.warn(`[wa] Restaurant ${restaurantId} disconnected: ${reason}`);
      emitStatus(restaurantId, 'disconnected');

      // LOGOUT means the user removed this device from WhatsApp on their phone.
      // The stored session is gone — wipe files and stop; a fresh QR is needed.
      if (reason === 'LOGOUT') {
        logger.info(`[wa] Restaurant ${restaurantId} logged out — wiping session files`);
        deleteSessionFiles(restaurantId);
        clients.delete(restaurantId);
        reconnectingIds.delete(restaurantId);
        return;
      }

      // All other disconnect reasons (network blip, server restart, etc.) keep
      // session files intact so LocalAuth can reconnect without a new QR.
      await scheduleReconnect(managed, reason);
    } catch (err) {
      logger.error(`[wa] Error in disconnected handler for restaurant ${restaurantId}`, {
        error: errMsg(err),
      });
    }
  });

  client.on('message', async (msg: Message) => {
    try {
      await handleIncomingMessage(restaurantId, msg);
    } catch (err) {
      logger.error(`[wa] Error handling incoming message for restaurant ${restaurantId}`, {
        error: errMsg(err),
      });
    }
  });
}

/**
 * Attach Puppeteer browser- and page-level listeners.
 * Called from the 'ready' handler, at which point pupBrowser and pupPage
 * are guaranteed to be initialised.
 *
 * These listeners schedule reconnects when appropriate but never crash the
 * process — every async callback is wrapped in try/catch.
 */
function attachBrowserListeners(managed: ManagedClient): void {
  const { client, restaurantId } = managed;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const browser = (client as any).pupBrowser;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page   = (client as any).pupPage;

    if (browser) {
      // Fired by Puppeteer when the CDP connection to Chromium is lost.
      browser.on('disconnected', () => {
        try {
          logger.warn(`[wa] Puppeteer browser disconnected for restaurant ${restaurantId}`);
          if (managed.status === 'connected' || managed.status === 'connecting') {
            managed.status = 'disconnected';
            emitStatus(restaurantId, 'disconnected');
            scheduleReconnect(managed, 'BROWSER_DISCONNECTED').catch((err) => {
              logger.error(`[wa] Error scheduling reconnect after browser disconnect for restaurant ${restaurantId}`, {
                error: errMsg(err),
              });
            });
          }
        } catch (err) {
          logger.error(`[wa] Error in browser.disconnected handler for restaurant ${restaurantId}`, {
            error: errMsg(err),
          });
        }
      });

      // Fired when a CDP target (page, worker, …) is destroyed.
      // We log it for diagnostics but do not reconnect here — if the main
      // browser itself is dying, browser.disconnected will fire next.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      browser.on('targetdestroyed', (target: any) => {
        try {
          logger.debug(`[wa] CDP target destroyed for restaurant ${restaurantId}: ${target.type?.() ?? 'unknown'}`);
        } catch (err) {
          logger.error(`[wa] Error in targetdestroyed handler for restaurant ${restaurantId}`, {
            error: errMsg(err),
          });
        }
      });
    }

    if (page) {
      // Uncaught JS exception inside the WhatsApp Web page — usually harmless.
      page.on('error', (err: Error) => {
        try {
          logger.warn(`[wa] WhatsApp page error for restaurant ${restaurantId}: ${err.message}`);
          // Do not reconnect — page errors (uncaught exceptions in WA's JS)
          // rarely indicate the Puppeteer session is dead.
        } catch (e) {
          logger.error(`[wa] Error in page.error handler for restaurant ${restaurantId}`, {
            error: errMsg(e),
          });
        }
      });

      // The WhatsApp page itself was closed (distinct from the browser disconnecting).
      page.on('close', () => {
        try {
          logger.warn(`[wa] WhatsApp page closed for restaurant ${restaurantId}`);
          if (managed.status === 'connected' || managed.status === 'connecting') {
            managed.status = 'disconnected';
            emitStatus(restaurantId, 'disconnected');
            scheduleReconnect(managed, 'PAGE_CLOSED').catch((err) => {
              logger.error(`[wa] Error scheduling reconnect after page close for restaurant ${restaurantId}`, {
                error: errMsg(err),
              });
            });
          }
        } catch (err) {
          logger.error(`[wa] Error in page.close handler for restaurant ${restaurantId}`, {
            error: errMsg(err),
          });
        }
      });
    }
  } catch (err) {
    logger.error(`[wa] Failed to attach browser/page listeners for restaurant ${restaurantId}`, {
      error: errMsg(err),
    });
  }
}

// ── Reconnect ──────────────────────────────────────────────────────────────────

/**
 * Schedule a reconnect attempt with exponential backoff.
 *
 * Guards:
 * - Only one reconnect loop per restaurant at a time (reconnectingIds).
 * - Aborts if the client was replaced or removed during the backoff delay.
 * - Never deletes session files (session wipe only happens on LOGOUT / explicit disconnect).
 */
async function scheduleReconnect(managed: ManagedClient, reason: string): Promise<void> {
  const { restaurantId } = managed;

  if (reconnectingIds.has(restaurantId)) {
    logger.info(`[wa] Reconnect already in progress for restaurant ${restaurantId} — skipping duplicate (reason: ${reason})`);
    return;
  }

  if (managed.retryCount >= MAX_AUTO_RECONNECT) {
    logger.warn(
      `[wa] Restaurant ${restaurantId} exceeded max reconnect attempts (${MAX_AUTO_RECONNECT}) — waiting for manual reconnect`
    );
    clients.delete(restaurantId);
    reconnectingIds.delete(restaurantId);
    return;
  }

  managed.retryCount++;
  reconnectingIds.add(restaurantId);

  const delay = backoffMs(managed.retryCount);
  logger.info(
    `[wa] Reconnect attempt ${managed.retryCount}/${MAX_AUTO_RECONNECT} for restaurant ${restaurantId} in ${delay}ms (reason: ${reason})`
  );

  await new Promise<void>((r) => setTimeout(r, delay));

  // If another caller replaced or removed the client during the wait, abort.
  const current = clients.get(restaurantId);
  if (current !== managed && current !== undefined) {
    logger.info(`[wa] Client for restaurant ${restaurantId} was replaced during backoff — aborting reconnect`);
    reconnectingIds.delete(restaurantId);
    return;
  }

  try {
    // initClient tears down the dead client (wipeSession=false) then creates a
    // fresh one.  Because session files are preserved, LocalAuth will restore
    // the WA session automatically — no new QR scan required.
    await initClient(restaurantId);
  } catch (err) {
    logger.error(`[wa] initClient failed during reconnect for restaurant ${restaurantId}`, {
      error: errMsg(err),
    });
  } finally {
    // Success path: cleared in the 'ready' handler.
    // Failure path: clear here so future reconnects are not permanently blocked.
    reconnectingIds.delete(restaurantId);
  }
}

// ── Failure reporting (called by send controllers) ─────────────────────────────

/**
 * Called by sendMessage / sendMedia when a send attempt throws.
 *
 * Behaviour by error kind:
 * - timeout / detached_frame: check browser health first.
 *     - Browser still alive → transient CDP hiccup; log and return true so the
 *       caller retries without triggering a full client rebuild.
 *     - Browser dead → fall through to full reconnect.
 * - browser_closed / protocol / unknown: schedule a full reconnect immediately.
 *
 * Returns false if the error is not recoverable (caller should surface it).
 */
export async function reportClientFailure(restaurantId: number, error: unknown): Promise<boolean> {
  if (!isRecoverableClientFailure(error)) return false;

  const managed = clients.get(restaurantId);
  if (!managed) return false;
  // Another code path is already handling this — nothing to do.
  if (managed.status === 'disconnected') return false;

  const kind = classifyError(error);
  const msg  = errMsg(error);

  // For transient errors, verify the browser is actually dead before rebuilding.
  if (kind === 'timeout' || kind === 'detached_frame') {
    const healthy = await isBrowserHealthy(managed.client);
    if (healthy) {
      logger.warn(
        `[wa] Transient Puppeteer error for restaurant ${restaurantId} — browser is healthy, skipping reconnect`,
        { kind, error: msg }
      );
      // Return true: the error was acknowledged; caller should just retry.
      return true;
    }
  }

  // Browser is dead (or health check itself failed) → full reconnect.
  logger.error(
    `[wa] Dead Puppeteer page/frame detected for restaurant ${restaurantId} — scheduling reconnect`,
    { kind, error: msg }
  );

  managed.status = 'disconnected';
  emitStatus(restaurantId, 'disconnected');

  scheduleReconnect(managed, kind === 'browser_closed' ? 'BROWSER_CLOSED' : 'FRAME_DETACHED').catch((err) => {
    logger.error(`[wa] Error in scheduleReconnect triggered by reportClientFailure for restaurant ${restaurantId}`, {
      error: errMsg(err),
    });
  });

  return true;
}
