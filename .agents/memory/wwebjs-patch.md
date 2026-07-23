---
name: whatsapp-web.js local patch
description: pnpm patch applied to whatsapp-web.js@1.34.7 Message.downloadMedia() — Bug A (@lid DataError) and Bug B (null directPath → {r:r})
---

## whatsapp-web.js@1.34.7 local patch

**Patch file:** `patches/whatsapp-web.js@1.34.7.patch`
**Applied via:** `pnpm patchedDependencies` in `pnpm-workspace.yaml` (auto-applied on every install)
**What it patches:** `src/structures/Message.js` — the `downloadMedia()` method only

### Bug A (@lid DataError) — what the patch does
Inside the `page.evaluate` block:
1. Step 1: `WAC.Msg.get(msgId)` — unchanged
2. Step 1-lid (NEW): if step 1 returns null AND msgId contains `@lid`, calls `window.WWebJS.enforceLidAndPnRetrieval(parts[1])` to resolve the LID JID to a phone WID, constructs `phoneId = false_<PHONE>@c.us_<HEXID>`, retries `WAC.Msg.get(phoneId)`
3. Step 2 — IDB fallback (MODIFIED): uses `phoneId ?? msgId` as lookup key (avoids passing @lid ID to WA Web's broken key builder); wrapped in try-catch so DataError never propagates

**Guarantees:**
- DataError never propagates unhandled (unconditional)
- Message in Backbone under @c.us form: step 1-lid finds it (conditional)
- Message in Backbone under @lid form: step 1 already finds it (unchanged)
- Message in IDB under @c.us form: step 2 with phoneId finds it (conditional)
- Message absent from Backbone AND in IDB under @lid only: null returned → caller retries

**Hard limit:** WA Web's `getMessagesById` IDB key builder (inside WA's minified CDN bundle) produces `[undefined, HEXID]` for @lid JIDs. This is inside unmodifiable WA internals. The patch avoids calling it with @lid IDs; if phone-translated ID also misses in IDB, null is returned and our `downloadMediaDirect()` retry queue handles it.

### Bug B (null directPath → CDN {r:r}) — what the patch does
After `msg.downloadMedia({downloadEvenIfExpensive: true})` resolves, if `msg.directPath` is still null:
- Poll loop: up to 20 × 150ms = 3 seconds total
- Each iteration re-fetches from Backbone: `WAC.Msg.get(msg.id._serialized)`
- Breaks when `directPath` appears on fresh model or via in-place write
- **Proven complete fix** — WA Web sets `mediaStage='RESOLVED'` before writing `directPath`; polling covers the async gap

### Upgrade notes
- When upgrading beyond 1.34.7: re-run `pnpm patch whatsapp-web.js@NEW_VERSION` and apply same changes
- `enforceLidAndPnRetrieval` was added in v1.34.0 (PR #3702) — patch requires ≥1.34.0
- Our `downloadMediaDirect()` in `whatsappClient.ts` is the primary download path; this patch makes the library's own `downloadMedia()` safer for any callers using it directly
