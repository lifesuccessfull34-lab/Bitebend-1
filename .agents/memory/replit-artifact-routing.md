---
name: Replit artifact path routing
description: How the Replit artifact system routes traffic across ports in this monorepo, and why BASE_PATH is critical for Vite dev servers.
---

## Rule

The Replit artifact router does **path-based** routing — not just port-based:

| External path prefix | Local port | Artifact |
|---|---|---|
| `/portal/*` | 5000 | Portal Vite dev server |
| `/api/*` | 8080 | API Server (Express) |
| `/menu/*` | 5173 | Menu Vite dev server |

`[[ports]]` mapping `localPort=5000 → externalPort=80` does NOT mean all paths hit port 5000. Only `/portal/*` is routed there.

## Critical: BASE_PATH must match the routing prefix

Without `BASE_PATH=/portal/`, Vite generates HTML with `<script src="/@vite/client">` and module URLs like `/src/main.tsx` — no `/portal/` prefix, so the artifact router never routes them to port 5000 → **504/502 → React JS never loads → blank page**.

With `BASE_PATH=/portal/`, all Vite internal paths gain the prefix:
- `/portal/@vite/client` → routed to port 5000 ✅
- `/portal/src/main.tsx` → routed to port 5000 ✅

**Symptom:** `/portal/login` → 200 (HTML loads) but page is blank. `/@vite/client` → 504. `localhost:5000/` works fine.

## Correct workflow command

```bash
(PORT=8080 node artifacts/api-server/dist/migrate.mjs && PORT=8080 NODE_ENV=development node --enable-source-maps artifacts/api-server/dist/index.mjs) &
BASE_PATH=/menu/ PORT=5173 pnpm --filter @workspace/menu run dev &
BASE_PATH=/portal/ PORT=5000 pnpm --filter @workspace/portal run dev
```

waitForPort: 5000, outputType: "webview"

## Code changes required

- **Portal vite.config.ts:** `const basePath = process.env.BASE_PATH ?? "/"` (was hardcoded `"/"`)
- **Portal App.tsx:** Already has `<WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>` — no change needed; reads Vite's BASE_URL automatically.
- **Menu vite.config.ts:** Already has `base: process.env.BASE_PATH ?? "/"` — no change needed.

## Production (api-server serves static files)

Portal built WITHOUT BASE_PATH (`base="/"`), menu built WITH `BASE_PATH=/menu/`. Express serves portal at `/`, menu at `/menu/`. No Vite dev servers. Do not run production Express on port 5000 in dev — it serves everything from one port but the artifact router won't forward `/api/*` or `/menu/*` to it.
