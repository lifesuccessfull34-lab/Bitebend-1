ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "qr_image_data" text;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "qr_decoded_payload" text;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "qr_merchant_name" text;
