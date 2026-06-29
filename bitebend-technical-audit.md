# Bitebend Final Technical Audit

*Audit Date: 29 June 2026 — Read-Only, no files modified*

---

## PART 1 — Migration Readiness Audit

### 1.1 Hardcoded `localhost` / `127.0.0.1` References

| # | File | Line | Detail | Migration Impact | Recommended Replacement |
|---|------|------|--------|-----------------|------------------------|
| 1 | `services/whatsapp-bridge/src/config/index.ts` | default | Incoming webhook URL defaults to `http://localhost:5000/api/whatsapp/...`; `publicBaseUrl` defaults to `http://localhost:3001` | Bridge silently sends webhooks to nowhere on any non-Replit host | Set `BITEBEND_WEBHOOK_URL` and `BRIDGE_PUBLIC_URL` env vars in deployment |
| 2 | `artifacts/api-server/src/index.ts` | 46 | Fallback site URL is `http://localhost:${port}` when no `SITE_URL` or `REPLIT_DOMAINS` present | QR codes and email links will resolve to localhost in production | Always set `SITE_URL` env var; remove the localhost final fallback |
| 3 | `artifacts/api-server/src/app.ts` | 111 | Vite proxy target `http://localhost:5173` (dev only) | Dev-only concern — not present in production build | Acceptable; this is the Vite dev proxy |
| 4 | `artifacts/api-server/src/lib/bridgeManager.ts` | 24 | Health check polls `http://localhost:${BRIDGE_PORT}/health` | Breaks if bridge is a separate container/pod on a different host | Expose `BRIDGE_HOST` env var; default to `localhost` only when co-located |
| 5 | `artifacts/api-server/src/lib/objectStorage.ts` | 6 | Comment mentions Replit sidecar auth at `http://127.0.0.1:1106` | Object storage is entirely stubbed — all writes return 404 | Replace stub with real S3/GCS client before migrating |
| 6 | `artifacts/portal/vite.config.ts` | proxy block | Dev proxy points to `localhost:8080`, `localhost:3001`, `localhost:5173` | Dev-only; not bundled into production | Acceptable; build output contains no references |
| 7 | `scripts/src/verify-bill-flow.ts` | `BASE = "http://localhost:80"` | Script hardcodes localhost for integration testing | Script unusable in CI against a remote host | Parameterise `BASE` from env or CLI arg |
| 8 | `scripts/src/doctor.ts` | 126, 145 | Checks `localhost` for API/bridge ports | Doctor script cannot diagnose a remote deployment | Acceptable for a local dev utility |

### 1.2 Replit-Specific Environment Variables & APIs

| # | File | Lines | Detail | Migration Impact |
|---|------|-------|--------|-----------------|
| 1 | `artifacts/api-server/src/index.ts` | 41–44 | Uses `REPLIT_DOMAINS` then `REPLIT_DEV_DOMAIN` to build the public site URL | On a VPS neither var exists → URL falls back to `http://localhost:${port}`; QR codes and bills will break | Always set `SITE_URL` on non-Replit hosts |
| 2 | `artifacts/api-server/src/app.ts` | 86, 88–95 | `secure` and `sameSite` cookie attributes toggled by presence of `REPL_ID` | On a VPS, `REPL_ID` is absent → cookies use `lax`/`false`; reverse-proxy HTTPS deployments will have broken sessions | Replace `REPL_ID` detection with `NODE_ENV === "production"` or `TRUST_PROXY=true` |
| 3 | `artifacts/portal/src/pages/TablesManagement.tsx` | URL resolver | Falls back through `REPLIT_DOMAINS` priority chain for QR URL construction | Same as above; QR URLs point to localhost without `SITE_URL` | Always set `SITE_URL` |
| 4 | `artifacts/api-server` `package.json` | deps | `@replit/object-storage` listed as a dependency | Package exists but the service is fully stubbed — no functional impact until object storage is re-enabled | Remove or replace with real object storage client |
| 5 | `artifacts/portal`, `artifacts/menu` | vite configs | `@replit/vite-plugin-runtime-error-modal`, `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner` | Graceful — these are dev-only plugins; production builds strip them | No action needed before migration; cosmetic in dev |

### 1.3 Hardcoded Ports

| Port | Where Used | Risk |
|------|-----------|------|
| `8080` | API server default | Low — controlled by `PORT` env var |
| `3001` | WhatsApp bridge default | Medium — hardcoded in bridge config and bridge manager; must match across both |
| `5000` | Portal Vite / static server | Low — controlled by `PORT` env var |
| `5173` | Menu Vite dev server | Low — dev only |
| `3099` | Internal (mapped to 3003 external) | Low — `.replit` only |

### 1.4 Absolute Paths

| File | Detail | Impact |
|------|--------|--------|
| `services/whatsapp-bridge/src/services/whatsappClient.ts` | Chromium search paths: `/usr/bin/chromium`, `/usr/bin/chromium-browser`, `/usr/bin/google-chrome`, `/usr/bin/google-chrome-stable`, `/snap/bin/chromium` | Chromium must be present at one of these paths on the host OS; Docker images must install it |
| `artifacts/api-server/src/lib/workspace.ts` | `WORKSPACE_ROOT` resolves paths relative to the bundle's `__dirname` | Works correctly via esbuild; acceptable |

