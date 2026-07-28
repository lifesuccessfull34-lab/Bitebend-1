---
name: Screenshot matching Priority 0 (chatJid)
description: Deterministic screenshot matching via session_bills.chat_jid; audit logging; compile fix for sendData scoping; deployment checklist.
---

## The rule
Priority 0 (chatJid match) is **additive only**. Never remove or weaken:
- Priority 1 (phone match)
- Priority 1.5 (phone mismatch + single-pending-bill)
- LID fallback (exactly-one-pending-bill when normalizedPhone is null)

**Why:** `sentMsg.id.remote._serialized === msg.from` is not yet proven in production for @lid conversations. The `[jid-audit]` logs must confirm 100% match rate before chatJid becomes the sole strategy.

## What was built
- **Migration 0027** (`lib/db/drizzle/0027_session_bill_chat_jid.sql`): adds nullable `chat_jid text` column + partial index on `session_bills`.
- **Schema** (`lib/db/src/schema/schema.ts`): `chatJid` column + `idx_session_bills_chat_jid` index.
- **Bridge `sendMessageController.ts`**: captures `sentMsg?.id?.remote?._serialized` as `chatJid`, returns it in response JSON, logs `[jid-audit:send]` comparing sent-to chatId vs returned chatJid.
- **Bridge `webhookSender.ts`**: `senderJid?: string` field in `PaymentScreenshotPayload`.
- **Bridge `incomingMessages.ts`**: passes `senderJid: msg.from` in both `sendPaymentScreenshotWebhook` call sites.
- **API `owner.ts`** (`sendSessionBill`): `sendData` hoisted outside try block (compile fix); reads `chatJid` from bridge response, stores in `session_bills.chatJid`.
- **API `whatsappBridge.ts`** (`POST /whatsapp/payment-screenshot`): Priority 0 block added; image download moved before LID fallback; `attachScreenshotToBill` helper deduplicates update logic; `[jid-audit]` logs added at P0, P1, and P1.5.

## compile fix
`sendData` was block-scoped inside a `try {}` but referenced after it. Fix: declare `let sendData: { success?: boolean; chatJid?: string | null } = {};` before the try, assign inside.

## jid-audit log keys to watch in production
All three audit log messages share `event: "jid_audit"` and include:
- `senderJid` — incoming msg.from
- `storedChatJid` — what was stored at bill-send time
- `jidMatch` — true/false/null (null = cannot compare, one side is absent)
- `chatJidPresent` — whether the bill had a chatJid stored at all
- `billAgeMs` — time between bill send and screenshot arrival

The send-side audit log is `event: "jid_audit_send"` and includes `sentTo` vs `sentMsgIdRemote`.

## Deployment checklist (Railway)
1. Migration 0027 must be applied to the production DB before deploying.
2. Deploy api-server + whatsapp-bridge together.
3. Monitor production logs for `[jid-audit]` entries on the next few Send Bill → Screenshot pairs.
4. Once `jidMatch: true` is confirmed for both @c.us and @lid conversations across ≥10 pairs, the audit logs can be stripped and chatJid can be promoted to the primary gate.

**How to apply:**
- Check for the audit log pattern before any further changes to the matching pipeline.
- If a future session sees `jidMatch: false` at P1 for a bill that has `chatJidPresent: true`, that is a genuine discrepancy worth investigating before relying on chatJid alone.
