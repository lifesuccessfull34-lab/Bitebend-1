-- Allow tableNumber to be null — takeaway sessions have no table
ALTER TABLE "table_sessions" ALTER COLUMN "table_number" DROP NOT NULL;
--> statement-breakpoint
-- Session type discriminator: dine_in (default) | takeaway
ALTER TABLE "table_sessions" ADD COLUMN IF NOT EXISTS "session_type" text DEFAULT 'dine_in' NOT NULL;
--> statement-breakpoint
-- Customer phone stored on the session for takeaway grouping
ALTER TABLE "table_sessions" ADD COLUMN IF NOT EXISTS "customer_phone" text;
--> statement-breakpoint
-- Partial index: fast takeaway session lookup by restaurant + phone + status
CREATE INDEX IF NOT EXISTS "idx_table_sessions_takeaway_phone" ON "table_sessions" ("restaurant_id", "customer_phone", "status") WHERE session_type = 'takeaway';
--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_session_type_check" CHECK ("session_type" IN ('dine_in', 'takeaway'));
