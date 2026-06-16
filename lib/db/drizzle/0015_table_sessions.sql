-- Migration 0015: table_sessions + orders.session_id
--
-- Creates the table_sessions table as the database foundation for the new
-- billing architecture. A session groups all orders placed at a table during
-- a single sitting. orders.session_id links individual orders to a session.
--
-- Rollback (in order):
--   1. ALTER TABLE "orders" DROP COLUMN IF EXISTS "session_id";
--   2. DROP TABLE IF EXISTS "table_sessions";

CREATE TABLE IF NOT EXISTS "table_sessions" (
  "id"            serial PRIMARY KEY,
  "restaurant_id" integer NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "table_number"  text NOT NULL,
  "status"        text NOT NULL DEFAULT 'active',
  "created_at"    timestamp DEFAULT now() NOT NULL,
  "updated_at"    timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "table_sessions_status_check" CHECK (
    "status" IN ('active','awaiting_payment','awaiting_verification','paid','closed')
  )
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "session_id" integer REFERENCES "table_sessions"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_table_sessions_restaurant_id"     ON "table_sessions"("restaurant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_table_sessions_status"            ON "table_sessions"("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_table_sessions_restaurant_status" ON "table_sessions"("restaurant_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_session_id"                ON "orders"("session_id");
