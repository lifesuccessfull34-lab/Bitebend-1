ALTER TABLE "bill_links" ADD COLUMN "short_id" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "bill_links" ADD COLUMN "opened_at" timestamp;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bill_links_short_id_idx" ON "bill_links" ("short_id");
