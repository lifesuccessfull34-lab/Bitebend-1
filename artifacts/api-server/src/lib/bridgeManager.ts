/**
 * Bridge Lifecycle Manager
 *
 * The API server owns the WhatsApp Bridge process. On startup the manager
 * spawns the bridge as a child process, monitors it via periodic health-checks,
 * and restarts it automatically if it dies or becomes unresponsive.
 *
 * This eliminates the race condition that existed when the bridge was a
 * separate Replit workflow: the portal no longer sees "bridge not running"
 * because the bridge starts immediately alongside the API server and the
 * status endpoint returns "initialising" (not an error) during the startup
 * window.
 *
 * Disabled in production (NODE_ENV=production) or via MANAGE_BRIDGE_PROCESS=false.
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import { logger } from "./logger";
import { WORKSPACE_ROOT } from "./workspace";

// ── Configuration ─────────────────────────────────────────────────────────────

const BRIDGE_PORT          = parseInt(process.env["BRIDGE_PORT"] ?? "3001", 10);
const BRIDGE_HEALTH_URL    = `http://localhost:${BRIDGE_PORT}/health`;
const HEALTH_INTERVAL_MS   = 20_000;
const STARTUP_GRACE_MS     = 60_000; // tsx + pnpm + Chromium can be slow
const MAX_RESTART_BACKOFF  = 60_000;
const MAX_RESTART_ATTEMPTS = 15;

// ── State ─────────────────────────────────────────────────────────────────────

export type BridgeState = "stopped" | "starting" | "running" | "restarting";

let _process:       ChildProcess | null = null;
let _state:         BridgeState         = "stopped";
let _restartCount   = 0;
let _healthTimer:   ReturnType<typeof setInterval>  | null = null;
let _restartTimer:  ReturnType<typeof setTimeout>   | null = null;
let _graceTimer:    ReturnType<typeof setTimeout>   | null = null;
let _managed        = false;

export function getBridgeState(): BridgeState { return _state; }
export function isBridgeManaged(): boolean     { return _managed; }

// ── Public API ─────────────────────────────────────────────────────────────────

export function startBridgeManager(): void {
  const disabled =
    process.env["NODE_ENV"] === "production" ||
    process.env["MANAGE_BRIDGE_PROCESS"] === "false";

  if (disabled) {
    logger.info("[bridge-manager] Disabled (production or MANAGE_BRIDGE_PROCESS=false)");
    return;
  }

  _managed = true;
  logger.info("[bridge-manager] Starting — API server now owns bridge lifecycle");

  _spawnBridge();

  _healthTimer = setInterval(() => { void _checkHealth(); }, HEALTH_INTERVAL_MS);
  _healthTimer.unref();

  process.on("exit",   _stopAll);
  process.on("SIGTERM", _stopAll);
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function _checkHealth(): Promise<void> {
  if (_state === "starting" || _state === "restarting") return;

  try {
    const res = await fetch(BRIDGE_HEALTH_URL, { signal: AbortSignal.timeout(5_000) });
    if (res.ok) {
      if (_state !== "running") {
        logger.info("[bridge-manager] Bridge healthy — state → running");
        _state = "running";
        _restartCount = 0;
      }
      return;
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "[bridge-manager] Health check failed — restarting bridge",
    );
    _restartBridge();
  }
}

function _detectChromium(): string {
  const explicit = process.env["PUPPETEER_EXECUTABLE_PATH"]?.trim() ?? "";
  if (explicit) return explicit;

  for (const name of ["chromium", "chromium-browser", "google-chrome"]) {
    try {
      const found = execSync(`which ${name} 2>/dev/null`, {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
      if (found) return found;
    } catch { /* not in PATH */ }
  }
  return "";
}

