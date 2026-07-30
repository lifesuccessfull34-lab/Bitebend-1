---
name: Payment Screenshot Inbox
description: Architecture, constraints, and integration points for the screenshot inbox safety layer (migration 0028).
---

# Payment Screenshot Inbox

## Rule
The inbox is **additive only**. `screenshotMatcher.ts` and `screenshotMatchDecider.ts` must never be modified as part of inbox work.

**Why:** The atomic-transaction matcher is the source of truth for bill status. The inbox wraps it, never replaces it.

## Integration point in whatsappBridge.ts
Flow: hash → dedup check → INSERT inbox → matchAndAttachScreenshot() (unchanged) → UPDATE inbox → (if unmatched) emitScreenshotInboxEvent SSE.

All three DB operations (insert, unmatched-update, matched-update) are wrapped in try/catch and fire-and-forget so a DB hiccup never prevents the screenshot from reaching the bill.

## Duplicate detection
SHA-256(screenshotDataUrl) stored as `image_hash`. Window: same restaurant + same hash + within 5 minutes = duplicate. Returns early with `{ matchStrategy: "duplicate" }`. Does NOT insert into inbox.

## Manual Attach rules
- Allowed: `sent`, `awaiting_verification` (with soft-confirm if replacing)
- Blocked: `paid`, `cancelled`, `generated`
- Sets `matchingStrategy = 'manual'` on the inbox entry; emits existing `session-screenshot-received` SSE.

## Retry Matching
`POST /owner/screenshot-inbox/:id/retry-match` — re-runs `matchAndAttachScreenshot()` from stored `screenshotData`. Only allowed for `unmatched` / `ambiguous`. Re-derives `normalizedPhone` from stored `senderPhone`.

## 30-day retention
`screenshotCleanup.ts` nulls `screenshot_data` on inbox rows where `received_at < cutoff`. Keeps audit metadata (match_status, matched IDs, sender info) forever. `screenshotData` column is nullable in schema for this reason.

## Portal type note
`SessionBill` portal interface does NOT expose `screenshotUrl` — use `screenshotReceivedAt` to detect "has screenshot" on the frontend. Backend Drizzle schema has `screenshotUrl` directly.

## SSE events
- `session-screenshot-received` — existing, fires on any successful match (including manual attach and retry)
- `screenshot-inbox-received` — new, fires only on unmatched/ambiguous arrivals; triggers inbox refresh in dashboard

## How to apply
Any future change to the inbox (new filters, background retry job, etc.) should:
1. Only add to `screenshotInbox.ts` or `whatsappBridge.ts` inbox section
2. Never touch `matchAndAttachScreenshot()` or `matchScreenshotDecider()`
3. Confirm migration column names match Drizzle schema before referencing in routes
