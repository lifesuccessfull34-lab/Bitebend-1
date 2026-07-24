import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Client, LocalAuth, Message, MessageMedia } from 'whatsapp-web.js';
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

/** WhatsApp QR codes are valid for ~60 seconds. */
const QR_TTL_MS = 60_000;

interface QrCache {
  qr: string;
  generatedAt: Date;
  expiresAt: Date;
}

export interface QrStatus {
  status: ClientStatus | 'not_initialised';
  qr: string | null;
  generatedAt: string | null;
  expiresAt: string | null;
}

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
  /** Cached QR with expiry — kept so late Socket.IO joiners and REST polls receive it. */
  qrCache?: QrCache;
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
 * Return the full QR status for a restaurant — used by the REST endpoint.
 * Evicts expired cache entries lazily and logs the expiry.
 */
export function getQrStatus(restaurantId: number): QrStatus {
  const managed = clients.get(restaurantId);
  if (!managed) {
    return { status: 'not_initialised', qr: null, generatedAt: null, expiresAt: null };
  }

  // Lazy expiry check
  if (managed.qrCache && managed.qrCache.expiresAt < new Date()) {
    logger.info(`[qr:cache] QR expired for restaurant ${restaurantId} — clearing cache`);
    managed.qrCache = undefined;
    if (managed.status === 'qr_pending') managed.status = 'initialising';
  }

  const cache = managed.qrCache;
  return {
    status:      managed.status,
    qr:          cache?.qr          ?? null,
    generatedAt: cache?.generatedAt.toISOString() ?? null,
    expiresAt:   cache?.expiresAt.toISOString()   ?? null,
  };
}

/**
 * Return the cached QR string if the client is qr_pending and the QR has not
 * expired.  Used to re-deliver the QR to late-joining Socket.IO sockets.
 */
