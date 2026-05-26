CREATE TABLE IF NOT EXISTS "bill_links" (
  "id" uuid PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL,
  "image_blob_id" uuid NOT NULL,
  "hmac_signature" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "bill_links_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade,
  CONSTRAINT "bill_links_image_blob_id_image_blobs_id_fk"
    FOREIGN KEY ("image_blob_id") REFERENCES "public"."image_blobs"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bill_links_order_id_idx" ON "bill_links" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bill_links_expires_at_idx" ON "bill_links" ("expires_at");
