import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';

// ── Helpers ───────────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

function ok(label: string, detail = '')   { console.log(`  ${GREEN}✔${RESET}  ${label}${detail ? `  ${CYAN}${detail}${RESET}` : ''}`); }
function fail(label: string, detail = '') { console.log(`  ${RED}✘${RESET}  ${label}${detail ? `  — ${detail}` : ''}`); }
function warn(label: string, detail = '') { console.log(`  ${YELLOW}⚠${RESET}  ${label}${detail ? `  — ${detail}` : ''}`); }
function section(title: string)           { console.log(`\n${BOLD}${title}${RESET}`); }

function checkTCP(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port });
    const timer = setTimeout(() => { sock.destroy(); resolve(false); }, timeoutMs);
    sock.on('connect', () => { clearTimeout(timer); sock.destroy(); resolve(true); });
    sock.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

async function httpGet(url: string, timeoutMs = 4000): Promise<{ ok: boolean; status?: number; body?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const body = await r.text();
    return { ok: r.ok, status: r.status, body };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

function findChromium(): string | null {
  const explicit = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (explicit && existsSync(explicit)) return explicit;

  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    try {
      const p = execSync(`which ${name} 2>/dev/null`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (p && existsSync(p)) return p;
    } catch { /* skip */ }
  }
  return null;
}

// ── Doctor checks ─────────────────────────────────────────────────────────────

let failed = 0;
let warned = 0;

function FAIL(label: string, detail = '') { fail(label, detail); failed++; }
function WARN(label: string, detail = '') { warn(label, detail); warned++; }

console.log(`\n${BOLD}╔══════════════════════════════════════════╗${RESET}`);
console.log(`${BOLD}║        Bitebend — pnpm doctor            ║${RESET}`);
console.log(`${BOLD}╚══════════════════════════════════════════╝${RESET}`);

// ── 1. Environment variables ──────────────────────────────────────────────────
section('1. Environment variables');

const DATABASE_URL    = process.env.DATABASE_URL;
const SESSION_SECRET  = process.env.SESSION_SECRET;
const BRIDGE_API_SECRET     = process.env.BRIDGE_API_SECRET;
const RAZORPAY_KEY_ID       = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET   = process.env.RAZORPAY_KEY_SECRET;
const SMTP_HOST             = process.env.SMTP_HOST;

if (DATABASE_URL)   ok('DATABASE_URL',   '(set)'); else FAIL('DATABASE_URL not set', 'DB-dependent features will fail');
if (SESSION_SECRET) ok('SESSION_SECRET', '(set)'); else WARN('SESSION_SECRET not set', 'using insecure default');
if (BRIDGE_API_SECRET) ok('BRIDGE_API_SECRET', '(set)'); else WARN('BRIDGE_API_SECRET not set', 'bridge API unprotected');
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) ok('Razorpay keys', '(set)'); else WARN('Razorpay keys not set', 'payment will fall back to manual UPI');
if (SMTP_HOST) ok('SMTP_HOST', '(set)'); else warn('SMTP_HOST not set', 'admin password-reset emails will be skipped (reset link shown in response)');

// ── 2. Chromium ───────────────────────────────────────────────────────────────
section('2. Chromium');

const chromiumPath = findChromium();
if (chromiumPath) {
  ok('Chromium found', chromiumPath);
} else {
  WARN('Chromium not found in PATH or common locations', 'WhatsApp Bridge will attempt to use puppeteer\'s bundled version');
}

// ── 3. Database ───────────────────────────────────────────────────────────────
section('3. Database');

if (!DATABASE_URL) {
  FAIL('Skipping DB check — DATABASE_URL not set');
} else {
  try {
    // Parse host/port from DATABASE_URL for TCP check
    const parsed = new URL(DATABASE_URL);
    const dbHost = parsed.hostname || 'localhost';
    const dbPort = parseInt(parsed.port || '5432', 10);
    const tcpOk = await checkTCP(dbHost, dbPort, 3000);
    if (tcpOk) {
      ok(`PostgreSQL reachable`, `${dbHost}:${dbPort}`);
      // Try a quick query via psql if available
      try {
        execSync(`psql "${DATABASE_URL}" -c "SELECT 1" --no-psqlrc -q -t 2>&1`, { stdio: 'ignore' });
        ok('psql query OK', 'SELECT 1 succeeded');
      } catch {
        warn('psql not available or query failed', 'TCP open but could not run test query');
      }
    } else {
      FAIL(`PostgreSQL not reachable at ${dbHost}:${dbPort}`, 'check DATABASE_URL and that DB is running');
    }
  } catch {
    FAIL('Could not parse DATABASE_URL', 'ensure it is a valid postgres:// URI');
  }
}

// ── 4. API server ─────────────────────────────────────────────────────────────
section('4. API server (port 8080)');

const apiPort = parseInt(process.env.API_PORT ?? '8080', 10);
const apiTcp = await checkTCP('localhost', apiPort, 3000);
if (!apiTcp) {
  FAIL(`API server not listening on port ${apiPort}`, 'start the application first: pnpm --filter @workspace/api-server run build && node artifacts/api-server/dist/index.mjs');
} else {
  ok(`API server listening`, `port ${apiPort}`);
  const health = await httpGet(`http://localhost:${apiPort}/api/auth/me`);
  if (health.status === 401 || health.status === 403) {
    ok('API server responding', `GET /api/auth/me → ${health.status} (expected)`);
  } else if (health.ok) {
    ok('API server responding', `GET /api/auth/me → ${health.status}`);
  } else {
    WARN('API server not responding correctly', `status ${health.status ?? 'no response'}`);
  }
}

// ── 5. WhatsApp Bridge ────────────────────────────────────────────────────────
section('5. WhatsApp Bridge (port 3001)');

const bridgePort = parseInt(process.env.BRIDGE_PORT ?? '3001', 10);
const bridgeTcp = await checkTCP('localhost', bridgePort, 3000);
if (!bridgeTcp) {
  FAIL(`WhatsApp Bridge not listening on port ${bridgePort}`, 'start it: pnpm --filter @workspace/whatsapp-bridge run dev');
  warn('On Replit: use the "Project" run button — it starts the bridge automatically alongside the app');
} else {
  ok(`WhatsApp Bridge listening`, `port ${bridgePort}`);
  const health = await httpGet(`http://localhost:${bridgePort}/health`, 3000);
  if (health.ok) {
    try {
      const body = JSON.parse(health.body ?? '{}') as { status?: string };
      ok('Bridge health check', `status=${body.status}`);
    } catch {
      ok('Bridge health check', 'responded 200');
    }
  } else {
    WARN('Bridge /health endpoint not responding', `status ${health.status ?? 'no response'}`);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log();
if (failed === 0 && warned === 0) {
  console.log(`${GREEN}${BOLD}All checks passed. Bitebend is ready.${RESET}\n`);
  process.exit(0);
} else if (failed === 0) {
  console.log(`${YELLOW}${BOLD}${warned} warning(s) — app should work but review above.${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}${BOLD}${failed} check(s) failed, ${warned} warning(s) — fix the issues above before starting.${RESET}\n`);
  process.exit(1);
}
