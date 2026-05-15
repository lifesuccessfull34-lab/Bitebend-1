import app from "./app";
import { logger } from "./lib/logger";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WORKSPACE_ROOT } from "./lib/workspace";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Startup: log build metadata ───────────────────────────────────────────────
//
// __BUILD_COMMIT__, __BUILD_TIME__, __BUILD_VERSION__ are injected by esbuild
// at bundle time (see build.mjs `define` option). In the compiled bundle they
// are plain string literals — never runtime expressions.
//
// TypeScript declarations for these are in src/globals.d.ts.

const backendBuild = {
  commit: __BUILD_COMMIT__,
  timestamp: __BUILD_TIME__,
  version: __BUILD_VERSION__,
};

// Resolve the effective public base URL (same priority order as getQrUrl in owner.ts)
const effectiveSiteUrl =
  process.env["SITE_URL"]?.trim() ||
  (() => {
    const d = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
    return d ? `https://${d}` : null;
  })() ||
  (process.env["REPLIT_DEV_DOMAIN"]
    ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
    : `http://localhost:${port}`);

logger.info(
  {
    ...backendBuild,
    env: process.env["NODE_ENV"] ?? "unknown",
    port,
    siteUrl: effectiveSiteUrl,
  },
  "Server starting",
);

// ── Frontend build version sync ───────────────────────────────────────────────
//
// On startup we read the frontend's build-info.json (written by the Vite
// buildInfoPlugin during `pnpm --filter @workspace/menu run build`) and
// compare its commit hash against the backend's.
//
// A mismatch means the frontend and backend were built from different commits —
// i.e. one of them has not been rebuilt since the last code change.

const buildInfoPath = join(WORKSPACE_ROOT, "artifacts/menu/dist/public/build-info.json");

if (existsSync(buildInfoPath)) {
  try {
    const frontendBuild = JSON.parse(readFileSync(buildInfoPath, "utf-8")) as {
      commit: string;
      timestamp: string;
      version: string;
      builtAt: string;
    };

    logger.info({ frontendBuild }, "Frontend build info");

    if (frontendBuild.commit !== backendBuild.commit) {
      logger.warn(
        {
          frontendCommit: frontendBuild.commit,
          backendCommit: backendBuild.commit,
        },
        "VERSION MISMATCH: frontend and backend were built from different commits — rebuild before deploying",
      );
    } else {
      logger.info(
        { commit: backendBuild.commit },
        "Frontend/backend commits match",
      );
    }
  } catch (err) {
    logger.warn({ err }, "Could not parse frontend build-info.json");
  }
} else {
  logger.warn(
    { path: buildInfoPath },
    "Frontend build-info.json not found — run: pnpm --filter @workspace/menu run build",
  );
}

// ── Server ────────────────────────────────────────────────────────────────────

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info(
    {
      port,
      commit: backendBuild.commit,
      env: process.env["NODE_ENV"] ?? "unknown",
    },
    "Server listening",
  );
});
