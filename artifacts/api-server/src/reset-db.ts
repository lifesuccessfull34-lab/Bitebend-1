/**
 * reset-db.ts
 * Wipes all application data from the database, then re-seeds with demo data.
 *
 * Run with: pnpm reset-db
 *
 * WARNING: This permanently deletes all data. Only use in development.
 * Production is protected by the NODE_ENV guard below.
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { seedDev } from "./seed-dev";

if (process.env.NODE_ENV === "production") {
  console.error("[reset-db] ❌  Refusing to run in production (NODE_ENV=production).");
  process.exit(1);
}

async function resetDb(): Promise<void> {
  console.log("[reset-db] Wiping all application data…");

  // Truncate in FK-safe order: children first, then parents.
  // RESTART IDENTITY resets serial sequences back to 1.
  // CASCADE is not used deliberately — we want an explicit ordered wipe.
  //
  // FK dependency graph (relevant to order):
  //   session_bills  → table_sessions, restaurants, users
  //   table_sessions → restaurants
  //   orders         → table_sessions (session_id, nullable)
  //   order_items    → orders
  //   bill_links     → image_blobs
  //   image_blobs    → (no FK deps)
  await db.execute(sql`
    TRUNCATE
      bill_links,
      image_blobs,
      session_bills,
      order_items,
      orders,
      menu_items,
      menu_categories,
      restaurant_tables,
      table_sessions,
      subscription_transactions,
      notifications,
      resources,
      owner_password_reset_tokens,
      admin_password_reset_tokens,
      sessions,
      restaurants,
      users,
      subscription_plans,
      platform_settings
    RESTART IDENTITY
  `);

  console.log("[reset-db] All tables cleared ✓");

  await seedDev();
}

resetDb()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[reset-db] failed:", err);
    process.exit(1);
  });