export function getPendingQr(restaurantId: number): string | undefined {
  const managed = clients.get(restaurantId);
  if (!managed?.qrCache) return undefined;
  if (managed.qrCache.expiresAt < new Date()) {
    logger.info(`[qr:cache] QR expired (getPendingQr) for restaurant ${restaurantId} — clearing cache`);
    managed.qrCache = undefined;
    return undefined;
  }
  if (managed.status === 'qr_pending') return managed.qrCache.qr;
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
    const now = new Date();
    managed.qrCache = { qr, generatedAt: now, expiresAt: new Date(now.getTime() + QR_TTL_MS) };
    const room = `restaurant_${restaurantId}`;
    const roomSize = io?.sockets.adapter.rooms.get(room)?.size ?? 0;
    logger.info(
      `[qr:cache] QR cached for restaurant ${restaurantId} — length=${qr.length} expiresAt=${managed.qrCache.expiresAt.toISOString()}`,
    );
    logger.info(
      `[wa:qr] QR generated for restaurant ${restaurantId} — length=${qr.length} room=${room} subscribers=${roomSize}`,
    );
    io?.to(room).emit('whatsapp:qr', { restaurantId, qr });
    logger.info(`[qr:socket] QR served via Socket.IO to ${roomSize} subscriber(s) in room ${room}`);
    emitStatus(restaurantId, 'qr_pending');
    if (roomSize === 0) {
      logger.warn(
        `[wa:qr] No Socket.IO subscribers in room ${room} — QR cached; will be served via REST poll or re-delivered on socket join.`,
      );
    }
  });

  client.on('authenticated', () => {
    managed.status = 'connecting';
    managed.qrCache = undefined;
    logger.info(`[wa] Restaurant ${restaurantId} authenticated`);
    logger.info(`[qr:cache] QR cache cleared (authenticated) for restaurant ${restaurantId}`);
    emitStatus(restaurantId, 'connecting');
  });

  client.on('auth_failure', (msg) => {
    managed.status = 'auth_failed';
    managed.qrCache = undefined;
    logger.error(`[wa] Auth failure for restaurant ${restaurantId}: ${msg}`);
    logger.info(`[qr:cache] QR cache cleared (auth_failure) for restaurant ${restaurantId}`);
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
    managed.qrCache = undefined;
    // Clear the in-progress guard so future reconnects are allowed.
    reconnectingIds.delete(restaurantId);
    logger.info(`[wa] WhatsApp ready for restaurant ${restaurantId}`);
    logger.info(`[qr:cache] QR cache cleared (ready) for restaurant ${restaurantId}`);
    emitStatus(restaurantId, 'connected');

    // Attach Puppeteer-level resilience listeners now that pupBrowser/pupPage exist.
    attachBrowserListeners(managed);

    // Inject the IDB interceptor into the live WhatsApp Web page.
    // This patches IDBObjectStore.prototype.get to record every IDB key that
    // passes through the page, including invalid undefined/null keys that produce
    // DataError.  Results accumulate in window.__idbProbe and are read by
    // probeMsgIdb() during the pre-download probe (TEST 4 / TEST 1 / TEST 2).
    injectIdbInterceptor(managed).catch((err: unknown) => {
      logger.warn(`[idb-probe] injectIdbInterceptor threw for restaurant ${restaurantId}`, {
        error: errMsg(err),
      });
    });
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
// ── Browser diagnostics (used by media download instrumentation) ───────────────

export interface BrowserDiagnostics {
  clientStatus: string;
  browserConnected: boolean;
  pageClosed: boolean;
  pageUrl: string | null;
}

/**
 * Snapshot browser/page health for a given restaurant at the moment of a
 * media-download failure.  All property accesses are guarded — never throws.
 */
// ── Client sync diagnostics ────────────────────────────────────────────────────

export interface ClientSyncInfo {
  clientStatus:    string;
  waState:         string | null;
  clientInfo:      unknown;
  browserConnected: boolean;
  pageClosed:      boolean;
  pageUrl:         string | null;
}

/**
 * Collect WhatsApp client-level synchronisation state.
 * Used to detect whether the client is fully synced when media metadata is absent.
 * All accesses are guarded — never throws.
 */
export async function getClientSyncInfo(restaurantId: number): Promise<ClientSyncInfo> {
  const managed = clients.get(restaurantId);
  const fallback: ClientSyncInfo = {
    clientStatus:    'not_initialised',
    waState:         null,
    clientInfo:      null,
    browserConnected: false,
    pageClosed:      true,
    pageUrl:         null,
  };

  if (!managed) return fallback;

  fallback.clientStatus = managed.status;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const browser = (managed.client as any).pupBrowser;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page    = (managed.client as any).pupPage;

    const browserConnected = !!browser && !!browser.isConnected?.();
    const pageClosed       = !page || !!page.isClosed?.();
    let pageUrl: string | null = null;

    if (page && !pageClosed) {
      try { pageUrl = page.url?.() ?? null; } catch { /* ignore */ }
    }

    let waState:    string | null = null;
    let clientInfo: unknown       = null;

    try { waState    = await managed.client.getState(); }  catch { /* not yet ready */ }
    try { clientInfo = managed.client.info;             }  catch { /* not yet ready */ }

    return { clientStatus: managed.status, waState, clientInfo, browserConnected, pageClosed, pageUrl };
  } catch {
    return { ...fallback, clientStatus: managed.status };
  }
}

// ── Fixed media download ───────────────────────────────────────────────────────

/**
 * Structured result from downloadMediaDirect — always returned, never thrown.
 * Puppeteer serialises return values cleanly as JSON; thrown plain objects
 * (e.g. WA's {r:'r'}) become the misleading "Error: r: r" in logs.
 *
 * Failure variants carry two diagnostic fields:
 *   step        — which step in the evaluate threw (e.g. '1b_getMessagesById')
 *   msgFoundVia — whether the WA Msg object came from in-memory store, IDB, or was absent
 *   mediaDump   — all media-related fields from the WA internal message object
 *
 * These are used by downstream callers to log root-cause evidence.
 */
export type MediaDownloadResult =
  | { ok: true;  data: string; mimetype: string; filename: string | null; filesize: number | null }
  | { ok: false;
      reason: 'no_msg' | 'no_media_data' | 'reuploading' | 'no_directpath'
             | 'media_error' | 'cdn_error' | 'browser_unavailable' | 'idb_error';
      detail?: string;
      /** Which step in the evaluate produced this failure — for root-cause attribution. */
      step?: string;
      /** How the WA internal Msg object was located (or not). */
      msgFoundVia?: 'memory' | 'idb' | 'not_found' | 'error';
      /** Full dump of every media-related property on the WA internal message object. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mediaDump?: Record<string, any> | null;
    };

/**
 * Fixed replacement for whatsapp-web.js Message.downloadMedia().
 *
 * ROOT CAUSE OF THE "r: r" BUG (whatsapp-web.js 1.34.7, latest stable):
 *   downloadMedia() calls WA's internal msg.downloadMedia() to resolve the
 *   media, then immediately checks mediaStage — but NEVER verifies that
 *   directPath was actually written.  WA sets mediaStage = 'RESOLVED'
 *   optimistically BEFORE populating directPath.  As a result,
 *   downloadAndMaybeDecrypt({directPath: null, …}) is called → WA's CDN
 *   rejects the null-path request → throws plain object {r: 'r'} → Puppeteer
 *   serialises the non-Error thrown value as "Error: r: r".
 *
 * THE FIX:
 *   Our own pupPage.evaluate mirrors the library's logic but adds the missing
 *   step: after calling WA's internal resolution, poll until directPath is
 *   genuinely non-null before calling downloadAndMaybeDecrypt.
 *   We return structured values instead of throwing so Puppeteer never has
 *   to serialise a plain WA error object.
 *
 * @lid FIX (Step 0.5):
 *   For messages from @lid senders (WhatsApp multi-device linked-device JIDs)
 *   the WA internal Backbone store indexes messages by their resolved @c.us JID,
 *   not the raw @lid JID.  Both Msg.get() and getMessagesById() therefore fail
 *   for @lid messages — .get() returns null and getMessagesById() throws a
 *   DataError during IDB compound-key construction.
 *
 *   However, wwebjs populates msg._data BEFORE the 'message' event fires, so
 *   directPath, mediaKey, mediaKeyTimestamp, mimetype, encFilehash, filehash
 *   and type are all already present on the Node.js side at event time.
 *
 *   When these fields are passed in as mediaHints, step 0.5 constructs the
 *   download arguments directly and calls downloadAndMaybeDecrypt without
 *   touching the Backbone store or IndexedDB at all.
 */

/**
 * Pre-populated media fields extracted from msg._data at event-fire time.
 * Available for every message type; eliminates the need for IDB lookups for
 * @lid senders where the Backbone/IDB path always throws DataError.
 */
export interface MediaHints {
  directPath:        string;
  mediaKey:          string;
  mediaKeyTimestamp: number | null;
  mimetype:          string;
  encFilehash:       string | null;
  filehash:          string | null;
  type:              string;
  filesize:          number | null;
}

export async function downloadMediaDirect(
  restaurantId: number,
  msgId: string,
  mediaHints?: MediaHints | null,
): Promise<MessageMedia | MediaDownloadResult> {
  const managed = clients.get(restaurantId);
  if (!managed) {
    return { ok: false, reason: 'browser_unavailable', detail: 'no managed client' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = (managed.client as any).pupPage;
  if (!page || page.isClosed()) {
    return { ok: false, reason: 'browser_unavailable', detail: 'pupPage closed or missing' };
  }

  // Run the entire download inside the browser context.
  // IMPORTANT: every code path returns a structured value — nothing throws from
  // inside evaluate — so Puppeteer always serialises a clean JSON result.
  //
  // DIAGNOSTIC INSTRUMENTATION
  // ───────────────────────────
  // Each step has its own try/catch and sets a `step` label on its failure
  // return.  This lets the Node.js logs pinpoint exactly which browser-side
  // operation produced the DataError (or any other failure).
  //
  // The `mediaDump` block captures every media-related property from the WA
  // internal Msg object immediately after it is located.  These values are
  // returned alongside any failure so that failing @lid messages can be
  // directly compared against normal messages in the log.
  //
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await page.evaluate(
    async (msgId: string, hints: MediaHints | null) => {
      // Inside pupPage.evaluate the code runs in the browser context where
      // globalThis === window.  (globalThis as any) satisfies TypeScript
      // without requiring the "dom" lib in tsconfig.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = globalThis as any;

      // ── Step 0.5: hints fast-path (bypass IDB for @lid senders) ──────────
      // When msg._data was already populated at event-fire time (which is
      // always the case for both @c.us and @lid senders), Node.js passes the
      // pre-fetched media fields in as `hints`.  If directPath + mediaKey are
      // present we can go directly to downloadAndMaybeDecrypt without touching
      // the Backbone store or IndexedDB at all.
      //
      // This is the ONLY reliable path for @lid messages because:
      //   - Msg.get(msgId)            → always null  (@lid not indexed by its
      //                                  raw JID in the Backbone store)
      //   - getMessagesById([msgId])  → always DataError (@lid JID can't be
      //                                  used to build the IDB compound key)
      if (hints && hints.directPath && hints.mediaKey) {
        try {
          const mockQpl = {
            addAnnotations() { return this; },
            addPoint()       { return this; },
          };
          const decrypted = await g.require('WAWebDownloadManager')
            .downloadManager.downloadAndMaybeDecrypt({
              directPath:        hints.directPath,
              encFilehash:       hints.encFilehash  ?? undefined,
              filehash:          hints.filehash      ?? undefined,
              mediaKey:          hints.mediaKey,
              mediaKeyTimestamp: hints.mediaKeyTimestamp ?? undefined,
              type:              hints.type          ?? 'image',
              signal:            new AbortController().signal,
              downloadQpl:       mockQpl,
            });
          const data = await g.WWebJS.arrayBufferToBase64Async(decrypted);
          return {
            ok:       true,
            data,
            mimetype: hints.mimetype ?? 'image/jpeg',
            filename: null,
            filesize: hints.filesize ?? null,
          };
        } catch (e: any) {
          // Hints-based CDN download failed.  Return a structured error —
          // IDB fallback would also fail for @lid so there is no point
          // continuing to steps 1a/1b.
          return {
            ok: false, reason: 'cdn_error', step: '0.5_hints_cdn',
            detail: `r=${(e as any)?.r} status=${(e as any)?.status} str=${String(e)}`,
            msgFoundVia: 'hints' as const,
          };
        }
      }

      // ── Step 0: require WAWebCollections ──────────────────────────────────
      let WAWebCollections: any;
      try {
        WAWebCollections = g.require('WAWebCollections');
      } catch (e: any) {
        return { ok: false, reason: 'cdn_error', step: '0_require_collections', detail: String(e) };
      }

      // ── Step 1a: in-memory Msg store lookup ───────────────────────────────
      // WAWebCollections.Msg is a Backbone collection.  .get() is synchronous
      // and does NOT touch IndexedDB.  If it returns falsy, the message is not
      // yet indexed in the in-memory store — probably a timing race between the
      // 'message' event firing and the store being updated.
      let msg: any = null;
      let msgFoundVia: 'memory' | 'idb' | 'not_found' | 'error' = 'not_found';

      try {
        const inMemory = WAWebCollections.Msg.get(msgId);
        if (inMemory) { msg = inMemory; msgFoundVia = 'memory'; }
      } catch (e: any) {
        return {
          ok: false, reason: 'idb_error', step: '1a_Msg_get',
          detail: String(e), msgFoundVia: 'error',
        };
      }

      // ── Step 1b: IndexedDB fallback ───────────────────────────────────────
      // ONLY reached when the message is absent from the in-memory store AND
      // no hints were supplied (i.e. @c.us senders where IDB works correctly).
      if (!msg) {
        try {
          const idbResult = await WAWebCollections.Msg.getMessagesById([msgId]);
          const found = idbResult?.messages?.[0];
          if (found) { msg = found; msgFoundVia = 'idb'; }
        } catch (e: any) {
          return {
            ok: false, reason: 'idb_error', step: '1b_getMessagesById',
            detail: String(e), msgFoundVia: 'error',
          };
        }
      }

      if (!msg) return { ok: false, reason: 'no_msg', step: 'post_1b', msgFoundVia };

      // ── Media property dump ───────────────────────────────────────────────
      // Capture EVERY media-related property from the WA internal object.
      // Returned on every failure so that @lid messages can be compared with
      // normal messages that download successfully.
      //
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mediaDump: Record<string, any> = {};
      try {
        mediaDump['directPath']              = msg.directPath          ?? null;
        mediaDump['mediaKey']                = msg.mediaKey            ?? null;
        mediaDump['mediaKeyTimestamp']       = msg.mediaKeyTimestamp   ?? null;
        mediaDump['mimetype']                = msg.mimetype            ?? null;
        mediaDump['filesize']                = msg.size                ?? null;
        mediaDump['encFilehash']             = msg.encFilehash         ?? null;
        mediaDump['filehash']                = msg.filehash            ?? null;
        mediaDump['type']                    = msg.type                ?? null;
        mediaDump['mediaStage']              = msg.mediaData?.mediaStage ?? null;
        mediaDump['mediaType']               = msg.mediaType           ?? null;
        mediaDump['isViewOnce']              = msg.isViewOnce          ?? null;
        mediaDump['hasMedia_via_directPath'] = Boolean(msg.directPath);
        mediaDump['msgFoundVia']             = msgFoundVia;

        try { mediaDump['msgId_serialized'] = msg.id?._serialized ?? (typeof msg.id === 'string' ? msg.id : null); } catch { /**/ }
        try { mediaDump['msgId_remote']     = msg.id?.remote?._serialized ?? msg.id?.remote ?? null; } catch { /**/ }
        try { mediaDump['msgId_id']         = msg.id?.id         ?? null; } catch { /**/ }
        try { mediaDump['msgId_fromMe']     = msg.id?.fromMe     ?? null; } catch { /**/ }

        // Full key listing so we see every property on the WA internal object
        try { mediaDump['allMsgKeys']       = Object.keys(msg);                               } catch { /**/ }
        try { mediaDump['allMediaDataKeys'] = msg.mediaData ? Object.keys(msg.mediaData) : []; } catch { /**/ }

        // Serialise every non-function property for the complete picture
        const raw: Record<string, unknown> = {};
        try {
          for (const k of (mediaDump['allMsgKeys'] as string[] ?? [])) {
            try {
              const v = (msg as any)[k];
              if (typeof v !== 'function') raw[k] = v;
            } catch { /**/ }
          }
        } catch { /**/ }
        mediaDump['rawMsgProps'] = raw;
      } catch { /**/ }

      if (!msg.mediaData) {
        return { ok: false, reason: 'no_media_data', step: 'post_1b', msgFoundVia, mediaDump };
      }
      if (msg.mediaData.mediaStage === 'REUPLOADING') {
        return { ok: false, reason: 'reuploading', step: 'post_1b', msgFoundVia, mediaDump };
      }

      // ── Step 2: trigger WA's internal media resolution ────────────────────
      // If this throws a DataError (mediaKey === null → IDB lookup with null key),
      // the error is RECORDED in mediaDump['step2_error'] instead of silently
      // discarded.  Execution continues so the directPath poll can still succeed
      // if WA resolves the path asynchronously despite the error.
      if (msg.mediaData.mediaStage !== 'RESOLVED') {
        try {
          await msg.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1 });
        } catch (e: any) {
          // Do NOT rethrow — record and continue to the poll below.
          mediaDump['step2_error'] = String(e);
        }
      }

      // ── Step 3: poll until directPath is genuinely populated ──────────────
      // THE FIX FOR THE "r: r" BUG (whatsapp-web.js 1.34.7):
      //   WA sets mediaStage = 'RESOLVED' optimistically BEFORE writing
      //   directPath.  The library's downloadMedia() calls
      //   downloadAndMaybeDecrypt({directPath: null, …}) immediately → CDN
      //   rejects the null path → throws {r:'r'} → Puppeteer serialises it as
      //   "Error: r: r".  Our poll waits until directPath is genuinely set.
      const POLL_INTERVAL_MS = 300;
      const POLL_MAX         = 26; // up to ~8 seconds total
      let   polls            = 0;

      while (!msg.directPath && polls < POLL_MAX) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        // Refresh from the store — WA may update the same object in-place
        // or replace the reference entirely; handle both.
        const fresh = WAWebCollections.Msg.get(msgId);
        if (fresh) msg = fresh;
        polls++;
      }

      if (!msg.directPath) {
        mediaDump['directPath_after_poll'] = msg.directPath    ?? null;
        mediaDump['mediaStage_after_poll'] = msg.mediaData?.mediaStage ?? null;
        mediaDump['polls']                 = polls;
        return {
          ok: false, reason: 'no_directpath', step: 'post_3',
          detail: `mediaStage=${msg.mediaData?.mediaStage} polls=${polls}`,
          msgFoundVia, mediaDump,
        };
      }

      // ── Step 4: bail on known-bad media stages ────────────────────────────
      const stage: string = msg.mediaData.mediaStage ?? '';
      if (stage.includes('ERROR') || stage === 'FETCHING') {
        return {
          ok: false, reason: 'media_error', step: 'step_4',
          detail: `mediaStage=${stage}`, msgFoundVia, mediaDump,
        };
      }

      // ── Step 5: download and decrypt from CDN ─────────────────────────────
      try {
        const mockQpl = {
          addAnnotations() { return this; },
          addPoint()       { return this; },
        };
        const decrypted = await g.require('WAWebDownloadManager')
          .downloadManager.downloadAndMaybeDecrypt({
            directPath:        msg.directPath,
            encFilehash:       msg.encFilehash,
            filehash:          msg.filehash,
            mediaKey:          msg.mediaKey,
            mediaKeyTimestamp: msg.mediaKeyTimestamp,
            type:              msg.type,
            signal:            new AbortController().signal,
            downloadQpl:       mockQpl,
          });

        const data = await g.WWebJS.arrayBufferToBase64Async(decrypted);

        return {
          ok:       true,
          data,
          mimetype: msg.mimetype ?? 'image/jpeg',
          filename: msg.filename ?? null,
          filesize: msg.size     ?? null,
        };
      } catch (e: any) {
        // Capture the CDN error as structured data — prevents the {r:'r'}
        // serialisation problem where Puppeteer turns a thrown plain object
        // into the misleading "Error: r: r" string.
        return {
          ok: false, reason: 'cdn_error', step: 'step_5',
          detail: `r=${e?.r} status=${e?.status} str=${String(e)}`,
          msgFoundVia, mediaDump,
        };
      }

      // NOTE: There is intentionally no outer catch.  Every code path above has
      // its own guard.  If a genuinely unexpected error escapes (e.g. a new WA
      // Web internal API change), Puppeteer surfaces it as a real exception in
      // the Node.js logs — far more useful than the previous "outer: <error>"
      // bucket that hid the step and all context.
    },
    msgId,
    mediaHints ?? null,
  );

  // ── Post-evaluate diagnostics ─────────────────────────────────────────────
  // Log the mediaDump and step label returned by the evaluate so that every
  // failed download produces a complete picture in the logs without requiring
  // a second repro.
  if (raw && !raw.ok) {
    logger.info('[media:dump] Download failed — browser-side diagnostics', {
      msgId,
      step:        raw.step        ?? null,
      reason:      raw.reason      ?? null,
      detail:      raw.detail      ?? null,
      msgFoundVia: raw.msgFoundVia ?? null,
      mediaDump:   raw.mediaDump   ?? null,
    });
  }

  if (!raw || !raw.ok) {
    return (raw as MediaDownloadResult) ?? { ok: false, reason: 'cdn_error', detail: 'null from evaluate' };
  }

  // MessageMedia constructor: (mimetype, data, filename?, filesize?)
  return new MessageMedia(raw.mimetype, raw.data, raw.filename ?? undefined, raw.filesize ?? undefined);
}

export async function getBrowserDiagnostics(restaurantId: number): Promise<BrowserDiagnostics> {
  const managed = clients.get(restaurantId);
  const fallback: BrowserDiagnostics = {
    clientStatus: 'not_initialised',
    browserConnected: false,
    pageClosed: true,
    pageUrl: null,
  };

  if (!managed) return fallback;

  fallback.clientStatus = managed.status;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const browser = (managed.client as any).pupBrowser;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page   = (managed.client as any).pupPage;

    const browserConnected = !!browser && !!browser.isConnected?.();
    const pageClosed       = !page || !!page.isClosed?.();
    let pageUrl: string | null = null;

    if (page && !pageClosed) {
      try { pageUrl = page.url?.() ?? null; } catch { /* ignore */ }
    }

    return { clientStatus: managed.status, browserConnected, pageClosed, pageUrl };
  } catch {
    return { ...fallback, clientStatus: managed.status };
  }
}

