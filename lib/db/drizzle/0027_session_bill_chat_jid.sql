-- Migration 0027: Add chat_jid to session_bills for deterministic WhatsApp screenshot matching.
--
-- Background
-- ──────────
-- When "Send Bill" fires, the bridge calls client.sendMessage(chatId, text).
-- wwebjs returns a Message object whose id.remote._serialized is the WhatsApp-
-- server-assigned JID for that conversation.  This JID is exactly what
-- msg.from returns on every inbound message in the same conversation — whether
-- the customer's device uses @c.us (standard) or @lid (multi-device linked
-- identity).
--
-- Storing id.remote._serialized as chat_jid at send-time gives the screenshot
-- webhook a deterministic lookup key:
--
--   senderJid (msg.from) === session_bills.chat_jid
--   → unambiguous single-bill match regardless of concurrent pending bills
--
-- Backward compatibility
-- ──────────────────────
-- Column is nullable.  Bills sent before this migration have NULL and the
-- existing phone-match + LID-fallback strategies are unchanged for them.

ALTER TABLE "session_bills" ADD COLUMN IF NOT EXISTS "chat_jid" text;

-- Partial index: only index rows that could be matched by Priority 0.
-- WHERE status='sent' keeps the index tiny (most bills progress quickly).
CREATE INDEX IF NOT EXISTS "idx_session_bills_chat_jid"
  ON "session_bills" ("restaurant_id", "chat_jid")
  WHERE "chat_jid" IS NOT NULL AND "status" = 'sent';
