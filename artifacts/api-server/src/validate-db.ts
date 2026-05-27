/**
 * validate-db.ts
 *
 * Standalone schema validation script.
 * Run via:  pnpm validate:db
 *
 * Exits 0 when the schema is complete, 1 when anything is missing.
 * Every problem is prefixed with [MIGRATION_ERROR] so it surfaces clearly
 * in deployment logs.
 */
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";

const REQUIRED_TABLES = [
  "users",
  "restaurants",
  "menu_categories",
  "menu_items",
  "orders",
  "order_items",
  "notifications",
  "restaurant_tables",
  "platform_settings",
  "subscription_plans",
  "subscription_transactions",
  "admin_password_reset_tokens",
  "owner_password_reset_tokens",
  "image_blobs",
  "bill_links",
  "resources",
  "sessions",
] as const;

const REQUIRED_COLUMNS: Array<{ table: string; column: string; note?: string }> = [
  { table: "resources",                   column: "visible_to",              note: "server-side visibility filter" },
  { table: "resources",                   column: "approval_status"                                                },
  { table: "resources",                   column: "deleted_at"                                                     },
  { table: "owner_password_reset_tokens", column: "user_id"                                                        },
  { table: "owner_password_reset_tokens", column: "token"                                                          },
  { table: "owner_password_reset_tokens", column: "used_at"                                                        },
  { table: "bill_links",                  column: "short_id",                note: "added in migration 0010"       },
  { table: "bill_links",                  column: "opened_at"                                                      },
  { table: "restaurants",                 column: "razorpay_webhook_secret", note: "added in migration 0008"       },
  { table: "restaurants",                 column: "approval_status"                                                },
  { table: "restaurants",                 column: "subscription_plan"                                              },
  { table: "orders",                      column: "razorpay_order_id",       note: "added in migration 0007"       },
  { table: "orders",                      column: "payment_screenshot_url",  note: "added in migration 0006"       },
];

const REQUIRED_INDEXES: Array<{ indexName: string; tableName: string }> = [
  { indexName: "IDX_sessions_expire",       tableName: "sessions"    },
  { indexName: "bill_links_short_id_idx",   tableName: "bill_links"  },
];

async function main() {
  let errors = 0;
  let warnings = 0;

  console.log("[DB_BOOT] Running schema validation…");

  // ── 1. Table existence ────────────────────────────────────────────────────
  const tableRows = await db.execute<{ table_name: string }>(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  const existingTables = new Set(tableRows.rows.map((r) => r.table_name));

  const missingTables = REQUIRED_TABLES.filter((t) => !existingTables.has(t));
  const foundTables   = REQUIRED_TABLES.filter((t) =>  existingTables.has(t));

  if (missingTables.length > 0) {
    for (const t of missingTables) {
      console.error(`[MIGRATION_ERROR] missing table: ${t}`);
      errors++;
    }
  } else {
    console.log(`[DB_SCHEMA_VALIDATED] tables (${foundTables.length}/${REQUIRED_TABLES.length}): all present`);
  }

  // ── 2. Column existence ───────────────────────────────────────────────────
  const colRows = await db.execute<{ table_name: string; column_name: string }>(sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const existingCols = new Set(colRows.rows.map((r) => `${r.table_name}.${r.column_name}`));

  let missingColCount = 0;
  for (const { table, column, note } of REQUIRED_COLUMNS) {
    const key = `${table}.${column}`;
    if (!existingCols.has(key)) {
      const detail = note ? ` (${note})` : "";
      console.error(`[MIGRATION_ERROR] missing column: ${key}${detail}`);
      errors++;
      missingColCount++;
    }
  }
  if (missingColCount === 0) {
    console.log(`[DB_SCHEMA_VALIDATED] columns (${REQUIRED_COLUMNS.length}/${REQUIRED_COLUMNS.length}): all present`);
  }

  // ── 3. Index existence ────────────────────────────────────────────────────
  const idxRows = await db.execute<{ indexname: string }>(sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
  `);
  const existingIndexes = new Set(idxRows.rows.map((r) => r.indexname));

  for (const { indexName, tableName } of REQUIRED_INDEXES) {
    if (!existingIndexes.has(indexName)) {
      console.warn(`[WARN] missing index: ${indexName} on ${tableName}`);
      warnings++;
    }
  }
  if (warnings === 0) {
    console.log(`[DB_SCHEMA_VALIDATED] indexes (${REQUIRED_INDEXES.length}/${REQUIRED_INDEXES.length}): all present`);
  }

  // ── 4. Migration journal state ────────────────────────────────────────────
  try {
    const journalRows = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count FROM drizzle."__drizzle_migrations"
    `);
    const stampedCount = Number(journalRows.rows[0]?.count ?? 0);
    console.log(`[DB_SCHEMA_VALIDATED] drizzle journal: ${stampedCount} migration(s) stamped`);
  } catch {
    console.warn("[WARN] drizzle.__drizzle_migrations table not found — run: pnpm migrate");
    warnings++;
  }

  // ── 5. Summary ────────────────────────────────────────────────────────────
  console.log("");
  if (errors > 0) {
    console.error(`[MIGRATION_ERROR] Validation FAILED — ${errors} error(s), ${warnings} warning(s)`);
    console.error("[MIGRATION_ERROR] Fix: pnpm migrate");
    await pool.end();
    process.exit(1);
  } else {
    console.log(`[DB_SCHEMA_VALIDATED] Validation PASSED — 0 errors, ${warnings} warning(s)`);
    await pool.end();
    process.exit(0);
  }
}

main().catch((err: unknown) => {
  console.error("[MIGRATION_ERROR] Validation script failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
