-- Migration 0020: dine-in session phone ownership
-- Stores customer_phone on dine-in sessions so we can:
--   1. Reuse an active session for the same phone across tables (Rule 1)
--   2. Block a different phone from sharing an active table session (Rule 3)
--   3. Block a new session when a sent/awaiting-verification bill exists (Rule 4)
--
-- The column already exists (added in 0019 for takeaway). This migration
-- adds the matching partial index for dine_in, mirroring idx_table_sessions_takeaway_phone.
--> statement-breakpoint
-- Backfill: claim existing active dine-in sessions that have no phone yet,
-- using the earliest order placed in that session.
UPDATE "table_sessions" ts
SET "customer_phone" = (
  SELECT o."customer_phone"
  FROM "orders" o
  WHERE o."session_id" = ts."id"
  ORDER BY o."created_at" ASC
  LIMIT 1
)
WHERE ts."session_type" = 'dine_in'
  AND ts."customer_phone" IS NULL
  AND ts."status" = 'active';
--> statement-breakpoint
-- Partial index: fast dine-in session lookup by restaurant + phone + status
CREATE INDEX IF NOT EXISTS "idx_table_sessions_dine_in_phone"
  ON "table_sessions" ("restaurant_id", "customer_phone", "status")
  WHERE "session_type" = 'dine_in';
