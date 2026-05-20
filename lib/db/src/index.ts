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
export const db = drizzle(pool, { schema });

export * from "./schema";
