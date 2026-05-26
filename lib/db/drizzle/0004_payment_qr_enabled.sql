ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "payment_qr_enabled" boolean NOT NULL DEFAULT false;
