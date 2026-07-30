-- Migration 0028: payment_screenshot_inbox
--
-- Creates a persistent inbox for every incoming WhatsApp payment screenshot.
-- The inbox is populated BEFORE the matching engine runs, so no screenshot
-- is silently discarded when matching fails (wrong phone, @lid sender,
-- ambiguous candidates, future algorithm changes, etc.).
--
-- Design
-- ──────
-- • Every incoming screenshot gets an inbox row immediately (source of truth).
-- • After matching, the row is updated with match_status + matched IDs.
-- • Unmatched / ambiguous rows remain visible in the dashboard for manual
--   review or retry.
-- • Duplicate detection uses image_hash + 5-minute window to skip re-inserts
--   when the customer sends the same screenshot multiple times.
-- • screenshot_data is nullable so the 30-day cleanup job can null it out
--   (same policy as orders.payment_screenshot_url) while preserving audit
--   metadata indefinitely.

CREATE TABLE IF NOT EXISTS "payment_screenshot_inbox" (
  "id"                  serial        PRIMARY KEY NOT NULL,
  "restaurant_id"       integer       NOT NULL,
  "received_at"         timestamp     NOT NULL,
  "sender_jid"          text,
  "sender_phone"        text,
  "screenshot_data"     text,
  "source"              text          NOT NULL DEFAULT 'whatsapp',
  "match_status"        text          NOT NULL DEFAULT 'unmatched',
  "matched_session_id"  integer,
  "matched_bill_id"     integer,
  "matching_strategy"   text,
  "image_hash"          text,
  "is_duplicate"        boolean       NOT NULL DEFAULT false,
  "duplicate_of_id"     integer,
  "created_at"          timestamp     NOT NULL DEFAULT now(),
  "updated_at"          timestamp     NOT NULL DEFAULT now(),
  CONSTRAINT "psi_restaurant_fk"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE,
  CONSTRAINT "psi_session_fk"
    FOREIGN KEY ("matched_session_id") REFERENCES "table_sessions"("id") ON DELETE SET NULL,
  CONSTRAINT "psi_bill_fk"
    FOREIGN KEY ("matched_bill_id") REFERENCES "session_bills"("id") ON DELETE SET NULL,
  CONSTRAINT "psi_match_status_check"
    CHECK (match_status IN ('matched', 'unmatched', 'ambiguous'))
);

CREATE INDEX IF NOT EXISTS "idx_psi_restaurant_status"
  ON "payment_screenshot_inbox" ("restaurant_id", "match_status");

CREATE INDEX IF NOT EXISTS "idx_psi_restaurant_received"
  ON "payment_screenshot_inbox" ("restaurant_id", "received_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_psi_image_hash"
  ON "payment_screenshot_inbox" ("restaurant_id", "image_hash")
  WHERE "image_hash" IS NOT NULL;