### 1.5 Build & Deployment Assumptions

| Issue | Detail | Impact |
|-------|--------|--------|
| Frontend build-info.json | Server logs a `WARN` if `artifacts/menu/dist/public/build-info.json` is missing | Non-fatal but indicates frontend was not built before server start |
| Static file serving | Production API server serves portal/menu static files from hardcoded relative paths | Must mirror the same monorepo directory layout on the host |
| `pnpm` required | Entire monorepo requires `pnpm@10.26.1`; `npm`/`yarn` will fail (`preinstall` deletes their lockfiles) | Any Docker image must install pnpm before build |
| Node 20 engines field | `package.json` specifies `"node":"20.x"`; environment runs Node 24 | Produces warnings but does not block; update engines field |

### Migration Verdict

**Can this project be migrated today? NO**

**Blockers:**

1. **Object storage is entirely stubbed** — all image uploads (menu photos, logos, QR images) are stored as base64 in PostgreSQL and the `ObjectStorageService` returns 404 for all objects. This is functional but will not survive migration without a real storage backend.
2. **`SITE_URL` must be set explicitly** — without it QR codes, bill links, and password-reset URLs resolve to `localhost`. The fallback chain assumes Replit env vars.
3. **Cookie security tied to `REPL_ID`** — `secure`/`sameSite` cookie settings break on non-Replit HTTPS hosts unless `REPL_ID` is spoofed or the logic is replaced with `NODE_ENV=production`.
4. **Chromium must be pre-installed** on the target host for the WhatsApp bridge to function.
5. **Bridge-to-API coupling** — the bridge is spawned as a child process of the API server; any multi-container or Kubernetes deployment requires decoupling them into independent services.

---

## PART 2 — Security Audit

### Critical

| # | File | Line | Risk | Impact | Mitigation |
|---|------|------|------|--------|-----------|
| C-1 | `artifacts/api-server/src/routes/payments.ts` | 101 | **Webhook signature verification bypass** — when `razorpayWebhookSecret` is not set on the restaurant row, signature check is skipped entirely with a warning log | Attacker can POST a fake `payment.captured` event to mark any order paid without actually paying | Make the webhook secret mandatory; return 400 if missing instead of proceeding |
| C-2 | `artifacts/api-server/src/app.ts` | 63 | **CORS `origin: true`** — allows any origin with credentials | Cross-origin requests from any domain can read authenticated responses and trigger state-changing endpoints | Set an explicit allowlist: `origin: [process.env.SITE_URL, ...]` |
| C-3 | `artifacts/api-server/src/app.ts` | 81 | **Weak `SESSION_SECRET` fallback** — defaults to `"dev-secret-change-in-prod"` if env var is absent | If deployed without `SESSION_SECRET`, all sessions share a public default key; any party can forge session cookies | Throw and exit on startup if `SESSION_SECRET` is unset in `NODE_ENV=production` |

### High

| # | File | Line | Risk | Impact | Mitigation |
|---|------|------|------|--------|-----------|
| H-1 | `artifacts/api-server/src/app.ts` | 86–95 | **Cookie security conditioned on `REPL_ID`** — `sameSite:"none"` + `secure:true` only applies when `REPL_ID` is present | On a VPS without `REPL_ID`, cookies are sent as `sameSite:"lax"` over HTTP, enabling CSRF attacks against owner-dashboard endpoints | Condition on `NODE_ENV === "production"` or a `TRUST_PROXY` flag, not a Replit-specific variable |
| H-2 | `artifacts/api-server/src/routes/owner.ts` | ~2100+ | **No file-type verification beyond MIME header and extension** — image uploads check MIME type and extension, then process with `sharp` | Polyglot files (valid image + embedded payload) pass validation; `sharp` mitigates RCE risk but not all bypass vectors | Add magic-byte (file signature) verification before processing |
| H-3 | `artifacts/api-server/src/routes/owner.ts` | 2888 lines | **Monolithic route file** — auth middleware applied per-route manually throughout the file | Any new route added without `requireOwner` becomes a broken-access-control vulnerability | Split routes; apply middleware at router level for grouped endpoints |
| H-4 | `services/whatsapp-bridge/src/config/index.ts` | config | **Bridge API secret not enforced** — logs "NOT SET (unprotected)" and continues | Any process on the same network can call bridge endpoints (send messages, get QR) without authentication | Make `BRIDGE_API_SECRET` mandatory in production; reject all requests without it |
| H-5 | `artifacts/api-server/src/routes/images.ts` | all | **Unauthenticated image serving with no restaurant scoping** — all uploaded images accessible via `/api/images/:id` | Any image ID can be enumerated to retrieve competitor restaurant photos | Add restaurant ownership check or use UUIDs with sufficient entropy |

### Medium

