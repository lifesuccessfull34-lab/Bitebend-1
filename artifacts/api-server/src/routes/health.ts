import { Router, type IRouter } from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { WORKSPACE_ROOT } from "../lib/workspace";

const router: IRouter = Router();

const REQUIRED_TABLES = [
  "users", "restaurants", "menu_categories", "menu_items",
  "orders", "order_items", "notifications", "restaurant_tables",
  "platform_settings", "subscription_plans", "subscription_transactions",
  "admin_password_reset_tokens", "owner_password_reset_tokens",
  "image_blobs", "bill_links", "resources", "sessions",
] as const;

router.get("/healthz", (_req, res) => {
  const backend = {
    commit: __BUILD_COMMIT__,
    timestamp: __BUILD_TIME__,
    version: __BUILD_VERSION__,
    env: process.env["NODE_ENV"] ?? "unknown",
  };

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

  res.json({ status: "ok", backend, frontend, commitMatch });
});

router.get("/health/db", async (_req, res) => {
  try {
    const tableRows = await db.execute<{ table_name: string }>(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tablesFound = tableRows.rows.map((r) => r.table_name);
    const tablesFoundSet = new Set(tablesFound);
    const missingTables = REQUIRED_TABLES.filter((t) => !tablesFoundSet.has(t));

    let migrationState: { stampedCount: number; status: string } | { error: string };
    try {
      const migRows = await db.execute<{ count: string }>(sql`
        SELECT COUNT(*)::text AS count FROM drizzle."__drizzle_migrations"
      `);
      migrationState = {
        stampedCount: Number(migRows.rows[0]?.count ?? 0),
        status: "ok",
      };
    } catch {
      migrationState = { error: "drizzle.__drizzle_migrations not found — run: pnpm migrate" };
    }

    const healthy = missingTables.length === 0;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      tablesFound,
      missingTables,
      requiredTableCount: REQUIRED_TABLES.length,
      migrationState,
    });
  } catch (err: unknown) {
    res.status(503).json({
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