// ── IDB interceptor ────────────────────────────────────────────────────────────

/**
 * Inject a monkey-patch of IDBObjectStore.prototype.get into the live
 * WhatsApp Web page.  Every IDB get() call — valid or invalid — is recorded
 * in window.__idbProbe so that follow-up evaluate() calls can read exactly
 * what key was passed to IndexedDB at the moment of failure.
 *
 * Called once from the 'ready' handler; safe to call again (guards against
 * double-patching with the __idbProbe.patched flag).
 */
async function injectIdbInterceptor(managed: ManagedClient): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = (managed.client as any).pupPage;
  if (!page || page.isClosed()) {
    logger.warn(`[idb-probe] Cannot inject IDB interceptor for restaurant ${managed.restaurantId} — page not available`);
    return;
  }
  try {
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = globalThis as any;
      if (g.__idbProbe?.patched) {
        console.log('[idb-probe] already patched — skipping');
        return;
      }
      g.__idbProbe = { calls: [], errors: [], patched: false };

      // Access IDBObjectStore through globalThis to avoid TypeScript DOM-lib errors.
      // This code runs inside pupPage.evaluate() — it executes in the browser, not Node.js.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const IDBObjectStoreProto = (g.IDBObjectStore as any).prototype;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const origGet = IDBObjectStoreProto.get;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      IDBObjectStoreProto.get = function(query: any) {
        const isInvalid =
          query === undefined ||
          query === null ||
          (Array.isArray(query) && query.some((k: unknown) => k === undefined || k === null));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entry: any = {
          ts:           Date.now(),
          storeName:    this.name,
          queryType:    typeof query,
          isArray:      Array.isArray(query),
          isInvalid,
          queryPreview: (() => {
            try { return JSON.stringify(query); } catch(_) { return String(query); }
          })(),
        };

        if (isInvalid) {
          try { entry.stack = new Error('idb-probe: invalid key').stack; } catch(_) { /**/ }
          g.__idbProbe.errors.push(entry);
        }

        g.__idbProbe.calls.push(entry);
        // Rolling window — keep the last 1 000 calls
        if (g.__idbProbe.calls.length > 1000) {
          g.__idbProbe.calls.splice(0, g.__idbProbe.calls.length - 1000);
        }

        return origGet.call(this, query);
      };

      g.__idbProbe.patched = true;
      console.log('[idb-probe] IDBObjectStore.prototype.get patched — monitoring all IDB gets');
    });
    logger.info(`[idb-probe] IDB interceptor injected for restaurant ${managed.restaurantId}`);
  } catch (err) {
    logger.warn(`[idb-probe] Failed to inject IDB interceptor for restaurant ${managed.restaurantId}`, {
      error: errMsg(err),
    });
  }
}