| # | File | Line | Risk | Impact | Mitigation |
|---|------|------|------|--------|-----------|
| M-1 | `artifacts/api-server/src/app.ts` | 68–69 | **10 MB JSON body limit** — applies globally | DoS via large payloads on any public endpoint including `POST /api/menu/:id/orders` | Apply the 10MB limit only on upload routes; use 100KB for all others |
| M-2 | `artifacts/api-server/src/routes/menu.ts` | 413 | **Phone-number-based session reuse** — any order with the same phone number is linked to the same session | Phone number spoofing allows one customer to view or attach orders to another's session | Add table/restaurant context to session key; never rely on phone alone |
| M-3 | `artifacts/portal/src/pages/Profile.tsx` | 184, 188, 333, 337–338, 390 | **`console.log` leaks UPI VPA and QR decode data** — portal build config may differ from menu's terser settings | UPI VPA (`pa`) and merchant name visible in browser console in production | Remove all debug `console.log` calls; confirm portal terser config drops them |
| M-4 | `artifacts/menu/src/App.tsx` | 34 | **Route path logged on every navigation** | Low-severity info leak; confirms valid routes via console | Remove |
| M-5 | `lib/db/src/schema/schema.ts` | 95–99 | **Deprecated Razorpay columns still present** — `razorpay_key_id`, `razorpay_key_secret` stored on restaurant rows | Old Razorpay secrets remain in the database even after migration away from that flow | Schedule column removal migration; ensure secrets are not being populated |
| M-6 | `artifacts/api-server/src/routes/admin.ts` | 553–554 | **Razorpay platform keys in env vars and DB** — `RAZORPAY_KEY_SECRET` env var consulted as fallback | Secret leaks if env var inspection is possible | Move to secrets-manager; remove env-var fallback |

### Low

| # | File | Line | Risk | Impact | Mitigation |
|---|------|------|------|--------|-----------|
| L-1 | `artifacts/api-server/src/lib/rateLimiter.ts` | all | **Rate limiter is DB-backed** — works correctly but a DB outage disables rate limiting entirely | Under DB pressure, brute-force attacks on `/auth/forgot-password` become possible | Add an in-process circuit-breaker fallback (fail-closed: reject requests if DB unavailable) |
| L-2 | `artifacts/api-server/src/routes/adminAuth.ts` | 102–103 | **Password reset link returned in API response when SMTP not configured** — explicitly noted as "dev only" | If accidentally deployed without SMTP, reset links are visible to API callers | Add a hard block: if `NODE_ENV=production` and SMTP not configured, return 503, do not return the link |
| L-3 | No `helmet` middleware found | n/a | Missing HTTP security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, etc.) | Clickjacking, MIME sniffing, and downgrade attacks possible | Add `helmet()` as first middleware in `app.ts` |
| L-4 | No `compression` middleware found | n/a | Responses are not gzip/brotli compressed | Increases bandwidth; not a security issue but increases attack surface for timing analysis | Add `compression()` middleware |

---

## PART 3 — Production Readiness Audit

### Graceful Shutdown

| Issue | File | Impact | Recommendation |
|-------|------|--------|---------------|
| **No SIGTERM/SIGINT handler** on the main API server | `artifacts/api-server/src/index.ts` | In-flight HTTP requests are dropped; pg pool is not drained; any active SSE connections are severed abruptly | Add `process.on("SIGTERM", () => server.close(() => pool.end()))` |
| **No SIGTERM handler** on WhatsApp bridge | `services/whatsapp-bridge/src/index.ts` | Bridge killed via SIGKILL from bridgeManager after timeout; Puppeteer/Chromium processes may become orphans | Add handler that calls `client.destroy()` then exits cleanly |
| **Cleanup jobs use `.unref()`** | `artifacts/api-server/src/index.ts` | `purgeExpiredBills` / `purgeExpiredScreenshots` will not block shutdown but also will not complete a running iteration | Acceptable trade-off; document it |

### Unhandled Errors

| Issue | File | Impact | Recommendation |
|-------|------|--------|---------------|
| **No `process.on("unhandledRejection")`** | `artifacts/api-server/src/index.ts` | Node 24 throws on unhandled rejections by default; a single missed `.catch()` in startup code could crash the process | Add global handler that logs and optionally exits |
| **No `process.on("uncaughtException")`** | Both services | Same crash risk | Add with structured logging and process exit |
| **Background cleanup swallows all errors** | `billService.ts`, `screenshotCleanup.ts` | Persistent failures (e.g., DB connection loss) are silently ignored | Log errors at `warn` level with retry counting |

### Health Checks

| Item | Status | Notes |
|------|--------|-------|
| `/api/healthz` | ✅ Exists | Returns build metadata |
| `/api/health/db` | ✅ Exists | Verifies all 17+ tables exist |
| WhatsApp bridge `/health` | ✅ Exists | Basic uptime check |
| **Liveness vs readiness** | ❌ Missing | No separate readiness probe — Kubernetes cannot distinguish "starting up" from "ready to serve" |
| **Database latency check** | ❌ Missing | `/health/db` checks table existence but not query latency; a saturated DB passes the check |

### Environment Validation

| Item | Status | Notes |
|------|--------|-------|
| `PORT` | ✅ Throws on missing | Hard exit |
| `DATABASE_URL` | ✅ Throws on missing | Hard exit |
| `SESSION_SECRET` | ❌ Silent fallback | Falls back to `"dev-secret-change-in-prod"` — critical in production |
| `SITE_URL` | ❌ Silent fallback | Falls back through Replit vars to `localhost` |
| `BRIDGE_API_SECRET` | ❌ Logs warning, continues | Bridge runs unprotected |
| Razorpay keys | ✅ Graceful degradation | App functions without them (UPI fallback) |
| SMTP keys | ✅ Graceful degradation | Dev fallback in response (must block in prod) |

