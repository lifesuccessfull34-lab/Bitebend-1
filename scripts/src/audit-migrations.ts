/**
 * audit-migrations.ts
 *
 * Compares the Drizzle journal (lib/db/drizzle/meta/_journal.json) against
 * the live database (drizzle.__drizzle_migrations) and validates that all
 * required tables and columns exist.
 *
 * Run via:  pnpm audit-migrations
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — one or more checks fail (drift detected)
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

// ── Path resolution ────────────────────────────────────────────────────────
// scripts/src/ is two levels below the workspace root
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(SCRIPT_DIR, "../..");
const MIGRATIONS_DIR = resolve(WORKSPACE_ROOT, "lib/db/drizzle");
const JOURNAL_PATH = resolve(MIGRATIONS_DIR, "meta/_journal.json");

// ── Required schema lists (keep in sync with migrate.ts / validate-db.ts) ──

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
  "table_sessions",
  "session_bills",
] as const;

const REQUIRED_COLUMNS: Array<{ table: string; column: string }> = [
  { table: "resources",                   column: "visible_to"                },
  { table: "resources",                   column: "approval_status"           },
  { table: "resources",                   column: "deleted_at"                },
  { table: "owner_password_reset_tokens", column: "user_id"                   },
  { table: "owner_password_reset_tokens", column: "token"                     },
  { table: "bill_links",                  column: "short_id"                  },
  { table: "restaurants",                 column: "razorpay_webhook_secret"   },
  { table: "orders",                      column: "razorpay_order_id"         },
  { table: "orders",                      column: "payment_screenshot_url"    },
  { table: "orders",                      column: "verification_method"       },
  { table: "orders",                      column: "verified_by"               },
  { table: "orders",                      column: "verified_at"               },
  { table: "orders",                      column: "session_id"                },
  { table: "table_sessions",              column: "restaurant_id"             },
  { table: "table_sessions",              column: "table_number"              },
  { table: "table_sessions",              column: "status"                    },
  { table: "table_sessions",              column: "session_type"              },
  { table: "table_sessions",              column: "customer_phone"            },
  { table: "session_bills",              column: "session_id"                },
  { table: "session_bills",              column: "restaurant_id"             },
  { table: "session_bills",              column: "bill_number"               },
  { table: "session_bills",              column: "total"                     },
  { table: "session_bills",              column: "status"                    },
  { table: "session_bills",              column: "customer_phone"            },
  { table: "session_bills",              column: "screenshot_url"            },
  { table: "session_bills",              column: "resent_at"                 },
  { table: "session_bills",              column: "resent_count"              },
];

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
  breakpoints: boolean;
}
interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function pass(msg: string) {
  console.log(`  ✅  ${msg}`);
}
function fail(msg: string) {
  console.error(`  ❌  ${msg}`);
}
function warn(msg: string) {
  console.warn(`  ⚠️   ${msg}`);
}
function section(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length - 4))}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });

  let errors = 0;
  let warnings = 0;

  console.log("🔍  Bitebend Migration Audit");
  console.log(`    workspace: ${WORKSPACE_ROOT}`);
  console.log(`    journal:   ${JOURNAL_PATH}`);

  // ── 1. Journal file ──────────────────────────────────────────────────────
  section("1. Journal file");
  if (!existsSync(JOURNAL_PATH)) {
    fail(`Journal not found: ${JOURNAL_PATH}`);
    errors++;
    await db.end();
    process.exit(1);
  }

  const journal: Journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf-8"));
  pass(`Journal loaded — ${journal.entries.length} entries, dialect: ${journal.dialect}`);

  // ── 2. Compute file hashes ────────────────────────────────────────────────
  section("2. Migration file hashes");
  interface MigEntry { idx: number; tag: string; hash: string; fileMissing: boolean }
  const journalEntries: MigEntry[] = [];

  for (const entry of journal.entries) {
    const sqlPath = resolve(MIGRATIONS_DIR, `${entry.tag}.sql`);
    if (!existsSync(sqlPath)) {
      fail(`SQL file missing: ${entry.tag}.sql`);
      errors++;
      journalEntries.push({ idx: entry.idx, tag: entry.tag, hash: "", fileMissing: true });
    } else {
      const content = readFileSync(sqlPath, "utf-8");
      const hash = sha256(content);
      journalEntries.push({ idx: entry.idx, tag: entry.tag, hash, fileMissing: false });
    }
  }

  if (errors === 0) {
    pass(`All ${journalEntries.length} SQL files present`);
  }

  // ── 3. Database migration hashes ─────────────────────────────────────────
  section("3. Database journal vs file hashes");

  let dbHashes: Set<string>;
  let dbCount = 0;
  try {
    const result = await db.query<{ hash: string; created_at: string }>(
      `SELECT hash, created_at FROM drizzle."__drizzle_migrations" ORDER BY created_at`
    );
    dbHashes = new Set(result.rows.map((r) => r.hash));
    dbCount = result.rows.length;
    pass(`drizzle.__drizzle_migrations — ${dbCount} rows`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`Cannot query drizzle.__drizzle_migrations: ${msg}`);
    fail("Run: pnpm migrate");
    errors++;
    // Cannot do hash comparison — skip to schema checks
    dbHashes = new Set();
  }

  let hashMismatches = 0;
  for (const entry of journalEntries) {
    if (entry.fileMissing) continue;
    if (!dbHashes.has(entry.hash)) {
      fail(`Hash not in DB for migration: ${entry.tag}`);
      fail(`  computed: ${entry.hash}`);
      hashMismatches++;
      errors++;
    }
  }

  if (hashMismatches === 0 && dbHashes.size > 0) {
    pass(`All ${journalEntries.length} migration hashes verified in DB`);
  }

  if (dbCount > journalEntries.length) {
    warn(`DB has ${dbCount} entries but journal has ${journalEntries.length} — extra DB rows (may be from a future migration)`);
    warnings++;
  }

  // ── 4. Required tables ────────────────────────────────────────────────────
  section("4. Required tables");
  const tableResult = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  );
  const existingTables = new Set(tableResult.rows.map((r) => r.table_name));

  const missingTables = (REQUIRED_TABLES as readonly string[]).filter((t) => !existingTables.has(t));
  if (missingTables.length > 0) {
    for (const t of missingTables) {
      fail(`Missing table: ${t}`);
      errors++;
    }
  } else {
    pass(`All ${REQUIRED_TABLES.length} required tables present`);
  }

  // ── 5. Required columns ───────────────────────────────────────────────────
  section("5. Required columns");
  const colResult = await db.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
  );
  const existingCols = new Set(colResult.rows.map((r) => `${r.table_name}.${r.column_name}`));

  const missingCols = REQUIRED_COLUMNS.filter(
    ({ table, column }) => !existingCols.has(`${table}.${column}`)
  );
  if (missingCols.length > 0) {
    for (const { table, column } of missingCols) {
      fail(`Missing column: ${table}.${column}`);
      errors++;
    }
  } else {
    pass(`All ${REQUIRED_COLUMNS.length} required columns present`);
  }

  // ── 6. Summary ────────────────────────────────────────────────────────────
  section("Summary");
  if (warnings > 0) {
    warn(`${warnings} warning(s)`);
  }
  if (errors > 0) {
    console.error(`\n❌  AUDIT FAILED — ${errors} error(s), ${warnings} warning(s)`);
    console.error("    Fix: pnpm migrate\n");
    await db.end();
    process.exit(1);
  } else {
    console.log(`\n✅  AUDIT PASSED — 0 errors, ${warnings} warning(s)\n`);
    await db.end();
    process.exit(0);
  }
}

main().catch((err: unknown) => {
  console.error("❌  audit-migrations crashed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
