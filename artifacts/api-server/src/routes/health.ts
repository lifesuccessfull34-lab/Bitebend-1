import { Router, type IRouter } from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WORKSPACE_ROOT } from "../lib/workspace";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  // Backend build info — injected by esbuild define (see build.mjs + globals.d.ts)
  const backend = {
    commit: __BUILD_COMMIT__,
    timestamp: __BUILD_TIME__,
    version: __BUILD_VERSION__,
    env: process.env["NODE_ENV"] ?? "unknown",
  };

  // Frontend build info — written by Vite buildInfoPlugin during `pnpm build`
  let frontend: unknown = null;
  const bip = join(WORKSPACE_ROOT, "artifacts/menu/dist/public/build-info.json");
  if (existsSync(bip)) {
    try {
      frontend = JSON.parse(readFileSync(bip, "utf-8"));
    } catch {
      frontend = { error: "parse failed" };
    }
  }

  const commitMatch =
    frontend !== null &&
    typeof frontend === "object" &&
    "commit" in frontend &&
    (frontend as { commit: string }).commit === backend.commit;

  res.json({
    status: "ok",
    backend,
    frontend,
    commitMatch,
  });
});

export default router;