### Database Connection Resilience

| Item | Status | Notes |
|------|--------|-------|
| Pool error handler | ✅ | `pool.on("error")` prevents crash on idle connection termination |
| `min: 0` pool setting | ✅ | Prevents stale connection crashes on restart |
| Connection retry on startup | ✅ | Schema check on boot catches DB unavailability |
| Mid-flight reconnection | ✅ | `pg.Pool` handles automatically |
| Pool size `max: 10` | ⚠️ | Undersized for high-concurrency multi-tenant workloads |

---

## PART 4 — Scalability Audit

### Current Bottlenecks

| Component | Bottleneck | Severity |
|-----------|-----------|---------|
| **SSE (order events)** | In-memory `Map<restaurantId, Set<Response>>` in `orderEvents.ts` — events emitted on one Node instance never reach clients on another | Critical for horizontal scale |
| **WhatsApp bridge** | Single process, file-based session storage (`LocalAuth`), in-memory client `Map`, local `/uploads` directory for media | Hard horizontal scale blocker |
| **Image storage** | Base64 in PostgreSQL `image_blobs` table | Database bloat, slow backups, poor cache behaviour |
| **DB pool** | `max: 10` connections per instance | Becomes a bottleneck beyond ~3 concurrent instances |
| **Socket.IO (bridge QR)** | Local room management, no Redis adapter | Single-instance only |
| **API server ↔ bridge coupling** | Bridge spawned as child process; dies with API server | Prevents independent scaling |

### Future Bottlenecks (Beyond 500 restaurants)

| Component | Future Bottleneck |
|-----------|-------------------|
| PostgreSQL sessions table | Session cleanup with `connect-pg-simple` adds write load; partition by expiry |
| Dashboard stats | 6 parallel queries per request × concurrent restaurants = DB saturation |
| `sharp` PNG generation | CPU-bound, synchronous per request; no queue |
| Full menu fetches | No server-side caching; every customer scan hits DB |
| WhatsApp QR delivery | One Chromium instance per restaurant phone number |

### Recommended Architecture (Horizontal Scale)

```
                        ┌─────────────────┐
                        │  Load Balancer  │
                        └────────┬────────┘
               ┌─────────────────┼─────────────────┐
        ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
        │  API Server │   │  API Server │   │  API Server │
        └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
               └─────────────────┼─────────────────┘
                         Redis Pub/Sub (SSE events)
                                 │
                      ┌──────────▼──────────┐
                      │   PostgreSQL (RDS)   │
                      └─────────────────────┘
          ┌───────────────────────────────────────────┐
          │  WhatsApp Bridge Pool (separate service)  │
          │  + Remote session store (Redis/S3)        │
          └───────────────────────────────────────────┘
                      ┌──────────────────┐
                      │  S3/GCS Storage  │
                      └──────────────────┘
```

---

## PART 5 — Performance Audit

### Missing Database Indexes

| Table | Column(s) | Query Location | Impact |
|-------|-----------|----------------|--------|
| `menu_items` | `restaurant_id` | `routes/menu.ts` (every menu fetch) | Full table scan on large catalogs |
| `menu_categories` | `restaurant_id` | `routes/menu.ts` | Same |
| `users` | `restaurant_id` | Auth middleware | Per-request owner lookup |
| `order_items` | `order_id` | `routes/owner.ts:437` | Joins slow when order count grows |
| `notifications` | `restaurant_id` | Dashboard load | Full scan per dashboard open |
| `restaurants` | `slug` | Menu routing | Menu URL lookup hits full scan |

*Note: `table_sessions`, `session_bills`, and `orders.session_id` do have proper indexes.*

### N+1 Queries

| Location | File | Description |
|----------|------|-------------|
| `getDashboardStats` | `routes/owner.ts:2085` | 6 separate `SELECT` calls per dashboard load (parallelised with `Promise.all` — acceptable but not optimal) |
| Per-order item fetch | `routes/owner.ts:462` | `getOwnerOrder` fetches items per-request; if client lists then fetches each, N+1 occurs at application layer |

### Large Objects & Blocking Operations

| Issue | File | Impact |
|-------|------|--------|
| `sharp` PNG bill generation | `routes/owner.ts:653` | CPU-bound, blocks event loop; no queue or worker pool |
| QR code generation with `H` error correction | `routes/owner.ts:401` | More CPU-intensive than necessary for most use cases |
| Base64 menu images in API response | `routes/menu.ts` | Full base64 blob transmitted in every menu fetch (every customer table scan) |
| 10 MB JSON body limit globally | `app.ts:68` | Entire large body buffered in memory before any validation |

### Missing Performance Middleware

| Middleware | Status | Impact |
|-----------|--------|--------|
| `compression` (gzip/brotli) | ❌ Not found | All JSON responses transmitted uncompressed; significant on full-menu payloads |
| HTTP caching headers on menu | ❌ Missing | Menu data (rarely changes) re-fetched fresh on every customer scan |
| `ETag` / `Last-Modified` | ❌ Missing | No conditional GET support |

### Frontend Bundle

| Artifact | Status |
|----------|--------|
| Menu bundle | Terser minification, manual chunks (vendor-react, vendor-icons, vendor-ui, vendor-core), legacy polyfills |
| Portal bundle | Terser, legacy polyfills |
| `chunkSizeWarningLimit: 600` | ⚠️ Suppresses warnings; actual bundle may exceed reasonable thresholds |

