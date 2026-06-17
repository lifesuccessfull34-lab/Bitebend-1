CREATE TABLE "session_bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"restaurant_id" integer NOT NULL,
	"bill_number" text NOT NULL,
	"subtotal" integer NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"status" text DEFAULT 'generated' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_bills_bill_number_unique" UNIQUE("bill_number"),
	CONSTRAINT "session_bills_status_check" CHECK (status IN ('generated','sent','awaiting_verification','paid','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "session_bills" ADD CONSTRAINT "session_bills_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_bills" ADD CONSTRAINT "session_bills_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_session_bills_session_id" ON "session_bills" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "idx_session_bills_restaurant_id" ON "session_bills" USING btree ("restaurant_id");
