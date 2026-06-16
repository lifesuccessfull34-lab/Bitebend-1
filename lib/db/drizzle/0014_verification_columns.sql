ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "verification_method" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "verified_by" integer;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "verified_at" timestamp;