// ── Message IDB probe ──────────────────────────────────────────────────────────

/** Shape of a serialised WA internal Msg object returned by the probe. */
export interface WaMsgSnapshot {
  found:             boolean;
  error:             string | null;
  msgId_serialized:  string | null;
  msgId_remote:      string | null;
  msgId_id:          string | null;
  msgId_fromMe:      boolean | null;
  directPath:        string | null;
  mediaKey:          string | null;
  mediaKeyTimestamp: number | null;
  mimetype:          string | null;
  mediaStage:        string | null;
  allKeys:           string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawProps:          Record<string, any> | null;
}

export interface MsgIdbProbeResult {
  msgId:       string;
  /** Result of WAWebCollections.Msg.get(msgId) — synchronous, in-memory only. */
  mem:         WaMsgSnapshot;
  /** Result of WAWebCollections.Msg.getMessagesById([msgId]) — async, hits IndexedDB. */
  idb:         WaMsgSnapshot;
  /** IDB key(s) passed to objectStore.get() during the getMessagesById() call. */
  interceptor: {
    patched:             boolean;
    totalCallsEver:      number;
    /** Every IDB get() call that fired while getMessagesById([msgId]) was running. */
    callsDuringGetById:  Array<{
      storeName:    string;
      queryPreview: string;
      queryType:    string;
      isArray:      boolean;
      isInvalid:    boolean;
    }>;
    /** Every invalid-key call recorded since the interceptor was injected. */
    allInvalidKeyCalls: Array<{
      storeName:    string;
      queryPreview: string;
      stack?:       string;
    }>;
  };
}