---

## PART 6 — Disaster Recovery Audit

| Failure Scenario | Current State | Missing |
|-----------------|--------------|---------|
| **Server crash** | Replit/systemd restarts the process; bridge manager auto-restarts bridge with exponential backoff ✅ | No health-check-based auto-restart outside of Replit |
| **Database failure** | Pool error handler prevents crash; new requests fail with 500 ⚠️ | No circuit breaker; no retry queue for failed requests |
| **Database corruption** | **No automated backup strategy documented** ❌ | Replit managed DB has snapshots but no documented restore procedure in repo |
| **Lost `SESSION_SECRET`** | All active sessions invalidated; users must re-login | Acceptable — document in runbook |
| **Lost `DATABASE_URL`** | Server refuses to start (throws on boot) ✅ | N/A |
| **Lost uploads** | Images stored as base64 in DB — survives with DB backup ✅ | No object storage to lose — but DB restore complexity increases |
| **WhatsApp bridge failure** | Bridge manager restarts with back-off ✅ | Chromium zombie processes may accumulate; no process-count guard |
| **Chromium failure** | Bridge restart loop will eventually hit back-off ceiling | No fallback for WhatsApp delivery; orders continue but notifications stop |
| **SSL expiration** | Managed by Replit/host ✅ | On self-hosted VPS, cert renewal must be configured (certbot/caddy) |
| **Rollback** | No documented rollback procedure ❌ | Database migrations are irreversible forward-only; no `down` migrations exist |
| **Backup restoration** | `bitebend_backup.sql` present in repo ⚠️ | **Backup file committed to the repository** — potential data exposure; should never be in version control |
| **DNS migration** | `SITE_URL` env var centralises the domain; changing it updates QR codes on next generation ✅ | Old QR codes already distributed to customers will break |
| **Recovery time** | Estimated: ~3–5 min for API restart; ~30 sec for WhatsApp bridge init; ~60 sec for Chromium/QR session init | No documented RTO/RPO |
| **Point-in-time recovery** | Not configured ❌ | No WAL archiving, no PITR |

**Critical Finding:** `bitebend_backup.sql` is present in the repository root. This file likely contains real customer/restaurant data, passwords (even if hashed), and PII. It must be removed from git history immediately.

---

## PART 7 — Technical Debt Audit

### Dead / Deprecated Code

| Item | Location | Notes |
|------|----------|-------|
| `RazorpayCheckout.tsx` (legacy) | `artifacts/menu/src/pages/menu/legacy/` | Explicitly `@deprecated`; retained for rollback only |
| `RazorpayCheckout.tsx` (stub) | `artifacts/menu/src/pages/menu/` | Re-exports from legacy file |
| Razorpay columns | `lib/db/src/schema/schema.ts:95–99` | `razorpay_key_id`, `razorpay_key_secret` marked `@deprecated` on restaurant schema |
| `ENABLE_CUSTOMER_RAZORPAY` routes | `routes/menu.ts:722, 940` | Two entire route handlers gated behind `false` by default |
| Legacy order status mapping | `routes/owner.ts:485`, `Dashboard.tsx:64` | `LEGACY_ENTRY` set for backward compatibility |

### Code Duplication

| Item | Locations | Recommendation |
|------|-----------|---------------|
| Entire `shadcn/ui` component library | `artifacts/menu/src/components/ui/` **and** `artifacts/portal/src/components/ui/` | Extract to `lib/ui` shared package |
| Utility functions (`safeDecodeURIComponent`, `normalizeRestaurantParam`) | Duplicated across packages | Already have `lib/url-utils` — consolidate there |

### Large Files (Maintainability Risk)

| File | Lines | Problem |
|------|-------|---------|
| `artifacts/api-server/src/routes/owner.ts` | **2,888** | Mixes order management, profile updates, QR generation, bridge comms, analytics |
| `artifacts/portal/src/pages/Admin.tsx` | **2,947** | Entire super-admin UI in one component |
| `artifacts/portal/src/pages/Dashboard.tsx` | **1,353** | Dashboard + live orders + tables in one file |

### TODO/FIXME/Workarounds

| Location | Type | Detail |
|----------|------|--------|
| `routes/owner.ts:41–77` | Workaround | `tryBridgeSend` falls back to WhatsApp deep links when bridge is unavailable — functional but masks bridge failures |
| `lib/db/src/schema/schema.ts:269` | Legacy | `legacy` audit trail method alongside `ocr_ai` and `manual_staff` |
| `tsconfig.base.json:11` | Config smell | `"noUnusedLocals": false` hides dead variables across all packages |

### Unused / Risky Dependencies

| Package | Location | Status |
|---------|----------|--------|
| `razorpay` | `artifacts/api-server` | Potentially removable once Razorpay flow retired |
| `google-auth-library` | `artifacts/api-server` | Unclear usage; not found in active code paths |
| `@replit/object-storage` | `artifacts/api-server` | Imported but service is fully stubbed |
| `xlsx` | `artifacts/api-server` | Not verified as actively used in current routes |
| `@google-cloud/storage` | `artifacts/api-server` | Not used in active code (object storage stubbed) |

---

## PART 8 — Cost Optimization Audit

