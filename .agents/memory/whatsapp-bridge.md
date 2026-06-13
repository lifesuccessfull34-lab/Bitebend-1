---
name: WhatsApp Bridge integration
description: Architecture, file layout, and DB migration details for the WhatsApp Bridge service.
---

## Rule

The WhatsApp Bridge is a separate service (`@workspace/whatsapp-bridge`) at `services/whatsapp-bridge/`, running on port 3001. It uses `whatsapp-web.js` + Puppeteer (Chromium downloaded to `~/.cache/puppeteer/`) + Socket.IO.

**Why:** Each restaurant needs to link their own WhatsApp number via QR scan. The bridge manages per-restaurant WhatsApp sessions persistently (file-based session store at `services/whatsapp-bridge/sessions/`).

## Key files

- `services/whatsapp-bridge/src/index.ts` — Express + Socket.IO entry; routes at `/api/*`, health at `/health`
- `services/whatsapp-bridge/src/routes/index.ts` — bridge HTTP API: POST `/api/whatsapp/connect`, POST `/api/whatsapp/disconnect`, GET `/api/whatsapp/status`, GET `/api/whatsapp/status/:restaurantId`, POST `/api/send-message`
- `services/whatsapp-bridge/.env` — `BITEBEND_WEBHOOK_URL=http://localhost:8080/api/whatsapp/incoming` (port 8080, not 5000)
- `artifacts/api-server/src/routes/whatsappBridge.ts` — owner-facing API routes; proxies calls to bridge; webhook receiver at `/api/whatsapp/incoming`
- `artifacts/portal/src/pages/WhatsAppConnect.tsx` — portal WhatsApp QR page at `/portal/restaurant/whatsapp`

## DB migration

Migration `0013_whatsapp_bridge.sql` adds `whatsapp_status text NOT NULL DEFAULT 'disconnected'` and `whatsapp_phone text` to `restaurants`. The migration was applied via direct psql (not via `pnpm run migrate`) because Drizzle kit didn't pick it up. The journal entry for idx=13 was added manually to `lib/db/drizzle/meta/_journal.json`.

**How to apply:**
- `BRIDGE_API_SECRET` — optional env var; when empty, the bridge API is unprotected (OK for dev)
- `BITEBEND_WEBHOOK_SECRET` — optional env var; webhook accepts all payloads when empty
- Workflow name: "WhatsApp Bridge", command: `pnpm --filter @workspace/whatsapp-bridge run dev`, port 3001
- Portal Vite proxy in `artifacts/portal/vite.config.ts` routes `/whatsapp-bridge` → port 3001 with `ws: true` for Socket.IO
