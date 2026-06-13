import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";
import { createProxyMiddleware } from "http-proxy-middleware";

const PgSession = connectPgSimple(session);

const app: Express = express();

// Trust the Replit reverse proxy so express-session can see the real protocol
// (X-Forwarded-Proto: https). Without this, issecure() returns false in production
// and express-session silently skips sending Set-Cookie when cookie.secure=true,
// causing a login→401 redirect loop on every protected request.
app.set("trust proxy", 1);

// ── Force HTTPS in production ─────────────────────────────────────────────────
// Android 9+ (and Oppo browsers) enforce "ERR_CLEARTEXT_NOT_PERMITTED" —
// they block ALL http:// requests at the OS level before the request leaves
// the phone. The Replit reverse proxy sets X-Forwarded-Proto so we can detect
// the original protocol. Any http:// request that somehow reaches the server
// (older devices, curl, bots) gets a permanent 301 redirect to https://.
// This also prevents the relative-redirect chain from keeping the http:// scheme
// (e.g. /restaurant/auth → 302 /portal/restaurant/auth still has http:// otherwise).
// In development X-Forwarded-Proto is absent so this middleware is a no-op.
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
    if (proto === "http") {
      const host = req.headers["host"] ?? "";
      // 301 Permanent so browsers & search engines remember to use HTTPS
      return res.redirect(301, `https://${host}${req.url}`);
    }
    next();
  });
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "sessions",
      // The sessions table is created by the migration; setting this to true
      // would cause connect-pg-simple to look for table.sql via __dirname
      // which resolves to dist/ after esbuild bundling (not the package dir).
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET ?? "dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Replit always proxies over HTTPS (even in dev), detected via REPL_ID.
      // sameSite:"lax" blocks cookies in cross-site iframe contexts — specifically
      // the Replit IDE preview pane (replit.com embedding the repl URL) as well as
      // mobile in-app browsers that open from QR scans.
      // When on Replit or in production: sameSite:"none" + secure:true so the
      // cookie survives all these cross-site contexts.
      // On truly local dev (no REPL_ID): fall back to lax + non-secure.
      secure: process.env.NODE_ENV === "production" || !!process.env.REPL_ID,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: (process.env.NODE_ENV === "production" || !!process.env.REPL_ID) ? "none" : "lax",
    },
  }),
);

app.use("/api", router);

// ── Dev proxy: forward /portal/ and /menu/ to Vite dev servers ───────────────
// In development the portal and menu are served by separate Vite processes.
// The Replit preview pane only sees port 5000 (this API server), so we
// proxy those paths to the appropriate Vite dev server ports.
// IMPORTANT: must be registered BEFORE any redirect handlers for /portal or /menu
// so that requests don't get caught by the trailing-slash or SPA redirect routes.
if (process.env.NODE_ENV !== "production") {
  app.use(
    createProxyMiddleware({
      target: "http://localhost:3000",
      changeOrigin: true,
      ws: true,
      pathFilter: (path) => path.startsWith("/portal"),
    }),
  );
  app.use(
    createProxyMiddleware({
      target: "http://localhost:5173",
      changeOrigin: true,
      ws: true,
      pathFilter: (path) => path.startsWith("/menu"),
    }),
  );
  // Proxy Socket.IO and REST calls for the WhatsApp Bridge service.
  // Path /whatsapp-bridge/* is rewritten to /* on the bridge (port 3001).
  // The portal connects Socket.IO with path="/whatsapp-bridge/socket.io".
  app.use(
    createProxyMiddleware({
      target: "http://localhost:3001",
      changeOrigin: true,
      ws: true,
      pathFilter: (path) => path.startsWith("/whatsapp-bridge"),
      pathRewrite: { "^/whatsapp-bridge": "" },
    }),
  );
  app.get("/", (_req, res) => { res.redirect(302, "/portal/"); });
} else {
  // ── Production only: static redirect helpers ─────────────────────────────
  // Belt-and-suspenders: if the portal was ever built without BASE_PATH=/portal/,
  // its asset files will be requested at /assets/... instead of /portal/assets/...
  app.get("/assets/*path", (req, res) => {
    const raw = (req.params as unknown as { path: string | string[] }).path ?? "";
    const rest = Array.isArray(raw) ? raw.join("/") : raw;
    res.redirect(301, `/portal/assets/${rest}`);
  });

  // Trailing-slash redirect for the portal SPA.
  app.get("/portal", (_req, res) => { res.redirect(301, "/portal/"); });

  // Custom-domain catch-all redirects.
  const PORTAL_PREFIXES = [
    "/restaurant",
    "/admin",
    "/login",
    "/register",
    "/logout",
    "/terms",
    "/privacy-policy",
  ];

  for (const prefix of PORTAL_PREFIXES) {
    app.get(prefix, (_req, res) => { res.redirect(302, `/portal${prefix}`); });
    app.get(`${prefix}/*path`, (req, res) => {
      const raw = (req.params as unknown as { path: string | string[] }).path ?? "";
      const rest = Array.isArray(raw) ? raw.join("/") : raw;
      res.redirect(302, `/portal${prefix}/${rest}`);
    });
  }

  // Root redirect → portal
  app.get("/", (_req, res) => { res.redirect(302, "/portal/"); });

  // Redirect browser favicon requests to the portal's built favicon.
  app.get("/favicon.svg", (_req, res) => { res.redirect(301, "/portal/favicon.svg"); });
  app.get("/favicon.ico", (_req, res) => { res.redirect(301, "/portal/favicon.svg"); });

  // Minimal robots.txt so crawlers don't retry 404 on every visit.
  app.get("/robots.txt", (_req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end("User-agent: *\nAllow: /\n");
  });
}

// ── JSON error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (typeof _err === "object" && _err !== null && "status" in _err)
    ? Number((_err as { status: unknown }).status)
    : 500;
  const message = (typeof _err === "object" && _err !== null && "message" in _err)
    ? String((_err as { message: unknown }).message)
    : "Internal Server Error";
  logger.error({ err: _err }, message);
  res.status(status).json({ error: message });
});

export default app;