### Resource Estimates (Current Architecture)

| Resource | Estimate | Notes |
|----------|---------|-------|
| **CPU** | 0.5–1.5 vCPU idle; 2+ vCPU under bill generation or OCR | `sharp` and Puppeteer/Chromium are the primary consumers |
| **RAM** | ~400–600 MB base (API + bridge + Chromium) | Chromium alone consumes ~150–300 MB per WhatsApp session |
| **Database storage** | Grows ~50–200 MB/month per 100 active restaurants | Base64 images stored in DB inflate size 33% over binary |
| **Image storage** | Included in DB above; no separate object storage currently | High cost — PostgreSQL is not optimised for blob storage |
| **Bandwidth** | Base64 menu images in API responses are ~33% larger than binary | Every customer table scan downloads full base64 image payloads |
| **OCR (OpenAI GPT-4o-mini)** | ~$0.0002/screenshot with OCR enabled | Disabled by default; negligible when off |
| **WhatsApp bridge** | No API costs; Chromium memory is the cost | One Chromium process per connected restaurant phone number |

### VPS Recommendations

| Deployment | Minimum Spec | Recommended Spec |
|-----------|-------------|-----------------|
| **Single-restaurant / dev** | 1 vCPU, 1 GB RAM | 2 vCPU, 2 GB RAM |
| **<100 restaurants** | 2 vCPU, 4 GB RAM | 4 vCPU, 8 GB RAM + managed PostgreSQL |
| **100–1,000 restaurants** | 4 vCPU, 8 GB RAM (single node) | Separate API cluster (3× 2 vCPU), dedicated DB, Redis, bridge farm |
| **1,000+ restaurants** | Kubernetes required | See scalability architecture above |

### Estimated Monthly Infrastructure Cost

| Scale | Infrastructure | Estimated Cost (USD/month) |
|-------|---------------|--------------------------|
| <50 restaurants | 2 vCPU/4GB VPS + managed PostgreSQL 5GB | $30–60 |
| 50–500 restaurants | 4 vCPU/8GB VPS + managed PostgreSQL 20GB + S3 | $80–150 |
| 500–2000 restaurants | 3-node cluster + managed PostgreSQL + Redis + CDN | $300–600 |

---

## FINAL REPORT

### 1. Executive Summary

Bitebend is a well-structured, feature-complete QR restaurant ordering platform with thoughtful engineering in several areas — database resilience, session management, payment flow design, and the WhatsApp bridge lifecycle. However, it has a cluster of issues that would cause failures in production outside of Replit: broken cookie security detection, CORS open to all origins, an unenforced webhook signature bypass, a fully stubbed object storage layer, and no graceful shutdown. Several of these are single-line fixes but they are currently blocking a safe migration.

---

### 2. Migration Readiness Score: 52 / 100

Strong: monorepo build pipeline, migration system, env-var-driven config.  
Weak: Replit-specific cookie/URL logic, stubbed object storage, hardcoded localhost fallbacks.

### 3. Security Score: 61 / 100

Strong: bcrypt, session regeneration, DB rate limiter, per-route auth middleware, payment screenshot validation.  
Weak: CORS wildcard, webhook bypass, missing `helmet`, weak session-secret fallback, open bridge endpoint.

### 4. Production Readiness Score: 58 / 100

Strong: health checks, auto-seed, DB schema validation on startup, bridge auto-restart.  
Weak: no graceful shutdown, no global error handlers, `SESSION_SECRET` silent fallback, no readiness probe.

### 5. Scalability Score: 34 / 100

Strong: PostgreSQL session store is stateless across instances.  
Weak: In-memory SSE map, single-instance bridge, base64 images in DB, child-process coupling, 10-connection pool limit.

### 6. Performance Score: 55 / 100

Strong: parallel DB queries in dashboard stats, TanStack Query client caching, manual chunk splitting.  
Weak: No `compression`, no HTTP caching on menu, missing indexes on hot paths, synchronous `sharp` bill generation.

### 7. Disaster Recovery Score: 38 / 100

Strong: bridge auto-restart, pool error handler.  
Weak: No documented backup strategy, no down-migrations, backup SQL committed to repo, no PITR, no rollback procedure.

### 8. Technical Debt Score: 54 / 100

Strong: clean TypeScript, Drizzle ORM usage, OpenAPI codegen.  
Weak: Two 2,900-line files, duplicate UI component libraries, dead Razorpay code, stubbed packages.

### 9. Cost Efficiency Score: 60 / 100

Strong: No per-message WhatsApp API costs, GPT-4o-mini when OCR enabled.  
Weak: Base64 images inflate DB by 33%, no compression increases bandwidth costs, no CDN for static assets.

### 10. Overall Project Score: 52 / 100

---

### 11. Critical Issues

| # | Issue |
|---|-------|
| C-1 | Razorpay webhook signature verification can be bypassed when secret is not configured — fake payments possible |
| C-2 | CORS `origin: true` allows any domain to make credentialed requests |
| C-3 | `SESSION_SECRET` falls back to a public default string — session forgery possible if not set in production |
| C-4 | `bitebend_backup.sql` committed to the repository — likely contains real PII/hashed passwords |

### 12. High Priority Issues

