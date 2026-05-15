import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@workspace/db";

async function main() {
  const migrationsFolder = path.join(__dirname, "migrations");
  console.log(`[migrate] running migrations from ${migrationsFolder}`);

  await migrate(db, { migrationsFolder });

  console.log("[migrate] all migrations applied successfully");
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
