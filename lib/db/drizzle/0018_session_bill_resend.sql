ALTER TABLE "session_bills" ADD COLUMN IF NOT EXISTS "resent_at" timestamp;
--> statement-breakpoint
ALTER TABLE "session_bills" ADD COLUMN IF NOT EXISTS "resent_count" integer DEFAULT 0 NOT NULL;
