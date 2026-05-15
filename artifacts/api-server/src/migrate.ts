import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
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
  // drizzle uses the "drizzle" schema, not public
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
    // drizzle SHA-256 hashes the raw SQL file content
    const hash = createHash("sha256").update(sqlContent).digest("hex");
    // drizzle skips a migration when: lastRow.created_at >= migration.folderMillis
    // folderMillis = entry.when from the journal, so we must use that exact value
    const createdAt = entry.when;
    await db.execute(
      sql`INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${createdAt})`
    );
    console.log(`[migrate] stamped ${entry.tag} (when=${createdAt})`);
  }
}

async function main() {
  const migrationsFolder = path.join(__dirname, "migrations");
  console.log(`[migrate] running migrations from ${migrationsFolder}`);

  try {
    await migrate(db, { migrationsFolder });
    console.log("[migrate] all migrations applied");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const causeMsg = String((err as any)?.cause?.message ?? "");
    const causeCode = String((err as any)?.cause?.code ?? "");
    // 42P07 = PostgreSQL "duplicate_table"; drizzle wraps the pg error so we
    // must check the cause, not just the outer message.
    const isDuplicateTable =
      causeCode === "42P07" ||
      causeMsg.includes("already exists") ||
      msg.includes("already exists");
    // "already exists" means the DB was bootstrapped with `push`, not migrate.
    // Stamp every migration in the journal so migrate() becomes a no-op, then retry.
    if (isDuplicateTable) {
      console.log("[migrate] push-initialised DB detected — stamping journal and retrying");
      await stampPushInitialisedDb(migrationsFolder);
      await migrate(db, { migrationsFolder });
      console.log("[migrate] all migrations applied");
    } else {
      throw err;
    }
  }

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
