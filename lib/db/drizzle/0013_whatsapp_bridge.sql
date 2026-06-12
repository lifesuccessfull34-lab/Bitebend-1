ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "whatsapp_status" text NOT NULL DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS "whatsapp_phone" text;
