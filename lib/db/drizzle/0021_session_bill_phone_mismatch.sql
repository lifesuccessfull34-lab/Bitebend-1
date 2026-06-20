ALTER TABLE "session_bills" ADD COLUMN "sender_phone" text;
ALTER TABLE "session_bills" ADD COLUMN "phone_mismatch" boolean NOT NULL DEFAULT false;
