---
name: WhatsApp media download DataError investigation
description: Root cause analysis of the DataError from IDBObjectStore.get() in the payment screenshot pipeline, and the instrumentation added to prove it.
---

## Root Cause (Hypothesis — confirmed by source analysis, pending log evidence)

`DataError: Failed to execute 'get' on 'IDBObjectStore': No key or key range specified`

### Why it throws

1. The 'message' event fires on the Node.js side.  `downloadMediaDirect` is called with `msg.id._serialized`.
2. Inside `pupPage.evaluate`, `WAWebCollections.Msg.get(msgId)` runs first.  For @lid messages (multi-device linked-device JIDs), or due to a timing race between the event firing and the WA Msg store being updated, this returns `null`.
3. The fallback path calls `WAWebCollections.Msg.getMessagesById([msgId])` — an **async IndexedDB lookup**.
4. Inside WA Web's IDB code, the msgId is parsed to build a compound key `[remoteJid, localId]`.  For `@lid`-format IDs (`false_<LID>@lid_<HEXID>`), the JID normalisation can return `undefined` for `remoteJid`.
5. `IDBObjectStore.get([undefined, '<HEXID>'])` → **DataError: No key or key range specified**.

### Why it was invisible

The old evaluate had a single outer `catch` that stamped everything as `reason: 'cdn_error', detail: 'outer: DataError...'`.  The step (1b_getMessagesById) and all message metadata were lost.

## Secondary issue (also present)

Step 2 — `msg.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1 })` — had `catch (_) { /* ignore */ }`.  If `msg.mediaKey === null`, WA Web's internal download hits IDB with a null key and throws a DataError that was silently discarded.  Now recorded in `mediaDump['step2_error']` instead.

## Instrumentation added (whatsappClient.ts)

`downloadMediaDirect` evaluate rewritten with per-step isolation:

- **Step 0**: `require('WAWebCollections')` — catches module load failure  
- **Step 1a**: `Msg.get(msgId)` — in-memory, no IDB; sets `msgFoundVia = 'memory'`  
- **Step 1b**: `Msg.getMessagesById([msgId])` — IDB fallback; sets `msgFoundVia = 'idb'`; **returns `reason: 'idb_error', step: '1b_getMessagesById'` if it throws** → this is the confirmation step for the hypothesis  
- **mediaDump**: captured after msg is found — `directPath`, `mediaKey`, `mediaKeyTimestamp`, `mimetype`, `filesize`, `encFilehash`, `filehash`, `type`, `msgId.*`, `mediaStage`, `allMsgKeys`, `rawMsgProps`  
- **Step 2**: DataError now recorded as `mediaDump['step2_error']` instead of silently swallowed  
- **Step 3**: directPath poll (existing fix for `r: r` bug)  
- **Step 5**: CDN download

No outer catch — unguarded paths surface as real Puppeteer exceptions in Node.js logs.

After evaluate: Node.js logs `step`, `msgFoundVia`, `mediaDump` at INFO level.

## How to read the logs

When the DataError fires, look for:
```
[media:dump] Download failed — browser-side diagnostics
  step: "1b_getMessagesById"    ← confirms IDB lookup is the source
  msgFoundVia: "error"          ← message was NOT in memory
  mediaDump.msgId_remote: null  ← confirms undefined key derivation
```

Or for step 2 variant:
```
  step: "post_3"  (no_directpath after poll)
  mediaDump.step2_error: "DataError: ..."
  mediaDump.mediaKey: null      ← confirms null mediaKey → IDB get(null)
```

## Live test infrastructure built

### Auto-fires on every IMAGE message (TEST 1 & 2)
`incomingMessages.ts` calls `probeMsgIdb()` before every download attempt.
Log label: `[test:pre-probe] IDB probe complete`
Fields logged: `fromSuffix`, `mem_found`, `mem_msgId_remote`, `idb_found`, `idb_error`,
`callsDuringGetById`, `allInvalidKeyCalls`, full `mem_rawProps` / `idb_rawProps`.

### On-demand REST endpoints
- `POST /api/diag/idb-probe` body `{restaurantId, msgId}` — TEST 4
- `GET  /api/diag/screenshot/:restaurantId` — TEST 3 (HTML page with PNG)
- `GET  /api/diag/idb-interceptor/:restaurantId` — read all IDB calls since 'ready'

### IDB interceptor
Injected via `page.evaluate()` in the 'ready' handler.
Patches `g.IDBObjectStore.prototype.get` to record every IDB key.
Stored in `window.__idbProbe = { calls[], errors[], patched }`.
`errors[]` entries have `storeName`, `queryPreview` (JSON of key), `stack`.

## Next steps (pending log evidence)

- If `step = '1b_getMessagesById'` and `msgFoundVia = 'error'`: fix is to skip the IDB fallback for @lid IDs (detect `@lid` in msgId before calling getMessagesById, return `no_msg` instead).
- If `step2_error` contains DataError and `mediaDump.mediaKey = null`: fix is to guard `msg.downloadMedia()` behind a `mediaKey !== null` check; messages with null mediaKey cannot be decrypted anyway.
- If `msgFoundVia = 'not_found'` (no error, just missing): pure timing race; solution is a short delay before the first evaluate attempt.

## Confirmed Production Bug (resolved)

The DataError in the payment screenshot pipeline was triggered entirely by **WhatsApp Status/Stories updates** (`from: status@broadcast`), not by real customer messages. These fire the standard `message` event in whatsapp-web.js but their IDB key format is incompatible with `getMessagesById()`.

**Fix applied in `incomingMessages.ts`**: added an early-exit guard after the `fromMe` check — `if (msg.from?.endsWith('@broadcast')) return;` — so all Status broadcasts are dropped before any download attempt.

**Why:** `@broadcast` JID suffix is WhatsApp's internal designation for Status/Stories. These are never customer payment screenshots. The bug caused infinite retry loops for every Status update the restaurant's WhatsApp received.
