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
  // Do NOT set min > 0.  A non-zero minimum keeps idle connections open which
  // PostgreSQL can terminate at any time (administrator command, maintenance,
  // deploy restart). When that happens, pg emits 'error' on the pool. Even
  // with an error handler the event may surface on drizzle-orm's internal
  // BoundPool wrapper before reaching our listener, crashing the process.
  // The ~150 ms cold-connection cost on first request is far cheaper than
  // repeated production crashes.
  max: 10,
});

// Safety net: log unexpected errors so they appear in production logs.
// pg emits 'error' on idle clients that are disconnected by the server.
// Without this listener Node.js would throw an unhandled error and crash.
pool.on("error", (err) => {
  console.error("[db] pool error (connection will be replaced):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
