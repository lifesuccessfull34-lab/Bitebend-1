import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

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
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      // "none" requires secure=true (HTTPS). On production this is correct and
      // necessary for mobile browsers that open the app from a QR code scan,
      // external app, or in-app browser — all of which are cross-site contexts
      // where "lax" would silently drop the session cookie, causing a
      // login → 401 loop and a blank white screen.
      // In development (HTTP) fall back to "lax" since "none" needs HTTPS.
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  }),
);

app.use("/api", router);

// Belt-and-suspenders: if the portal was ever built without BASE_PATH=/portal/,
// its asset files will be requested at /assets/... instead of /portal/assets/...
// Those requests hit this API server. Redirect them to the correct /portal/assets/
// path so the portal static server can serve them.
// This prevents a blank/loading page when the portal dist was built incorrectly.
app.get("/assets/*path", (req, res) => {
  const raw = (req.params as unknown as { path: string | string[] }).path ?? "";
  const rest = Array.isArray(raw) ? raw.join("/") : raw;
  res.redirect(301, `/portal/assets/${rest}`);
});

// Trailing-slash redirect for the portal SPA.
// The Replit proxy intercepts "/portal/" (with trailing slash) only.
// Direct navigation to "/portal" (no trailing slash) falls through to
// Express and gets a 404 unless we redirect it here.
app.get("/portal", (_req, res) => { res.redirect(301, "/portal/"); });

// Custom-domain catch-all redirects.
// When accessed via a custom domain (e.g. bitebend.in), requests for the
// portal's SPA routes arrive without the /portal/ prefix (e.g. /restaurant/login
// instead of /portal/restaurant/login). The Replit proxy has no service
// registered for these paths, which causes a 502/500 error. We register
// these path prefixes in artifact.toml and redirect them to the correct
// /portal/ base here so the portal SPA can handle them.
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
  // Exact match (e.g. /restaurant → /portal/restaurant/)
  app.get(prefix, (_req, res) => { res.redirect(302, `/portal${prefix}`); });
  // Prefix match (e.g. /restaurant/login → /portal/restaurant/login)
  app.get(`${prefix}/*path`, (req, res) => {
    const raw = (req.params as unknown as { path: string | string[] }).path ?? "";
    const rest = Array.isArray(raw) ? raw.join("/") : raw;
    res.redirect(302, `/portal${prefix}/${rest}`);
  });
}

// Root redirect → portal
app.get("/", (_req, res) => { res.redirect(302, "/portal/"); });

// ── Static helpers ────────────────────────────────────────────────────────────
// Browsers and crawlers always probe these at the root domain.
// Without handlers they hit the API, cost a DB connection, and return 404 —
// adding ~1 extra round-trip to every mobile page load.

// Redirect browser favicon requests to the portal's built favicon.
app.get("/favicon.svg", (_req, res) => { res.redirect(301, "/portal/favicon.svg"); });
app.get("/favicon.ico", (_req, res) => { res.redirect(301, "/portal/favicon.svg"); });

// Minimal robots.txt so crawlers don't retry 404 on every visit.
app.get("/robots.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.end("User-agent: *\nAllow: /\n");
});

export default app;
