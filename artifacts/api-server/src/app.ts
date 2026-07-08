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

// Trust reverse proxy
app.set("trust proxy", 1);

// ── Force HTTPS in production ────────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    const proto = (req.headers["x-forwarded-proto"] as string | undefined)
      ?.split(",")[0]
      ?.trim();

    if (proto === "http") {
      const host = req.headers["host"] ?? "";
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
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET ?? "dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || !!process.env.REPL_ID,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite:
        process.env.NODE_ENV === "production" || !!process.env.REPL_ID
          ? "none"
          : "lax",
    },
  }),
);

// API routes
app.use("/api", router);

// ── WhatsApp Bridge proxy ────────────────────────────────────────────────────
// Handles REST + Socket.IO communication with WhatsApp Bridge service.
app.use(
  createProxyMiddleware({
    target: process.env.BRIDGE_URL ?? "http://localhost:3001",
    changeOrigin: true,
    ws: true,
    pathFilter: (path) => path.startsWith("/whatsapp-bridge"),
    pathRewrite: {
      "^/whatsapp-bridge": "",
    },
  }),
);
// ── Frontend services routing ────────────────────────────────────────────────
//
// Development:
//   Portal Vite → localhost:5000
//   Menu Vite   → localhost:5173
//
// Production:
//   Portal Service → separate Railway service
//   Menu Service   → separate Railway service
//   API Server     → API only

if (process.env.NODE_ENV !== "production") {
  // Menu development proxy
  app.use(
    createProxyMiddleware({
      target: "http://localhost:5173",
      changeOrigin: true,
      ws: true,
      pathFilter: (path) => path.startsWith("/menu"),
    }),
  );

  // Portal development proxy
  app.use(
    createProxyMiddleware({
      target: "http://localhost:5000",
      changeOrigin: true,
      ws: true,
      pathFilter: (path) =>
        !path.startsWith("/api") &&
        !path.startsWith("/menu") &&
        !path.startsWith("/whatsapp-bridge"),
    }),
  );
} else {
  // Production:
  // Frontend applications are hosted separately on Railway.
  // This API server does not serve Portal or Menu files.

  app.get("/robots.txt", (_req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end("User-agent: *\nAllow: /\n");
  });

  // Any non-API route should not be handled by API server.
  app.use((_req, res) => {
    res.status(404).json({
      error: "Route not found",
    });
  });
}

// ── JSON error handler ──────────────────────────────────────────────────────

app.use(
  (
    _err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status =
      typeof _err === "object" && _err !== null && "status" in _err
        ? Number((_err as { status: unknown }).status)
        : 500;

    const message =
      typeof _err === "object" && _err !== null && "message" in _err
        ? String((_err as { message: unknown }).message)
        : "Internal Server Error";

    logger.error({ err: _err }, message);

    res.status(status).json({
      error: message,
    });
  },
);

export default app;
