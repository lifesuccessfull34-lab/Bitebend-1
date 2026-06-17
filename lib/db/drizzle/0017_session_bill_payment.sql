ALTER TABLE "session_bills" ADD COLUMN "customer_phone" text;
--> statement-breakpoint
ALTER TABLE "session_bills" ADD COLUMN "sent_at" timestamp;
--> statement-breakpoint
ALTER TABLE "session_bills" ADD COLUMN "screenshot_url" text;
--> statement-breakpoint
ALTER TABLE "session_bills" ADD COLUMN "screenshot_received_at" timestamp;
--> statement-breakpoint
ALTER TABLE "session_bills" ADD COLUMN "verified_at" timestamp;
--> statement-breakpoint
ALTER TABLE "session_bills" ADD COLUMN "verified_by" integer;
--> statement-breakpoint
ALTER TABLE "session_bills" ADD CONSTRAINT "session_bills_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
