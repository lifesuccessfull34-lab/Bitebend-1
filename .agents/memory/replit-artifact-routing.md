---
name: Replit artifact port routing
description: How the Replit artifact system routes traffic across ports in this monorepo.
---

## Rule

The Replit artifact system routes HTTP traffic by path at the infrastructure level:
- `/api/*` → port **8080** (API server — `artifacts/api-server: API Server` workflow)
- `/portal/*` → port **5000** (portal Vite dev server — `artifacts/portal: web` workflow)
- `/menu/*` → port **5173** (menu Vite dev server — `artifacts/menu: web` workflow)

Port 5000 is the main external port (mapped to externalPort 80 in .replit).

**Why:** The old architecture had the API server on port 5000 as a gateway proxy to portal (3000) and menu (5173). The Replit artifact system replaced this with its own path-based routing, so each artifact runs on its own port. The API server is now only on port 8080 — it never binds to 5000 in the current setup.

**How to apply:**
- The portal Vite server IS the entry point for port 5000. For any non-API, non-menu traffic that the portal needs to proxy (e.g. WebSockets to a third-party service), add a `server.proxy` entry in `artifacts/portal/vite.config.ts`.
- Example: WhatsApp Bridge Socket.IO uses `path: "/whatsapp-bridge/socket.io"`. Portal Vite proxies `/whatsapp-bridge` → `http://localhost:3001` with `ws: true`.
- The `Start application` workflow (which tried to run the API server on port 5000 as a gateway) is now obsolete and always fails due to port conflict with `artifacts/portal: web`. Ignore it.
- The `Portal Dev Server` (port 3000) and `Menu Dev Server` (port 5173) are also superseded by the artifact workflows but still configured in .replit; they don't conflict since those ports are free.
