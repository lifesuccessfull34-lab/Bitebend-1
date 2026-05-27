import { Router, type IRouter } from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { WORKSPACE_ROOT } from "../lib/workspace";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

const REQUIRED_TABLES = [
  "users", "restaurants", "menu_categories", "menu_items",
  "orders", "order_items", "notifications", "restaurant_tables",
  "platform_settings", "subscription_plans", "subscription_transactions",
  "admin_password_reset_tokens", "owner_password_reset_tokens",
  "image_blobs", "bill_links", "resources", "sessions",
] as const;

const ROW_COUNT_TABLES = ["users", "restaurants", "orders", "resources"] as const;
const WARN_THRESHOLDS: Record<string, number> = {
  resources: 100_000,
  orders:    1_000_000,
};

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

/**
 * GET /api/health/db/details
 * Admin-only extended DB metrics: row counts, DB size, uptime, warning thresholds.
 */
router.get("/health/db/details", requireAdmin, async (_req, res) => {
  try {
    const [tableRows, migRows, sizeRows, rowCountRows] = await Promise.all([
      db.execute<{ table_name: string }>(sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `),
      db.execute<{ count: string }>(sql`
        SELECT COUNT(*)::text AS count FROM drizzle."__drizzle_migrations"
      `).catch(() => ({ rows: [{ count: "0" }] as Array<{ count: string }> })),
      db.execute<{ db_size: string }>(sql`
        SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size
      `),
      db.execute<{ table_name: string; row_count: string }>(sql`
        SELECT relname AS table_name, n_live_tup::text AS row_count
        FROM pg_stat_user_tables
        WHERE relname = ANY(${ROW_COUNT_TABLES as unknown as string[]})
      `),
    ]);

    const tablesFound = tableRows.rows.map((r) => r.table_name);
    const tablesFoundSet = new Set(tablesFound);
    const missingTables = REQUIRED_TABLES.filter((t) => !tablesFoundSet.has(t));

    const migrationCount = Number(migRows.rows[0]?.count ?? 0);
    const dbSize = sizeRows.rows[0]?.db_size ?? "unknown";

    const rowCounts: Record<string, number> = {};
    for (const t of ROW_COUNT_TABLES) rowCounts[t] = 0;
    for (const row of rowCountRows.rows) {
      rowCounts[row.table_name] = Number(row.row_count);
    }

    const warnings: string[] = [];
    for (const [table, threshold] of Object.entries(WARN_THRESHOLDS)) {
      const count = rowCounts[table] ?? 0;
      if (count > threshold) {
        warnings.push(
          `${table} has ${count.toLocaleString("en-IN")} rows (threshold: ${threshold.toLocaleString("en-IN")}) — consider archiving or partitioning`
        );
      }
    }

    const healthy = missingTables.length === 0;
    const uptimeSeconds = Math.floor(process.uptime());

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      totalTables: tablesFound.length,
      migrationCount,
      dbSize,
      rowCounts,
      uptimeSeconds,
      missingTables,
      warnings,
    });
  } catch (err: unknown) {
    res.status(503).json({
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
