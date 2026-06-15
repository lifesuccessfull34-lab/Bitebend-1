---
name: Replit artifact path routing
description: How the Replit artifact system routes traffic across ports in this monorepo (both dev and prod), and the correct workflow command.
---

## Rule

The Replit artifact router does **path-based** routing in BOTH dev and production:

| External path prefix | Local port | Artifact |
|---|---|---|
| `/portal/*` | 5000 | Portal Vite dev server |
| `/api/*` | 8080 | API Server (Express) |
| `/menu/*` | 5173 | Menu Vite dev server |
| `/` (catch-all, non-prefixed) | 8080 | Routes to Express at 8080 |

`[[ports]]` mapping `localPort=5000 → externalPort=80` does NOT mean all paths hit port 5000. Only `/portal/*` and root catch-all path go to port 5000 by Replit routing.

**Why:** Confirmed by live testing — `/portal/login` → 200 (from port 5000 Vite), `/api/auth/me` → 401 (from port 8080 Express), `/menu/` → 200 (from port 5173 Vite directly, no Express headers). The `/` root path goes to port 8080 (Express catch-all).

## Critical: BASE_PATH must match the routing prefix

Without `BASE_PATH=/portal/`, Vite generates HTML with `<script src="/@vite/client">` — no `/portal/` prefix, so the artifact router never routes them to port 5000 → **504/502 → React JS never loads → blank page**.

With `BASE_PATH=/portal/`, all Vite internal paths gain the prefix:
- `/portal/@vite/client` → routed to port 5000 ✅
- `/portal/src/main.tsx` → routed to port 5000 ✅

## Correct workflow command (VERIFIED WORKING)

```bash
(PORT=8080 node --enable-source-maps artifacts/api-server/dist/index.mjs) & (BASE_PATH=/menu/ PORT=5173 pnpm --filter @workspace/menu run dev) & BASE_PATH=/portal/ PORT=5000 pnpm --filter @workspace/portal run dev
```

waitForPort: 5000, outputType: "webview"

- Portal Vite at port 5000 is the foreground process (workflow stays alive as long as Vite runs)
- API Express at port 8080, Menu Vite at port 5173 run in background via `&`
- NODE_ENV is "development" from the shared env var in .replit — do NOT set NODE_ENV=production in the command

## Code changes required

- **Portal vite.config.ts:** `const basePath = process.env.BASE_PATH ?? "/"` (was hardcoded `"/"`)
- **Portal App.tsx:** Already has `<WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>` — no change needed; reads Vite's BASE_URL automatically.
- **Menu vite.config.ts:** Already has `base: process.env.BASE_PATH ?? "/"` — no change needed.
- **API app.ts dev proxy:** Portal catch-all proxy must target `http://localhost:5000` (Portal Vite), NOT port 3000. Handles the `/` root path that Replit sends to port 8080.

## Portal Vite proxy config (vite.config.ts)

Portal Vite has built-in proxies (used for local dev only — Replit routes these directly):
- `/api` → `http://localhost:8080`
- `/menu` → `http://localhost:5173`
- `/whatsapp-bridge` → `http://localhost:3001`

## Root path behaviour

`/` goes to port 8080 (Express API). Express dev-mode catch-all proxy (`target: localhost:5000`) forwards to Portal Vite which redirects to `/portal/`. Result: `GET /` → 302 to `/portal/` ✅

## Production (deployment)

Portal built WITHOUT BASE_PATH (`base="/"`), menu built WITH `BASE_PATH=/menu/`. The deployment uses `static-server.mjs` files per artifact:
- `PORT=5000 node artifacts/portal/static-server.mjs`
- `PORT=8080 node artifacts/api-server/dist/index.mjs` (NODE_ENV=production)
- `PORT=5173 node artifacts/menu/static-server.mjs`

Do NOT run production Express on port 5000 in dev — it serves everything from one port but breaks the artifact routing.

## Session setup

Seeding: `pnpm --filter @workspace/api-server run seed:dev` — populates plans, admin, demo owner, Spice Garden restaurant, full menu, tables.

Demo credentials:
- Owner: `demo@spicegarden.com` / `demo123`
- Admin: `admin@bitebend.in` / `admin123`