| # | Issue |
|---|-------|
| H-1 | Cookie `secure`/`sameSite` logic tied to `REPL_ID` — breaks on any non-Replit HTTPS host |
| H-2 | Object storage entirely stubbed — images stored as base64 in PostgreSQL |
| H-3 | Bridge runs completely unauthenticated — any LAN peer can send WhatsApp messages or retrieve QR codes |
| H-4 | No graceful shutdown — in-flight requests dropped on deploy/restart |
| H-5 | No `helmet` middleware — missing all standard HTTP security headers |
| H-6 | `SITE_URL` not set → QR codes and bill links resolve to `localhost` |

### 13. Medium Priority Issues

| # | Issue |
|---|-------|
| M-1 | In-memory SSE `Map` — horizontal scaling of API server impossible without Redis Pub/Sub |
| M-2 | Missing indexes on `menu_items.restaurant_id`, `menu_categories.restaurant_id`, `users.restaurant_id`, `order_items.order_id`, `notifications.restaurant_id`, `restaurants.slug` |
| M-3 | No `compression` middleware — all responses sent uncompressed |
| M-4 | No graceful shutdown on WhatsApp bridge — Chromium zombie processes possible |
| M-5 | `console.log` statements in portal and menu production code leak UPI VPA and route info |
| M-6 | `owner.ts` (2,888 lines) and `Admin.tsx` (2,947 lines) are unmaintainable monoliths |
| M-7 | Password reset link returned in API response when SMTP not configured — must be blocked in production |
| M-8 | `DB pool max: 10` — undersized for multi-tenant concurrent load |
| M-9 | No unhandled promise rejection / uncaught exception handlers on either service |

### 14. Low Priority Issues

| # | Issue |
|---|-------|
| L-1 | Rate limiter DB-backed — no fallback if DB unavailable; brute force becomes possible under DB pressure |
| L-2 | Duplicate `shadcn/ui` component libraries across menu and portal artifacts |
| L-3 | Deprecated Razorpay code, columns, and routes still present |
| L-4 | `tsconfig.base.json` has `noUnusedLocals: false` hiding dead code |
| L-5 | `google-auth-library`, `@google-cloud/storage`, `xlsx` listed as dependencies — not clearly active |
| L-6 | `engines.node: "20.x"` in `package.json` while runtime is Node 24 |
| L-7 | `verify-bill-flow.ts` script has hardcoded `localhost:80` |
| L-8 | No HTTP caching (`ETag`, `Cache-Control`) on public menu endpoint |
| L-9 | No readiness vs liveness probe separation for Kubernetes deployments |

---

### 15. Production Deployment Checklist

- [ ] Set `SESSION_SECRET` to a cryptographically random 64-byte hex string — never use the default
- [ ] Set `SITE_URL` to the production domain (e.g. `https://bitebend.in`)
- [ ] Set `NODE_ENV=production`
- [ ] Set `BRIDGE_API_SECRET` and enforce it in bridge request validation
- [ ] Restrict CORS `origin` to `[SITE_URL]` and any known app domains
- [ ] Configure Razorpay webhook secrets on every restaurant row before going live
- [ ] Install Chromium on the production host; verify path is in bridge search list
- [ ] Add `helmet()` as first middleware in `app.ts`
- [ ] Add `compression()` middleware
- [ ] Add graceful shutdown handlers (`SIGTERM` → `server.close()` → `pool.end()`)
- [ ] Add `process.on("unhandledRejection")` and `process.on("uncaughtException")` handlers
- [ ] Block password-reset-link-in-response when `NODE_ENV=production` and SMTP not set
- [ ] Replace `REPL_ID` cookie-security check with `NODE_ENV === "production"` or `TRUST_PROXY` flag
- [ ] Remove `bitebend_backup.sql` from repository and purge from git history
- [ ] Run `pnpm migrate` before starting the server on first deploy
- [ ] Configure automated PostgreSQL backups (daily snapshot minimum)

---

### 16. Migration Checklist

- [ ] Set `SITE_URL` — QR codes, bills, and password-reset links depend on it
- [ ] Replace `REPL_ID`-based cookie detection with `NODE_ENV` check
- [ ] Verify Chromium path on target OS; update bridge search paths if needed
- [ ] Decouple bridge from API server process (run as independent service)
- [ ] Replace `@replit/object-storage` stub with a real S3/GCS client
- [ ] Update `.replit`-specific port routing assumptions in any reverse-proxy config
- [ ] Set `BRIDGE_HOST` env var if bridge runs in a separate container
- [ ] Remove `REPLIT_DOMAINS` and `REPLIT_DEV_DOMAIN` references after replacing with `SITE_URL`
- [ ] Update Docker/VPS nginx/caddy to proxy `/api` → port 8080, `/menu` → 5173 (or static), `/portal` → 5000 (or static)
- [ ] Purge `bitebend_backup.sql` from git history before migrating repository

---

### 17. Security Checklist

