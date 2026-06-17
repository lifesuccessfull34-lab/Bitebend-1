ALTER TABLE "session_bills" ADD COLUMN "resent_at" timestamp;
--> statement-breakpoint
ALTER TABLE "session_bills" ADD COLUMN "resent_count" integer DEFAULT 0 NOT NULL;