/**
 * TEST 4 core: run in the live page to probe the WA internal Msg store.
 *
 * Called automatically before every IMAGE download (incomingMessages.ts) and
 * on-demand via POST /api/diag/idb-probe.
 *
 * Returns:
 *   mem  — what WAWebCollections.Msg.get(msgId) found (in-memory, no IDB)
 *   idb  — what getMessagesById([msgId]) found or threw (IndexedDB)
 *   interceptor — the exact IDB key(s) that were passed to objectStore.get()
 *                 during the getMessagesById() call
 */
export async function probeMsgIdb(
  restaurantId: number,
  msgId:        string,
): Promise<MsgIdbProbeResult | { error: string }> {
  const managed = clients.get(restaurantId);
  if (!managed) return { error: 'no managed client' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = (managed.client as any).pupPage;
  if (!page || page.isClosed()) return { error: 'pupPage closed or missing' };

  try {
    const result: MsgIdbProbeResult = await page.evaluate(async (msgId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g   = globalThis as any;
      const WAC = g.require('WAWebCollections');

      /** Safely serialise a WA internal Msg object to a plain object. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function snap(msg: any, error: string | null): any {
        if (!msg) {
          return {
            found: false, error,
            msgId_serialized: null, msgId_remote: null, msgId_id: null,
            msgId_fromMe: null, directPath: null, mediaKey: null,
            mediaKeyTimestamp: null, mimetype: null, mediaStage: null,
            allKeys: [], rawProps: null,
          };
        }
        const allKeys: string[] = [];
        try { allKeys.push(...Object.keys(msg)); } catch(_) { /**/ }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawProps: Record<string, any> = {};
        for (const k of allKeys) {
          try {
            const v = msg[k];
            if (typeof v !== 'function') rawProps[k] = v;
          } catch(_) { /**/ }
        }

        return {
          found: true,
          error: null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          msgId_serialized:  (() => { try { return (msg as any).id?._serialized ?? null; }  catch(_) { return null; } })(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          msgId_remote:      (() => { try { const r = (msg as any).id?.remote; return r?._serialized ?? r ?? null; } catch(_) { return null; } })(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          msgId_id:          (() => { try { return (msg as any).id?.id      ?? null; }  catch(_) { return null; } })(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          msgId_fromMe:      (() => { try { return (msg as any).id?.fromMe  ?? null; }  catch(_) { return null; } })(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          directPath:        (msg as any).directPath          ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mediaKey:          (msg as any).mediaKey            ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mediaKeyTimestamp: (msg as any).mediaKeyTimestamp   ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mimetype:          (msg as any).mimetype            ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mediaStage:        (msg as any).mediaData?.mediaStage ?? null,
          allKeys,
          rawProps,
        };
      }

      // ── Step 1: in-memory synchronous lookup (NO IndexedDB) ────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let memMsg: any  = null;
      let memErr: string | null = null;
      try   { memMsg = WAC.Msg.get(msgId) || null; }
      catch (e: any) { memErr = String(e); }
      const memSnap = snap(memMsg, memErr);

      // ── Capture IDB call count before IDB lookup ────────────────────────────
      const callsBefore: number = g.__idbProbe?.calls?.length ?? 0;

      // ── Step 2: IndexedDB async lookup ─────────────────────────────────────
      // THIS IS THE SUSPECTED DataError SOURCE:
      // For @lid IDs (false_<LID>@lid_<HEXID>), WA Web builds a composite IDB
      // key [remoteJid, localId].  If remoteJid normalisation returns undefined,
      // IDBObjectStore.get([undefined, localId]) throws:
      //   DataError: Failed to execute 'get' on 'IDBObjectStore':
      //              No key or key range specified.
      // The IDB interceptor records exactly what key was constructed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let idbMsg: any  = null;
      let idbErr: string | null = null;
      try {
        const r = await WAC.Msg.getMessagesById([msgId]);
        idbMsg = r?.messages?.[0] || null;
      } catch (e: any) { idbErr = String(e); }
      const idbSnap = snap(idbMsg, idbErr);

      // ── Read IDB interceptor state ─────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allCalls: any[]   = g.__idbProbe?.calls   ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allErrors: any[]  = g.__idbProbe?.errors  ?? [];
      const callsDuringGetById = allCalls.slice(callsBefore).map((c: any) => ({
        storeName:    c.storeName    as string,
        queryPreview: c.queryPreview as string,
        queryType:    c.queryType    as string,
        isArray:      c.isArray      as boolean,
        isInvalid:    c.isInvalid    as boolean,
      }));

      return {
        msgId,
        mem:  memSnap,
        idb:  idbSnap,
        interceptor: {
          patched:            g.__idbProbe?.patched     ?? false,
          totalCallsEver:     allCalls.length,
          callsDuringGetById,
          allInvalidKeyCalls: allErrors.map((e: any) => ({
            storeName:    e.storeName    as string,
            queryPreview: e.queryPreview as string,
            stack:        e.stack        as string | undefined,
          })),
        },
      };
    }, msgId);

    return result;
  } catch (err) {
    return { error: `evaluate threw: ${errMsg(err)}` };
  }
}

// ── Read accumulated IDB interceptor state ────────────────────────────────────

export interface IdbInterceptorState {
  patched:            boolean;
  totalCallsEver:     number;
  recentCalls:        Array<{ storeName: string; queryPreview: string; isArray: boolean; isInvalid: boolean }>;
  allInvalidKeyCalls: Array<{ storeName: string; queryPreview: string; stack?: string }>;
}

/**
 * Read window.__idbProbe from the live page.
 * Returns null if no client / page is available.
 */
export async function readIdbInterceptorState(
  restaurantId: number,
): Promise<IdbInterceptorState | null> {
  const managed = clients.get(restaurantId);
  if (!managed) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = (managed.client as any).pupPage;
  if (!page || page.isClosed()) return null;

  try {
    return await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = globalThis as any;
      const probe = g.__idbProbe;
      if (!probe) return { patched: false, totalCallsEver: 0, recentCalls: [], allInvalidKeyCalls: [] };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recentCalls = (probe.calls as any[]).slice(-50).map((c: any) => ({
        storeName:    c.storeName    as string,
        queryPreview: c.queryPreview as string,
        isArray:      c.isArray      as boolean,
        isInvalid:    c.isInvalid    as boolean,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allInvalidKeyCalls = (probe.errors as any[]).map((e: any) => ({
        storeName:    e.storeName    as string,
        queryPreview: e.queryPreview as string,
        stack:        e.stack        as string | undefined,
      }));
      return {
        patched:         probe.patched as boolean,
        totalCallsEver:  (probe.calls  as unknown[]).length,
        recentCalls,
        allInvalidKeyCalls,
      };
    });
  } catch (err) {
    logger.warn(`[idb-probe] readIdbInterceptorState failed for restaurant ${restaurantId}`, {
      error: errMsg(err),
    });
    return null;
  }
}

// ── Page screenshot ────────────────────────────────────────────────────────────

/**
 * TEST 3: capture a PNG screenshot of the live WhatsApp Web page.
 * Returns base64-encoded PNG, or null if the page is unavailable.
 */
export async function capturePageScreenshot(restaurantId: number): Promise<string | null> {
  const managed = clients.get(restaurantId);
  if (!managed) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = (managed.client as any).pupPage;
  if (!page || page.isClosed()) return null;

  try {
    const buf = await page.screenshot({ type: 'png', fullPage: false }) as Buffer;
    return buf.toString('base64');
  } catch (err) {
    logger.warn(`[diag] screenshot failed for restaurant ${restaurantId}`, { error: errMsg(err) });
    return null;
  }
}

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
