import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Keep 2 warm connections ready so the first API request after a cold start
  // doesn't pay the full TCP+TLS handshake cost to PostgreSQL (~150–300 ms).
  min: 2,
  max: 10,
});

// CRITICAL: Without this handler, PostgreSQL terminating an idle minimum
// connection (e.g. administrator command, DB restart, or maintenance window)
// emits an unhandled 'error' event that crashes the Node.js process.
// With the handler, pg simply discards the dead client and opens a fresh one.
pool.on("error", (err) => {
  // Log to stderr so it shows up in production logs without importing pino here.
  // The pool automatically replaces the terminated connection.
  console.error("[db] idle client error (connection will be replaced):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