- [ ] Enforce `SESSION_SECRET` presence on startup in production — throw, do not default
- [ ] Restrict CORS to explicit origin allowlist
- [ ] Make Razorpay webhook secret mandatory — reject webhook if missing
- [ ] Add `helmet()` middleware for HTTP security headers
- [ ] Add `compression()` middleware
- [ ] Require `BRIDGE_API_SECRET` in production — reject unauthenticated bridge calls
- [ ] Remove `console.log` statements leaking UPI VPA and route info
- [ ] Add magic-byte validation to image upload handler
- [ ] Scope image serving to restaurant ownership or use UUID with sufficient entropy
- [ ] Block password-reset link in API response when SMTP not configured in production
- [ ] Add `process.on("unhandledRejection")` handlers to prevent silent failures
- [ ] Reduce global JSON body limit from 10 MB to ~100 KB; apply 10 MB only on upload routes
- [ ] Remove `bitebend_backup.sql` from git and rotate any credentials it contains

---

### 18. Disaster Recovery Checklist

- [ ] Document and test database backup restoration procedure
- [ ] Configure automated daily PostgreSQL snapshots with 7-day retention minimum
- [ ] Configure point-in-time recovery (WAL archiving) for production
- [ ] Document RTO and RPO targets
- [ ] Write runbook for: server crash, DB failure, bridge failure, SSL expiry, DNS change
- [ ] Add graceful shutdown handlers to ensure clean DB pool drain on restart
- [ ] Implement Chromium zombie-process guard in bridge manager (max child count)
- [ ] Create `down` migration scripts for each schema change (or document manual rollback SQL)
- [ ] Remove `bitebend_backup.sql` from repository immediately
- [ ] Store `SESSION_SECRET` and `DATABASE_URL` in a secrets manager; document recovery if lost
- [ ] Test full restore from backup in a staging environment before production migration

---

### 19. Long-Term Improvement Roadmap (Next 3–6 Months)

**Month 1 — Security & Stability**
- Fix all Critical and High security findings (CORS, webhook, session secret, cookie detection)
- Add `helmet`, `compression`, graceful shutdown, and global error handlers
- Remove `bitebend_backup.sql` from git history
- Add `SITE_URL` enforcement and remove `REPL_ID` dependency

**Month 2 — Storage & Performance**
- Replace base64 PostgreSQL image storage with S3/GCS
- Add missing database indexes (`menu_items`, `menu_categories`, `users`, `order_items`, `notifications`, `restaurants.slug`)
- Add `Cache-Control` / `ETag` headers on public menu endpoint
- Move `sharp` bill generation to a worker queue (BullMQ or similar)

**Month 3 — Scalability**
- Replace in-memory SSE `Map` with Redis Pub/Sub
- Decouple WhatsApp bridge into an independent deployable service
- Add Redis adapter to Socket.IO in bridge
- Migrate bridge session storage from local filesystem to Redis or S3

**Month 4–5 — Maintainability**
- Split `owner.ts` (2,888 lines) into domain-specific routers
- Split `Admin.tsx` (2,947 lines) into tab-level components
- Extract shared `shadcn/ui` to `lib/ui` package
- Remove deprecated Razorpay code, columns, and dead routes
- Enable `noUnusedLocals` in `tsconfig.base.json`

**Month 6 — Observability & DR**
- Add structured application metrics (Prometheus or equivalent)
- Implement separate readiness/liveness probes
- Document and automate disaster recovery playbooks
- Configure PITR for the production database
- Load test to validate 1,000-restaurant capacity

---

### 20. Final Verdict

> **Ready after Medium Fixes**

The core application is functional and architecturally sound for single-node low-to-medium scale. The engineering quality in payment flow, session handling, and bridge lifecycle management is notably good. However, the Critical security findings (CORS wildcard, webhook bypass, session-secret default) and the migration blockers (Replit-specific cookie logic, stubbed object storage, localhost fallbacks) must be resolved before any production or off-Replit deployment.

---

### Final Questions

| Question | Answer |
|----------|--------|
| **Can this project safely leave Replit today?** | **No.** Cookie security, QR/bill URL generation, and session management all have Replit-specific assumptions that break on a generic host. 4–8 targeted code changes are required first. |
| **Can it run on a VPS?** | **Yes, after fixes.** Replace `REPL_ID` cookie logic with `NODE_ENV`, set `SITE_URL`, install Chromium, configure all secrets. Estimated 1–2 days of work. |
| **Can it run with Docker Compose?** | **Yes, with moderate effort.** Requires a multi-service `docker-compose.yml` (api, bridge, postgres, redis-for-SSE), Chromium in bridge image, and volume mounts for bridge sessions until remote session storage is added. |
| **Can it run on Kubernetes?** | **Not yet.** SSE in-memory map, child-process bridge coupling, and local filesystem assumptions are hard blockers. Requires Redis Pub/Sub for SSE, independent bridge deployment, and S3 for images — approximately 4–6 weeks of architectural work. |
| **Can it support 1,000 restaurants?** | **Possibly, single-node.** Depends on concurrency patterns. The main risks are: DB pool exhaustion (max 10), synchronous `sharp` CPU spikes, and SSE memory growth. Manageable with a 4-vCPU/8GB node and the missing indexes added. |
| **Can it support 10,000 restaurants?** | **No in current architecture.** SSE scaling, bridge single-instance, and DB-as-image-storage are hard limits. Full architectural changes (Redis, bridge farm, S3) required first. |
| **Biggest technical risks before scaling?** | (1) SSE single-node limitation causes lost order notifications under horizontal scale. (2) WhatsApp bridge is a single point of failure with no redundancy. (3) Base64 images in PostgreSQL will make the database unmanageable above ~500 active restaurants. |
