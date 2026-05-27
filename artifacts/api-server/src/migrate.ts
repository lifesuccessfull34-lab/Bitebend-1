import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
  breakpoints: boolean;
}
interface Journal {
  entries: JournalEntry[];
}

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

const REQUIRED_COLUMNS: Array<{ table: string; column: string }> = [
  { table: "resources",                     column: "visible_to"       },
  { table: "resources",                     column: "approval_status"  },
  { table: "owner_password_reset_tokens",   column: "user_id"          },
  { table: "owner_password_reset_tokens",   column: "token"            },
  { table: "bill_links",                    column: "short_id"         },
  { table: "restaurants",                   column: "razorpay_webhook_secret" },
];

/**
 * When a database was initially set up via `drizzle-kit push` (no migration
 * files), the `__drizzle_migrations` journal table does not exist and all
 * tables are already present. Running `migrate()` would try to execute
 * CREATE TABLE for each table and fail with "already exists".
 *
 * This function detects that situation and stamps every migration in the
 * journal as already applied, so the next `migrate()` call becomes a no-op.
 */
async function stampPushInitialisedDb(folder: string) {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
      id         SERIAL PRIMARY KEY,
      hash       text   NOT NULL,
      created_at bigint
    )
  `);

  const journalPath = path.join(folder, "meta/_journal.json");
  if (!existsSync(journalPath)) return;

  const journal: Journal = JSON.parse(readFileSync(journalPath, "utf-8"));

  for (const entry of journal.entries) {
    const sqlPath = path.join(folder, `${entry.tag}.sql`);
    if (!existsSync(sqlPath)) continue;
    const sqlContent = readFileSync(sqlPath, "utf-8");
    const hash = createHash("sha256").update(sqlContent).digest("hex");
    const createdAt = entry.when;
    await db.execute(
      sql`INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${createdAt})`
    );
    console.log(`[DB_BOOT] stamped ${entry.tag} (when=${createdAt})`);
  }
}

/**
 * The `sessions` table is managed by connect-pg-simple, not Drizzle ORM.
 * It is the only table created at runtime rather than via a migration file
 * because connect-pg-simple manages its own DDL outside of Drizzle.
 */
async function ensureSessionsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "sessions" (
      "sid"    varchar        NOT NULL,
      "sess"   json           NOT NULL,
      "expire" timestamp(6)   NOT NULL,
      CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid")
    ) WITH (OIDS=FALSE)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "IDX_sessions_expire" ON "sessions" ("expire")
  `);
  console.log("[DB_BOOT] sessions table ready");
}

/**
 * Post-migration schema validation.
 * Checks that every required table and column exists.
 * Logs [DB_SCHEMA_VALIDATED] on success or [MIGRATION_ERROR] listing
 * every missing object, then throws so the process exits non-zero.
 */
async function validateSchema(): Promise<void> {
  const tableRows = await db.execute<{ table_name: string }>(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  const existingTables = new Set(tableRows.rows.map((r) => r.table_name));

  const missingTables = REQUIRED_TABLES.filter((t) => !existingTables.has(t));

  const columnRows = await db.execute<{ table_name: string; column_name: string }>(sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const existingColumns = new Set(
    columnRows.rows.map((r) => `${r.table_name}.${r.column_name}`)
  );
  const missingColumns = REQUIRED_COLUMNS
    .map(({ table, column }) => `${table}.${column}`)
    .filter((key) => !existingColumns.has(key));

  const errors: string[] = [
    ...missingTables.map((t) => `missing table: ${t}`),
    ...missingColumns.map((c) => `missing column: ${c}`),
  ];

  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`[MIGRATION_ERROR] ${e}`);
    }
    console.error("[MIGRATION_ERROR] Run: pnpm migrate");
    throw new Error(`Schema validation failed: ${errors.join("; ")}`);
  }

  console.log("[DB_SCHEMA_VALIDATED] All required tables present");
  console.log("[DB_SCHEMA_VALIDATED] All required columns present");
  console.log("[DB_SCHEMA_VALIDATED] Schema validation passed");
}

async function main() {
  console.log("[DB_BOOT] Starting database bootstrap");

  // Resolve migrations folder — works with both tsx (import.meta.url) and
  // esbuild-compiled output (platform:node injects __dirname as a literal).
  const migrationsFolder = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "migrations"
  );
  console.log(`[DB_BOOT] migrations folder: ${migrationsFolder}`);

  await ensureSessionsTable();

  try {
    await migrate(db, { migrationsFolder });
    console.log("[DB_MIGRATIONS_OK] All migrations applied");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const causeMsg = String((err as any)?.cause?.message ?? "");
    const causeCode = String((err as any)?.cause?.code ?? "");
    const isDuplicateTable =
      causeCode === "42P07" ||
      causeMsg.includes("already exists") ||
      msg.includes("already exists");

    if (isDuplicateTable) {
      console.log("[DB_BOOT] Push-initialised DB detected — stamping journal and retrying");
      await stampPushInitialisedDb(migrationsFolder);
      await migrate(db, { migrationsFolder });
      console.log("[DB_MIGRATIONS_OK] All migrations applied (after stamp)");
    } else {
      console.error("[MIGRATION_ERROR] Migration failed:", msg);
      throw err;
    }
  }

  await validateSchema();

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[MIGRATION_ERROR] Bootstrap failed:", err.message ?? err);
  process.exit(1);
});