function _spawnBridge(): void {
  if (_state === "starting") return;
  _state = "starting";

  const chromium = _detectChromium();

  // Inherit the full environment except PORT (the API server's port) which
  // would conflict. The bridge uses BRIDGE_PORT independently.
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env["PORT"]; // don't leak API server port into bridge
  if (chromium) env["PUPPETEER_EXECUTABLE_PATH"] = chromium;

  logger.info(
    { chromium: chromium || "(auto-detect)", workspaceRoot: WORKSPACE_ROOT },
    "[bridge-manager] Spawning WhatsApp bridge",
  );

  _process = spawn(
    "pnpm",
    ["--filter", "@workspace/whatsapp-bridge", "run", "dev"],
    { cwd: WORKSPACE_ROOT, env, stdio: ["ignore", "pipe", "pipe"] },
  );

  _process.stdout?.setEncoding("utf8");
  _process.stderr?.setEncoding("utf8");

  _process.stdout?.on("data", (chunk: string) => {
    for (const line of chunk.split("\n").filter(Boolean)) {
      logger.info(`[bridge] ${line}`);
    }
  });

  _process.stderr?.on("data", (chunk: string) => {
    for (const line of chunk.split("\n").filter(Boolean)) {
      // tsx watch prints build info to stderr — log at debug level to reduce noise
      logger.debug(`[bridge:stderr] ${line}`);
    }
  });

  _process.on("spawn", () => {
    logger.info("[bridge-manager] Bridge process spawned — grace period starts");

    // After the grace period, force a health check to confirm startup
    _graceTimer = setTimeout(async () => {
      _graceTimer = null;
      if (_state !== "starting") return;
      try {
        const res = await fetch(BRIDGE_HEALTH_URL, { signal: AbortSignal.timeout(5_000) });
        if (res.ok) {
          logger.info("[bridge-manager] Bridge confirmed healthy after grace period");
          _state = "running";
          _restartCount = 0;
        } else {
          logger.warn("[bridge-manager] Bridge not healthy after grace period — will retry via health monitor");
          _state = "running"; // let the periodic health check handle restart
        }
      } catch {
        logger.warn("[bridge-manager] Bridge unreachable after grace period — will retry via health monitor");
        _state = "running";
      }
    }, STARTUP_GRACE_MS);
    _graceTimer.unref();
  });

  _process.on("exit", (code, signal) => {
    logger.warn(
      { code, signal },
      "[bridge-manager] Bridge process exited",
    );
    _process = null;
    if (_graceTimer) { clearTimeout(_graceTimer); _graceTimer = null; }

    // Don't restart if we killed it intentionally (SIGTERM on shutdown)
    if (signal === "SIGTERM" && _state === "stopped") return;
    _scheduleRestart();
  });

  _process.on("error", (err) => {
    logger.error({ err: err.message }, "[bridge-manager] Bridge process error");
    _process = null;
    _scheduleRestart();
  });
}

function _restartBridge(): void {
  if (_process) {
    try { _process.kill("SIGTERM"); } catch { /* ignore */ }
    _process = null;
  }
  _state = "restarting";
  _scheduleRestart();
}

function _scheduleRestart(): void {
  if (_restartTimer) return;

  _restartCount++;
  if (_restartCount > MAX_RESTART_ATTEMPTS) {
    logger.error("[bridge-manager] Max restart attempts exceeded — giving up");
    _state = "stopped";
    return;
  }

  const delay = Math.min(3_000 * _restartCount, MAX_RESTART_BACKOFF);
  logger.info(
    { attempt: _restartCount, delayMs: delay },
    "[bridge-manager] Scheduling bridge restart",
  );

  _restartTimer = setTimeout(() => {
    _restartTimer = null;
    _spawnBridge();
  }, delay);
  _restartTimer.unref();
}

function _stopAll(): void {
  if (_healthTimer)  { clearInterval(_healthTimer);  _healthTimer  = null; }
  if (_restartTimer) { clearTimeout(_restartTimer);  _restartTimer = null; }
  if (_graceTimer)   { clearTimeout(_graceTimer);    _graceTimer   = null; }
  if (_process) {
    _state = "stopped";
    try { _process.kill("SIGTERM"); } catch { /* ignore */ }
    _process = null;
  }
}
