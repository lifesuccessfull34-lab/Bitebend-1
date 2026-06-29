# Bitebend Deep-Dive Engineering Audit — Part 2

*Audit Date: 29 June 2026 — Read-Only, no files modified*
*Covers: Database Integrity, API Consistency, Frontend Architecture, Code Quality, TypeScript, Testing, DevOps, Observability, AI/OCR Pipeline, WhatsApp Bridge, Financial Integrity, Overall Architecture*

---

## 1. Database Integrity Audit

### 1.1 Foreign Key Relationships & Cascade Rules

| Table | Column | References | Cascade Rule | Assessment |
|-------|--------|-----------|-------------|------------|
| `menu_categories` | `restaurant_id` | `restaurants.id` | ON DELETE CASCADE | ✅ Correct |
| `menu_items` | `restaurant_id` | `restaurants.id` | ON DELETE CASCADE | ✅ Correct |
| `menu_items` | `category_id` | `menu_categories.id` | ON DELETE CASCADE | ✅ Correct |
| `order_items` | `order_id` | `orders.id` | ON DELETE CASCADE | ✅ Correct |
| `orders` | `restaurant_id` | `restaurants.id` | **NO ACTION (default)** | ❌ Deleting a restaurant will fail at the DB level if orders exist; no clean cascade path |
| `orders` | `session_id` | `table_sessions.id` | ON DELETE SET NULL | ✅ Correct — preserves order history |
| `session_bills` | `session_id` | `table_sessions.id` | ON DELETE CASCADE | ✅ Correct |
| `bill_links` | `order_id` | `orders.id` | ON DELETE CASCADE | ✅ Correct |
| `bill_links` | `image_blob_id` | `image_blobs.id` | ON DELETE CASCADE | ✅ Correct |
| `admin_sensitive_auth` | `user_id` | `users.id` | ON DELETE CASCADE | ✅ Correct |
| `owner_password_reset_tokens` | `user_id` | `users.id` | ON DELETE CASCADE | ✅ Correct |
| `subscription_transactions` | `restaurant_id` | `restaurants.id` | ON DELETE CASCADE | ✅ Correct |
| `restaurants` | `owner_id` | `users.id` | **None — nullable** | ❌ User deletion orphans the restaurant row |
| `restaurants` | `plan_id` | `subscription_plans.id` | None | ⚠️ Deleting a plan leaves restaurant with a dangling `plan_id` |

### 1.2 Missing Unique Constraints

| Table | Columns | Risk |
|-------|---------|------|
| `restaurant_tables` | `(restaurant_id, table_number)` | A restaurant can create two "Table 1" entries; both get QR codes; orders become ambiguous |
| `menu_categories` | `(restaurant_id, name)` | Duplicate category names per restaurant are allowed |
| `menu_items` | `(category_id, name)` | Duplicate item names within the same category are allowed |
| `restaurants` | `owner_id` | One user could theoretically own multiple restaurants — may be intentional but undocumented |

### 1.3 Nullable Columns That Should Be NOT NULL

| Table | Column | Problem |
|-------|--------|---------|
| `restaurants` | `owner_id` (line 80) | Nullable — a deleted user leaves a restaurant with no owner, permanently unmanageable |
| `restaurants` | `restaurant_id` references in `menu_categories`, `menu_items`, `restaurant_tables` | All are nullable in schema despite cascades; should be NOT NULL since they are meaningless without a restaurant |
| `orders` | `table_id` | Nullable for takeaway orders — acceptable, but `table_number` is also stored separately creating a denormalized pair with no enforced consistency |

### 1.4 Missing Indexes on Foreign Key Columns

| Table | Column | Impact |
|-------|--------|--------|
| `orders` | `restaurant_id` | Every dashboard order query does a full scan |
| `menu_items` | `restaurant_id`, `category_id` | Every customer menu load scans the full table |
| `order_items` | `order_id` | Order detail joins are unindexed |
| `restaurant_tables` | `restaurant_id` | Tables grid load does full scan |
| `notifications` | `restaurant_id` | Dashboard notification load does full scan |
| `restaurants` | `slug` | Menu URL resolution scans full table |

### 1.5 Redundant / Duplicate Indexes

| Table | Redundant Index | Covered By |
|-------|----------------|------------|
| `table_sessions` | `idx_table_sessions_restaurant_id` (single-column) | `idx_table_sessions_restaurant_status` (composite) already covers restaurant_id as the leading column |

### 1.6 Critical: Missing Transactions in Order Placement

**File:** `artifacts/api-server/src/routes/menu.ts`
**Lines:** 354, 371, 381, 623, 653, 657, 664, 672

The `placeOrder` handler performs six sequential database writes with **no wrapping transaction**:

```
1. db.update(restaurants) — increment customers_used
2. db.insert(notifications)
3. db.select() — fetch menu items
4. db.insert(orders) — create the order
5. db.insert(orderItems) — create line items
6. db.update(restaurantTables) — mark table occupied
7. db.insert(notifications) — notify owner
```

**Failure scenarios:**
- Server crash after step 4 but before step 5 → empty order exists with no items; total is ₹0
- Network timeout after step 4 → `restaurants.customers_used` is incremented but order is never fulfilled
- Step 6 fails → order confirmed but table remains "Available"; next customer seated at occupied table

**Correct approach:** Wrap all writes in a single `db.transaction()` call.

**Note:** Bill generation (`generateBill`) and bill approval (`approveSessionBill`) both correctly use `db.transaction()`. Only order placement is unprotected.

### 1.7 Denormalized Data Inconsistency Risks

| Risk | Table | Column | Details |
|------|-------|--------|---------|
| Order total drift | `orders` | `total` | Stored as a pre-calculated value; no DB check validates it equals the sum of `order_items`. A bug in calculation or a mid-air item price change creates a permanent discrepancy. |
| Customer count drift | `restaurants` | `customers_used` | Manually incremented; never reconciled against actual order count. A failed transaction leaves this count incorrect permanently. |
| Table occupancy drift | `restaurant_tables` | `is_occupied` | Set without a transaction; can desync from actual order state on crash. |

---

## 2. API Consistency Audit

### 2.1 REST Method Inconsistencies

| Endpoint | Method Used | Should Be | File |
|----------|------------|-----------|------|
| `POST /api/admin/toggle-restaurant/:id` | POST | PATCH with body `{active: bool}` | `admin.ts` |
| `POST /api/admin/activate-restaurant/:id` | POST | PATCH | `admin.ts` |
| `POST /api/admin/suspend-restaurant/:id` | POST | PATCH | `admin.ts` |
| `POST /api/owner/orders/:id` | POST (for update) | PATCH | `owner.ts` |
| `POST /api/admin/transactions/:id/mark-paid` | POST | PATCH | `admin.ts` |

Three separate endpoints (`toggle`, `activate`, `suspend`) exist for what should be a single `PATCH /api/admin/restaurants/:id/status` with a `{status}` body.

### 2.2 Request Validation Gap

The project generates Zod schemas from its OpenAPI spec into `lib/api-zod/src/generated/api.ts`. **These schemas are not used in any route handler.** Every route uses manual validation:

```typescript
// Pattern found across all route files:
if (!email || !password) return res.status(400).json({ error: "..." });
```

This is inconsistent and error-prone. Generated Zod schemas exist and are unused.

### 2.3 Response Shape Inconsistencies

| Pattern | Examples | Problem |
|---------|---------|---------|
| `{ ok: true }` | Some owner routes | Inconsistent with majority |
| `{ success: true }` | Some admin routes | Third variant |
| Returns updated object directly | Most PUT/PATCH | Two patterns for the same outcome |
| `{ error: string }` | All errors | ✅ Consistent |

### 2.4 Missing Pagination

| Endpoint | Hardcoded Limit | Risk |
|----------|----------------|------|
| `GET /api/admin/orders` | 500 rows | Returns 500 orders to browser in one payload |
| `GET /api/admin/transactions` | 200 rows | No cursor/offset support |
| `GET /api/owner/orders` | No limit | Full table scan returned |
| `GET /api/admin/restaurants` | No limit | All restaurants returned |
| `GET /api/admin/customers` | Filtered in memory | No DB-level pagination |

### 2.5 HTTP Status Code Issues

| Endpoint | Returned | Should Return | File |
|----------|---------|--------------|------|
| Bill already generated | `402 Payment Required` | `409 Conflict` | `menu.ts` |
| Subscription exhausted | `403 Forbidden` | `402 Payment Required` | `menu.ts` |
| Rate limit hit | `429` | ✅ Correct | `rateLimiter.ts` |

### 2.6 Idempotency Gaps

- `POST /api/menu/:restaurantId/orders` — no idempotency key; a double-click or network retry creates duplicate orders
- `POST /api/auth/register` — email uniqueness enforced by DB; acceptable
- `POST /api/payments/webhook` — correctly handles duplicate payment events using `razorpay_payment_id` uniqueness check

### 2.7 Authentication Consistency: Strong

| Scope | Middleware | Consistent? |
|-------|-----------|-------------|
| Admin routes | `requireAdmin` | ✅ Yes |
| Owner routes | `requireOwner` | ✅ Yes |
| Sensitive admin actions | `requireSensitiveAuth` | ✅ Yes |
| Public menu | None | ✅ Correct |

---

## 3. Frontend Architecture Audit

### 3.1 State Management: Fundamental Problem

Both Portal and Menu bypass the generated React Query client (`lib/api-client-react`) almost entirely. Core data fetching is done with `useEffect` + manual `apiFetch`/`fetchWithTimeout` calls, and local `useState` for caching.

**Files affected:** `artifacts/portal/src/pages/Dashboard.tsx`, `artifacts/menu/src/pages/MenuPage.tsx`

This means:
- No request deduplication
- No cache sharing between components
- No automatic background refetch
- Manual polling loops via `setInterval` (8s portal, 60s menu)
- No optimistic updates

### 3.2 Race Conditions

**File:** `artifacts/portal/src/pages/Dashboard.tsx` — polling `fetchData` loop

No `AbortController` is used on the polling fetch. If a request takes longer than 8 seconds, two concurrent requests exist simultaneously. The later-resolving one will overwrite the more recent data with stale results. This is a classic last-write-wins stale closure bug.

**File:** `artifacts/menu/src/pages/MenuPage.tsx` — similar pattern with `fetchWithTimeout`

### 3.3 Memory Leaks

| Issue | File | Detail |
|-------|------|--------|
| `setInterval` polling | `Dashboard.tsx` | Interval not cleared in all unmount paths |
| `waWindowRef` | `Dashboard.tsx` | WhatsApp window reference cleaned on next click, not on component unmount |
| SSE connection | `useOrderNotifications.ts` | Confirm `EventSource.close()` is called in cleanup — needs verification |

### 3.4 Oversized Components

| File | Lines | Problem |
|------|-------|---------|
| `artifacts/portal/src/pages/Dashboard.tsx` | 1,353 | 20+ `useState` calls, inline render functions, polling logic, SSE, real-time updates — all in one component |
| `artifacts/portal/src/pages/Admin.tsx` | 2,947 | All 7 admin tabs in one file — renders one massive component tree on every tab switch |
| `artifacts/menu/src/pages/MenuPage.tsx` | ~700+ | Customer menu, cart state, checkout flow, order history, payment flow — all in one file |

`Admin.tsx` in particular re-renders the entire admin surface on every interaction because all tabs share state in the parent component.

### 3.5 Missing Memoization

| Missing | File | Impact |
|---------|------|--------|
| `filteredOrders` | `Dashboard.tsx` | Recalculated on every render including unrelated state changes |
| `deriveSessionTableLabel` | `Dashboard.tsx` | Called inside render loop without memoization |
| Order card components | `Dashboard.tsx` | Defined as inline functions (`renderOrderCard`) — new function reference every render, no `React.memo` |

### 3.6 Routing Architecture Issue

The Menu app uses an internal `view` state machine (`useState`) for navigation between Cart, Checkout, OrderSuccess, and OrderHistory views instead of actual URL routes. This means:
- Browser back button does not work as expected on mobile
- Deep-linking to checkout or order success is impossible
- No page title updates for different views

### 3.7 Error Boundaries: Root-Level Only

Both apps have an `ErrorBoundary` at the root and a `ChunkErrorBoundary` for lazy-loaded chunks. Neither app has granular error boundaries around individual widgets (e.g., the order list section in Dashboard, the payment section in Menu). A crash in one section takes down the entire page.

### 3.8 Accessibility Gaps

| Issue | Location |
|-------|---------|
| No `aria-live` regions for cart updates | `MenuPage.tsx`, `MenuView.tsx` |
| Order status change notifications not announced to screen readers | `Dashboard.tsx` |
| Keyboard navigation in custom dropdown menus may rely on shadcn/ui defaults only | Various |
| Loading states use spinners without `aria-busy` or `aria-label` | Global |

### 3.9 Positive Findings

- `bfcache` (back-forward cache) fix using `pageshow` events — prevents stale menu on mobile back navigation ✅
- `ErrorBoundary.tsx` in both apps ✅
- TanStack Query installed and generated hooks available — just unused in core flows ✅
- shadcn/ui provides solid baseline accessibility for interactive components ✅

---

## 4. Code Quality Audit

### 4.1 Dead / Unreachable Code

| Item | File | Lines | Detail |
|------|------|-------|--------|
| Legacy Razorpay checkout | `artifacts/menu/src/pages/menu/legacy/RazorpayCheckout.tsx` | All | `@deprecated`, never rendered in current flow |
| Razorpay stub | `artifacts/menu/src/pages/menu/RazorpayCheckout.tsx` | All | Re-exports from legacy — dead chain |
| Customer Razorpay routes | `artifacts/api-server/src/routes/menu.ts` | 722, 940 | Behind `ENABLE_CUSTOMER_RAZORPAY=false` — dead in production |
| `void query;` | `artifacts/api-server/src/routes/owner.ts` | ~415 | A query is initialized then immediately voided — unused computation |

### 4.2 Duplicate Business Logic

| Logic | Locations |
|-------|---------|
| Order status display labels | `Dashboard.tsx` portal side + `MenuPage.tsx` menu side — not shared |
| Price formatting (`₹ X.XX`) | Multiple files in both apps — no shared utility |
| Phone normalization | `routes/menu.ts` (backend) + `MenuPage.tsx` (frontend) — duplicated logic |
| UPI link generation | `utils.ts` in menu + inline in `PaymentBillView.tsx` |

### 4.3 Large Files Violating Single Responsibility

| File | Lines | Responsibilities |
|------|-------|----------------|
| `artifacts/api-server/src/routes/owner.ts` | 2,888 | Menu CRUD, order management, QR code generation, bridge communication, subscription, analytics, profile, table management |
| `artifacts/portal/src/pages/Admin.tsx` | 2,947 | Overview, restaurants, plans, payments, orders, customers, notifications |
| `artifacts/portal/src/pages/Dashboard.tsx` | 1,353 | Stats, live orders, table grid, real-time SSE, WhatsApp integration, polling |

### 4.4 Folder Organization Inconsistency

```
artifacts/menu/src/pages/menu/          ← menu sub-pages
artifacts/menu/src/pages/menu/legacy/   ← deprecated code not separated from active code
artifacts/portal/src/pages/             ← all portal pages flat, no sub-organization
artifacts/api-server/src/routes/        ← flat, no domain grouping
```

The `legacy/` folder inside an active `pages/menu/` directory is confusing. Deprecated code should be in a separate branch or clearly excluded from production builds.

### 4.5 Unused Exported Packages

| Package | Listed In | Evidence of Use |
|---------|-----------|----------------|
| `@google-cloud/storage` | `api-server/package.json` | Not found in active code paths |
| `google-auth-library` | `api-server/package.json` | Not found in active code paths |
| `xlsx` | `api-server/package.json` | Used in `adminExport.ts` for Excel export — active |
| `@replit/object-storage` | `api-server/package.json` | Imported, but service is fully stubbed |

---

## 5. TypeScript Audit

### 5.1 `any` Usage

| File | Line | Pattern | Risk |
|------|------|---------|------|
| `artifacts/api-server/src/migrate.ts` | 197–198 | `(err as any).cause.message` | Untyped error unwrapping; use `unknown` + type guard |
| `artifacts/portal/src/pages/Admin.tsx` | 1064 | `(txn as any).restaurantName` | Response object not typed; field access is invisible to TS |
| `artifacts/portal/src/pages/Admin.tsx` | 1868 | `(txn as any).razorpayPaymentId` | Same |
| `artifacts/portal/src/pages/Dashboard.tsx` | multiple | `(order as Order)` and `(txn as any)` | Bypasses type checker on mapped session objects |

### 5.2 Unsafe Type Casts

| File | Line | Cast | Risk |
|------|------|------|------|
| `artifacts/api-server/src/routes/payments.ts` | 26, 34–36 | `req.headers` and `req.body` cast to specific types without Zod/runtime validation | Malformed webhook payloads crash the handler |
| `services/whatsapp-bridge/src/index.ts` | 28 | `socket.handshake.query.restaurantId as string` | `query` params are `string \| string[]`; cast is unsafe |
| `artifacts/portal/src/components/ui/chart.tsx` | 324 | `payload: unknown` then `as keyof typeof payload` | Property access on `unknown` via unsafe cast |

### 5.3 Non-Null Assertions

| File | Lines | Pattern | Risk |
|------|-------|---------|------|
| `artifacts/api-server/src/routes/sensitiveAuth.ts` | 35, 62, 98, 148, 203 | `req.user!.id` | If `requireSensitiveAuth` middleware is ever bypassed or misrouted, this throws at runtime |
| `artifacts/api-server/src/routes/whatsappBridge.ts` | 35, 56, 71 | `req.user!.restaurantId` | Same risk |
| `artifacts/menu/src/pages/menu/OrderSuccessView.tsx` | 261, 265, 286, 287 | `proofResult!.matched`, `proofResult!.utr` | If OCR result shape changes, runtime null crash |

### 5.4 `@ts-ignore` / `@ts-expect-error`

No `@ts-ignore` or `@ts-expect-error` comments were found in `artifacts/`, `lib/`, or `services/`. ✅ Clean.

### 5.5 Missing Return Types

| File | Function | Impact |
|------|---------|--------|
| `artifacts/api-server/src/routes/adminExport.ts` | `datePart()` | Implicit `string` — acceptable but inconsistent |
| `artifacts/api-server/src/routes/whatsappBridge.ts` | `bridgeHeaders()` | Implicit `Record` shape |
| `artifacts/portal/src/services/resourceService.ts` | `lsWrite()` | Implicit `void` |

### 5.6 Duplicate Type Definitions

The project has three parallel type systems that describe the same entities:

1. **Drizzle schema inference** — `lib/db/src/schema/schema.ts` (source of truth)
2. **Generated Zod schemas** — `lib/api-zod/src/generated/api.ts` (from OpenAPI spec)
3. **Manual TypeScript interfaces** — `artifacts/portal/src/lib/types.ts`

`HistorySessionBill` and `SessionBill` in `types.ts` have overlapping fields. `Restaurant`, `Order`, and `MenuItem` are defined manually in `types.ts` and also exist as generated Zod types. This leads to type drift when the schema changes.

### 5.7 `tsconfig.base.json` Relaxations

```json
"noUnusedLocals": false    // Dead variables invisible to TS
"noUnusedParameters": false // Dead params invisible to TS
```

These suppress valuable compiler feedback across all packages.

---

## 6. Testing Audit

### 6.1 Existing Tests

| Test Suite | Location | What It Covers |
|-----------|---------|---------------|
| URL normalization unit tests | `lib/url-utils/src/__tests__/` | Slug mangling from Google Lens, Samsung Internet, WhatsApp QR scanners |
| React hooks regression | `artifacts/menu/src/__tests__/MenuPage.hooks.test.tsx` | Hook count stability through loading/loaded/error state transitions (guards against React Error #310) |
| Menu layout snapshot | `artifacts/menu/src/__tests__/MenuView.snapshot.test.tsx` | DOM structure regression on render |
| Resources integration | `scripts/src/test-resources-integration.ts` | Admin CRUD → Approval → Public visibility smoke test |
| Bill flow smoke test | `scripts/src/verify-bill-flow.ts` | PDF/PNG bill generation + OpenGraph tags |
| QR generation round-trip | `scripts/src/check-qr-generation.ts` | QR encode → decode → HTTPS enforcement |
| Migration audit | `scripts/src/audit-migrations.ts` | Drizzle journal hashes vs. live DB |

### 6.2 Coverage Gaps

| Area | Status | Risk |
|------|--------|------|
| **Order placement** | ❌ No tests | The untransacted multi-write flow has no coverage |
| **OCR matching logic** | ❌ No tests | `matchPayment()` in `ocr.ts` has no unit tests with fixture data |
| **WhatsApp bridge** | ❌ No tests | Session lifecycle, reconnect, QR delivery, message routing — zero coverage |
| **Payment webhook** | ❌ No tests | Signature verification, duplicate handling, order state transition — zero coverage |
| **Auth flows** | ❌ No tests | Login, logout, session regeneration, rate limiting, password reset |
| **Subscription flow** | ❌ No tests | Plan selection, Razorpay order creation, webhook verification, quota enforcement |
| **Admin routes** | ❌ No tests | Restaurant management, plan CRUD, transaction management |
| **API integration suite** | ❌ No tests | No `supertest`-based route tests |
| **Portal frontend** | ❌ No tests | Zero coverage for Dashboard, Admin, Menu management, Profile pages |
| **E2E (Playwright/Cypress)** | ❌ None | No multi-step customer or owner flows |
| **Financial calculations** | ❌ No tests | Tax rounding, bill total aggregation, float precision edge cases |
| **Migration down-paths** | ❌ None | No rollback migration tests |

### 6.3 Recommended Production-Grade Testing Strategy

**Tier 1 — Unit Tests (Vitest, week 1–2)**
- `ocr.ts` — `matchPayment()` with 20+ fixture text samples (blurry, partial, wrong currency)
- `billService.ts` — bill total aggregation with tax edge cases
- `utils.ts` (menu) — UPI link generation, amount formatting, VPA sanitization
- Financial calculation functions — rounding at ₹0.5 boundary, large totals

**Tier 2 — API Integration Tests (supertest, week 3–4)**
- Full order lifecycle: place order → generate bill → submit screenshot → approve
- Auth lifecycle: register → login → protected route → logout
- Subscription flow: select plan → create Razorpay order → webhook → quota update
- Webhook security: valid signature ✅, missing secret ❌, invalid signature ❌

**Tier 3 — Service Tests (week 5–6)**
- WhatsApp bridge with mocked `whatsapp-web.js` client
- Bridge manager restart loop with simulated health check failures
- OCR pipeline with mocked Google Vision and OpenAI responses

**Tier 4 — E2E Tests (Playwright, week 7–8)**
- Customer: Scan QR → browse menu → add to cart → checkout → pay → submit screenshot
- Owner: Login → view live order → mark preparing → ready → approve payment
- Admin: Login → view restaurant → suspend → reactivate

---

## 7. DevOps Audit

### 7.1 Containerization: Not Present

| Artifact | Status |
|----------|--------|
| `Dockerfile` | ❌ Not found anywhere in the repository |
| `docker-compose.yml` | ❌ Not found |
| `.dockerignore` | ❌ Not found |
| `nixpacks.toml` | ✅ Present — for Replit/Railway deployment |
| `replit.nix` | ✅ Present — for Replit dev environment |

The project **cannot be containerised without authoring a Dockerfile from scratch**. Key requirements for that Dockerfile: Node 24, pnpm, Chromium, and all build steps in the correct order.

### 7.2 CI/CD: Not Present

| Artifact | Status |
|----------|--------|
| `.github/` directory | ❌ Not found |
| GitHub Actions workflows | ❌ None |
| CircleCI / GitLab CI | ❌ None |
| Pre-commit hooks | ❌ None (`.husky` not found) |

**All validation is manual** via scripts in `scripts/src/`. The `verify-deployment` script exists but must be run manually before each deployment. Nothing prevents a broken build from being deployed.

### 7.3 Rollback Strategy: None

No documented or automated rollback procedure exists. Database migrations are forward-only (no `down` migrations). Rollback requires:
1. Manually reverting code (git revert)
2. Manually writing inverse SQL for any schema changes
3. Restarting the server

This is a significant operational risk for a payment-handling application.

### 7.4 Zero-Downtime Deployment: Not Ready

The API server has no graceful shutdown (confirmed: no `SIGTERM` handler). Any deployment kill-and-replace will drop in-flight requests. For a restaurant actively taking orders at dinner service, this causes visible errors.

### 7.5 Secrets Management

| Secret | Storage | Risk |
|--------|---------|------|
| `SESSION_SECRET` | Env var | ✅ Correct |
| `DATABASE_URL` | Env var | ✅ Correct |
| `RAZORPAY_KEY_SECRET` | Env var + DB column per-restaurant | ⚠️ DB storage adds attack surface |
| `razorpayWebhookSecret` | Per-restaurant DB column | ⚠️ Any DB read exposure leaks payment secrets |
| `BRIDGE_API_SECRET` | Env var | ✅ Correct (when set) |
| `SMTP_PASS` | Env var | ✅ Correct |

---

## 8. Observability Audit

### 8.1 Structured Logging

| Feature | Status | Notes |
|---------|--------|-------|
| Structured JSON logs | ✅ | Pino configured in `lib/logger.ts` |
| Request ID per request | ✅ | `pino-http` auto-generates `req.id` |
| Sensitive header redaction | ✅ | `Authorization`, `Cookie`, `Set-Cookie` redacted |
| Log levels (info/warn/error) | ✅ | Used consistently |
| Pretty printing in dev | ✅ | `pino-pretty` when `NODE_ENV !== production` |

### 8.2 Correlation IDs: Partially Missing

`pino-http` generates a `req.id` for each HTTP request to the API server. However:
- This ID is **not propagated** to the WhatsApp bridge when the API server calls bridge endpoints
- This ID is **not propagated** to the OCR service (Google Vision / OpenAI) calls
- No distributed trace spans exist — a payment failure cannot be traced end-to-end across API → bridge → OCR in a single search

### 8.3 Metrics: Minimal

| Metric | Status |
|--------|--------|
| DB row counts | ✅ `/api/health/db/details` (admin only) |
| DB size | ✅ Same endpoint |
| DB uptime | ✅ Same endpoint |
| Request latency histogram | ❌ Not collected |
| Error rate | ❌ Not collected |
| Active SSE connections | ❌ Not collected |
| Bridge status | ✅ Bridge health endpoint at `/health` |
| Chromium process count | ❌ Not collected |
| Queue depths | ❌ No queues exist |

No Prometheus metrics endpoint. No APM integration (Datadog, New Relic, etc.).

### 8.4 Audit Log: Partial

| Action | Logged? |
|--------|---------|
| Owner login | ✅ via pino-http |
| Payment verification | ✅ `verifiedBy`, `verifiedAt` columns |
| Admin restaurant suspend | ⚠️ Logged in pino but no dedicated `audit_log` table |
| Screenshot replacement | ✅ Guard logs the override |
| Password reset token generation | ⚠️ Not permanently stored beyond the token expiry |
| Admin plan price changes | ❌ No record of who changed what and when |

### 8.5 Payment Tracing

| Event | Logged? |
|-------|---------|
| Razorpay webhook received | ✅ `req.log.info` |
| Signature mismatch | ✅ `req.log.warn` |
| Duplicate payment (already paid) | ✅ Logged |
| OCR result | ✅ `paymentOcrData` stored on order |
| Manual staff approval | ✅ `verifiedBy`, `verificationMethod` |
| Screenshot upload analytics | ✅ Structured log events |

---

## 9. AI/OCR Pipeline Audit

### 9.1 OCR Reliability Assessment

**File:** `artifacts/api-server/src/services/ocr.ts`

The pipeline is a two-stage approach: Google Cloud Vision for text extraction → GPT-4o-mini for structured parsing. This is a solid architecture. The main findings:

| Issue | Detail | Severity |
|-------|--------|---------|
| **No request timeouts on Vision or OpenAI calls** | `fetch()` to Google Vision has no `AbortSignal.timeout()`. The OpenAI client has no `timeout` option set. A hung API call blocks the route handler indefinitely. | High |
| **Confidence threshold too strict** | `confidence >= 95` required for auto-match (`ocr.ts:191`). Slightly blurry but valid screenshots may score 85-90 and always route to manual review. | Medium |
| **No retry logic** | Both Vision and OpenAI calls have zero retry. A transient 503 from either service routes the order to manual review permanently. | Medium |
| **Amount tolerance of ₹2** | `Math.abs(result.amount - orderTotal) < 2` (`ocr.ts` match logic). For ₹100 orders this is 2% tolerance — acceptable. For ₹10 orders this is 20% — could allow a ₹9 screenshot to match a ₹10 order. | Low |

### 9.2 Replay Attack & Duplicate Detection: Missing

**No UTR uniqueness check exists in the database.** The extracted UTR number (12-digit transaction reference) is stored in `paymentOcrData` JSON but never indexed or queried for uniqueness.

**Attack scenario:** A customer with a ₹500 UTR from a previous payment at a different restaurant uploads the same screenshot to a new ₹500 order. The OCR pipeline will:
1. Extract the correct amount (₹500 ✅)
2. Find a "success" status (✅)
3. Find the UTR (✅)
4. Score 95+ confidence (✅)
5. Auto-approve the order — **despite no actual new payment**

**Missing:** A `processed_utrs` table or a query against historical `paymentOcrData` to detect reused transaction references.

### 9.3 Duplicate Screenshot Detection: Missing

No image hashing (MD5, SHA-256 of base64 content) is performed. A customer can upload the same screenshot to multiple orders simultaneously if they open multiple browser tabs. The 409 guard only prevents overwriting an existing screenshot on the *same* order.

### 9.4 OCR Failure Handling

| Failure Mode | Response | Appropriate? |
|-------------|---------|-------------|
| Google Vision returns error | `ocrConfigured: true, confidence: 0` → manual review | ✅ Acceptable |
| OpenAI returns malformed JSON | `JSON.parse` throws → caught → manual review | ✅ |
| Empty image / no text detected | Short-circuit, skip OpenAI call | ✅ Cost-efficient |
| Vision API 429 (rate limit) | Treated as error → manual review | ⚠️ Should retry with backoff |
| OpenAI API timeout | Hangs indefinitely (no timeout set) | ❌ Critical |

### 9.5 Audit Trail

| Field | Status |
|-------|--------|
| `verificationMethod` | ✅ `ocr_ai` \| `manual_staff` \| `legacy` |
| `verifiedBy` (user ID) | ✅ Stored |
| `verifiedAt` | ✅ Stored |
| `paymentOcrData` (full JSON) | ✅ Stored |
| UTR in queryable column | ❌ Buried in JSON, not indexable |
| Screenshot hash | ❌ Not stored |

---

## 10. WhatsApp Bridge Audit

### 10.1 Bridge Architecture Overview

The bridge runs as a child process of the API server (`bridgeManager.ts`), uses `whatsapp-web.js` with a Puppeteer/Chromium backend, and communicates bidirectionally with the API server via HTTP + Socket.IO.

### 10.2 Session Lifecycle

| Transition | Handling |
|-----------|---------|
| `initialising` → `qr_pending` | QR emitted via Socket.IO to restaurant room |
| `qr_pending` → `connecting` | Customer scans QR |
| `connecting` → `connected` | WhatsApp authentication complete |
| `connected` → `disconnected` (non-LOGOUT) | Auto-reconnect, up to 3 attempts with 5/10/15s delay |
| `disconnected` (LOGOUT) | Session files wiped; restaurant must re-scan |
| Bridge process crash | `bridgeManager` detects via health check (20s interval); kills and restarts; max 15 attempts |

### 10.3 QR Lifecycle: Missing Expiry Handling

`whatsapp-web.js` generates QR codes that expire after ~20 seconds. The bridge emits new QR events but **does not explicitly signal QR expiry** to the frontend. The portal shows a static QR image that may be expired. If the restaurant owner scans an expired QR, `whatsapp-web.js` will emit a new QR event, but the UI may not update unless the Socket.IO connection receives it in time.

### 10.4 Duplicate Message Prevention

| Direction | De-duplication |
|----------|--------------|
| Outgoing (send bill/message) | Retry logic with 2 attempts but **no idempotency key** — if the first attempt succeeds but the response is lost, a second attempt sends a duplicate message |
| Incoming (customer screenshot) | No de-duplication — the same WhatsApp message can trigger multiple webhook deliveries if the bridge restarts during delivery |

### 10.5 Local Media Storage: Resource Leak

**File:** `services/whatsapp-bridge/src/services/imageStorage.ts`

Incoming images (customer payment screenshots via WhatsApp) are saved to `services/whatsapp-bridge/uploads/`. **No cleanup job exists in the bridge service.** The API server's `screenshotCleanup.ts` only purges screenshots stored in the API database, not the bridge's local filesystem.

On a long-running deployment, `uploads/` grows unbounded. On a Replit instance with limited disk, this will eventually cause disk exhaustion.

### 10.6 Chromium Resource Management

| Issue | Detail | Severity |
|-------|--------|---------|
| One Chromium instance per restaurant phone | 150–300 MB RAM each | High for many restaurants |
| `--no-sandbox` flag required | Security trade-off for containerised environments | Acceptable with process isolation |
| `--single-process` flag | Further reduces isolation; Chromium crashes affect the whole bridge | Medium |
| OOM → orphaned Chromium | If the bridge is OOM-killed, Chromium child processes may persist | Medium |
| No max-client guard | No limit on simultaneous WhatsApp sessions — 20 restaurants = ~4 GB RAM | High |

### 10.7 Multiple Restaurant Isolation

Each restaurant gets its own `clientId` (e.g., `restaurant_1`), separate session directory, and isolated Socket.IO room. Isolation is correct at the application layer. The risk is at the process layer — all restaurants share one Chromium parent process, so a Chromium crash affects all restaurants simultaneously.

### 10.8 Bridge Authentication

`requireApiSecret` middleware checks `x-bridge-secret` header on all bridge API routes. **If `BRIDGE_API_SECRET` is not set in environment variables, the middleware logs a warning and allows all traffic.** This was flagged in the previous audit as a Critical/High issue and remains unresolved.

---

## 11. Financial Integrity Audit

### 11.1 Monetary Precision

**File:** `lib/db/src/schema/schema.ts` — line 162 (`price: doublePrecision`), line 123 (`amount: doublePrecision`)

All monetary values use IEEE 754 double-precision floating point. For Indian restaurant pricing (typically ₹10–₹2000), precision loss is practically unlikely but theoretically possible:

```
0.1 + 0.2 === 0.30000000000000004 (JavaScript)
```

The industry standard for financial applications is `NUMERIC(12, 2)` (PostgreSQL) or integer paise storage.

### 11.2 Tax Calculation

**File:** `artifacts/api-server/src/routes/menu.ts:397`

```typescript
const tax = Math.round((subtotal * restaurant.taxPercent) / 100);
```

`Math.round()` rounds to the nearest rupee. This means:
- ₹100 order at 5% → `Math.round(5.0)` = ₹5 ✅
- ₹101 order at 5% → `Math.round(5.05)` = ₹5 (rounds down — customer pays less)
- ₹109 order at 5% → `Math.round(5.45)` = ₹5 (rounds down)
- ₹110 order at 5% → `Math.round(5.50)` = ₹6 (rounds up — customer pays more)

### 11.3 Frontend vs Backend Rounding Mismatch

**Backend** (`routes/menu.ts:397`): `Math.round(...)` — rounds to nearest rupee (integer)  
**Frontend** (`MenuPage.tsx`): `parseFloat((value / 100).toFixed(2))` — shows two decimal places

A ₹109.50 subtotal at 5% tax:
- Backend: `Math.round(5.475)` = ₹5 (integer)
- Frontend display: might show ₹5.48

The cart total shown to the customer may not match the final bill amount. While the backend value is authoritative, this creates customer confusion at checkout.

### 11.4 Razorpay Boundary

**File:** `artifacts/api-server/src/routes/menu.ts:750`

```typescript
amount: Math.round(amount * 100) // paise — must be integer
```

Correct. Razorpay requires integer paise. ✅

### 11.5 Bill Total Consistency

`sessionBills.total` is the sum of all constituent `orders.total` values in the session. Since each `orders.total` is already rounded to the nearest rupee, bill totals are sums of integers — no floating-point accumulation risk. ✅

### 11.6 Partial Payment Support

Not implemented. The system is binary: a bill is either fully paid or unpaid. If a customer pays ₹450 on a ₹500 bill, staff must:
1. Manually decide whether to reject the screenshot
2. Absorb the ₹50 difference
3. Or manually mark as paid despite the discrepancy

No UI or workflow exists for partial payment negotiation.

### 11.7 Duplicate Payment Prevention

| Mechanism | Status |
|-----------|--------|
| 409 on second screenshot upload (same order) | ✅ |
| Bill lock (RULE 4) — blocks new orders once bill is generated | ✅ |
| Razorpay `razorpay_payment_id` idempotency check | ✅ |
| UTR uniqueness check across orders | ❌ Missing |

### 11.8 `customers_used` Denormalized Count

**File:** `artifacts/api-server/src/routes/menu.ts:354, 371`

`restaurants.customers_used` is incremented manually outside of any transaction. If order placement fails partway through, the counter is incremented but no order is created. Over time this causes quota exhaustion earlier than the actual customer count warrants. No reconciliation job exists.

---

## 12. Overall Architecture Review

### 12.1 Maintainability

**Score: 5/10**

The monorepo structure, TypeScript, Drizzle ORM, and OpenAPI codegen are all sound choices. However, three 1,300–2,900 line files, duplicate UI component libraries, three parallel type systems, and manual state management instead of the already-generated React Query hooks mean the codebase is harder to maintain than it needs to be. A new developer has to understand multiple competing patterns doing the same thing.

### 12.2 Extensibility

**Score: 6/10**

Adding new API routes is straightforward. Adding new frontend features is difficult because the main page components are monolithic. Adding a new payment method would require changes across the untransacted `placeOrder` flow, multiple frontend views, and the bridge service simultaneously.

### 12.3 Modularity

**Score: 5/10**

The monorepo workspace structure is good. However, the bridge is coupled as a child process to the API server, the UI components are duplicated between apps instead of shared, and `owner.ts` does the work of 8 separate modules.

### 12.4 Scalability

**Score: 3/10**

Single-node assumptions are baked in: in-memory SSE, bridge as child process, no Redis, no queue. These are addressable but require significant architectural work.

### 12.5 Production Maturity

**Score: 5/10**

Strong: payment flow design, session handling, bridge auto-restart, DB schema validation on startup. Weak: no CI/CD, no Docker, no graceful shutdown, no distributed tracing, untransacted order placement, open CORS, weak session secret fallback.

---

## Score Summary

| Domain | Score | Key Factor |
|--------|-------|-----------|
| **Architecture** | 52 / 100 | Solid monorepo structure undermined by single-node assumptions and monolithic files |
| **Database** | 55 / 100 | Good FK coverage; critical: untransacted order placement, missing indexes, no unique constraints |
| **Backend** | 61 / 100 | Strong auth/auth model; weak: no validation middleware, no pagination, CORS wildcard |
| **Frontend** | 44 / 100 | Bypasses React Query, race conditions, monolithic God components, state management issues |
| **API Design** | 53 / 100 | Consistent auth, inconsistent REST methods, no pagination, generated Zod unused |
| **TypeScript** | 65 / 100 | No @ts-ignore, but three parallel type systems, scattered `any`, unsafe casts |
| **Testing** | 22 / 100 | Excellent targeted regression tests; vast untested surface in payments, auth, bridge, OCR |
| **DevOps** | 18 / 100 | No Docker, no CI/CD, no rollback, no zero-downtime deployment |
| **Observability** | 48 / 100 | Good structured logging and request IDs; no metrics, no distributed tracing, no audit log table |
| **Financial Integrity** | 62 / 100 | Correct Razorpay boundary; risk: float storage, frontend/backend rounding mismatch, UTR replay |
| **AI/OCR Pipeline** | 50 / 100 | Good two-stage architecture; critical: no timeouts, no UTR dedup, no retry |
| **WhatsApp Bridge** | 55 / 100 | Good isolation per restaurant; critical: media leak, no auth enforcement, no QR expiry signal |
| **Overall Production Readiness** | **47 / 100** | |

---

## Top 25 Remaining Issues

### Critical Blockers

| # | Issue | File | Impact |
|---|-------|------|--------|
| 1 | **Untransacted order placement** — crash between `db.insert(orders)` and `db.insert(orderItems)` creates corrupt empty orders | `routes/menu.ts:623–657` | Data corruption on any server hiccup during peak service |
| 2 | **No OCR request timeouts** — a hung OpenAI or Vision API call blocks the order handler thread indefinitely | `services/ocr.ts` | Cascading timeout under load; restaurant orders stall |
| 3 | **UTR replay attack** — the same successful payment screenshot can be reused to auto-approve multiple orders | `services/ocr.ts`, `routes/menu.ts` | Financial fraud; revenue loss |
| 4 | **No CI/CD pipeline** — broken code can be deployed to production with no automated gate | `.github/` absent | Any pushed change goes live unvalidated |
| 5 | **No Docker or container definition** — project cannot be deployed to any standard hosting platform without Replit | Repository root | Vendor lock-in to Replit |

### High Priority Fixes

| # | Issue | File |
|---|-------|------|
| 6 | Missing indexes on `orders.restaurant_id`, `menu_items.restaurant_id`, `menu_items.category_id`, `order_items.order_id`, `restaurant_tables.restaurant_id`, `notifications.restaurant_id`, `restaurants.slug` | `lib/db/src/schema/schema.ts` |
| 7 | `orders` table has no `ON DELETE CASCADE` to `restaurants.id` — restaurant deletion blocked if any orders exist | `lib/db/src/schema/schema.ts` |
| 8 | Missing unique constraints on `restaurant_tables(restaurant_id, table_number)`, `menu_categories(restaurant_id, name)` | Schema |
| 9 | `restaurants.owner_id` is nullable — user deletion creates permanently unmanageable orphan restaurant | Schema line 80 |
| 10 | Bridge media files in `uploads/` are never cleaned up — unbounded disk growth | `services/whatsapp-bridge/src/services/imageStorage.ts` |
| 11 | No pagination on admin list endpoints — `GET /api/admin/orders` returns 500 rows, `GET /api/admin/restaurants` returns all rows | `routes/admin.ts` |
| 12 | `placeOrder` increments `customers_used` outside the (non-existent) transaction — counter drifts on crash | `routes/menu.ts:354` |
| 13 | Frontend/backend rounding mismatch — `Math.round()` backend vs `toFixed(2)` frontend causes display discrepancy | `routes/menu.ts:397`, `MenuPage.tsx` |
| 14 | Generated Zod schemas (`lib/api-zod`) are not used in any route handler — request validation is manual and inconsistent | All routes |
| 15 | Three parallel type systems (`Drizzle schema`, `generated Zod`, `manual TypeScript interfaces`) with no single source of truth | `portal/src/lib/types.ts`, `api-zod/`, `db/src/schema/` |

### Medium Priority Improvements

| # | Issue |
|---|-------|
| 16 | Add OCR retry logic (2 attempts with 2s backoff) for transient Vision API and OpenAI errors |
| 17 | Add image hashing on screenshot upload to detect identical screenshot reuse across orders |
| 18 | Extract `shadcn/ui` components from both apps into a shared `lib/ui` package — eliminates duplication |
| 19 | Replace all `useEffect + setInterval + apiFetch` polling in Portal and Menu with the generated React Query hooks |
| 20 | Add `AbortController` to all polling fetch calls to prevent race conditions on overlapping requests |
| 21 | Split `owner.ts` (2,888 lines) into domain routers: `menuRouter`, `orderRouter`, `tableRouter`, `analyticsRouter` |
| 22 | Split `Admin.tsx` (2,947 lines) into per-tab components each lazy-loaded |
| 23 | Add per-widget `ErrorBoundary` wrapping in both apps so a single widget failure doesn't crash the page |
| 24 | Add `aria-live` regions to cart updates and order status changes for screen reader accessibility |
| 25 | Migrate Menu app from internal `view` state machine to actual URL routes for working browser back button |

### Low Priority Improvements

- Enable `noUnusedLocals` and `noUnusedParameters` in `tsconfig.base.json`
- Remove deprecated Razorpay columns from schema via migration
- Add `@ts-nocheck` removal and replace remaining `as any` casts with typed alternatives
- Add `Cache-Control` / `ETag` on `GET /api/menu/:restaurantId` (changes infrequently)
- Add a dedicated `audit_log` table for admin actions (plan price changes, restaurant suspensions)
- Add `NUMERIC(12, 2)` migration for monetary columns to eliminate float risk
- Add Prometheus metrics endpoint (`/metrics`) for operational visibility
- Store UTR as a queryable indexed column on orders (extracted from OCR result)

---

## Final Answers

### Is Bitebend production-ready?

**No — not without fixing at minimum these 5 issues first:**
1. Wrap `placeOrder` in a database transaction
2. Add request timeouts to the OCR service
3. Add UTR uniqueness check to prevent replay attacks
4. Set `SESSION_SECRET` to a strong value (enforced on startup)
5. Restrict CORS to an explicit origin allowlist

After those fixes: **Yes, for single-node deployment at low-to-medium scale.**

### Can it safely support 100 restaurants?

**Yes**, on a 4 vCPU / 8 GB VPS, with the missing database indexes added. WhatsApp bridge memory usage is the main risk: 100 restaurants each with a connected WhatsApp session = potentially 15–30 GB RAM in Chromium alone. In practice, most restaurants will not be simultaneously connected. Realistic concurrent connections at 100 restaurants: 20–40.

### Can it support 1,000 restaurants?

**Probably not in the current architecture without one change:** The in-memory SSE `Map` in `orderEvents.ts` must be replaced with Redis Pub/Sub before horizontal scaling. On a single high-memory node (32+ GB), 1,000 restaurants is technically possible but fragile. The WhatsApp bridge is the hard limit — one Chromium per restaurant is not sustainable at this scale.

### Can it support 10,000 restaurants?

**No.** Requires: Redis Pub/Sub (SSE), independent bridge deployment with S3-backed session storage, S3/GCS for images (current DB-as-storage collapses), DB read replicas, and a bridge pool with load balancing. This is 3–4 months of architectural work.

### Is the current architecture maintainable for the next 3 years?

**With refactoring, yes. Without it, no.** The three monolithic files (`owner.ts`, `Admin.tsx`, `Dashboard.tsx`) and the three parallel type systems will compound maintenance costs as the product grows. Each new feature added to `owner.ts` makes the next feature harder to add safely.

### What would you redesign first if starting from the current codebase?

**1. Wrap `placeOrder` in a transaction** — this is a data integrity time bomb and takes 30 minutes.

**2. Replace the SSE in-memory map with Redis Pub/Sub** — this is the single change that unlocks horizontal scaling and is the most impactful architectural improvement.

**3. Extract the WhatsApp bridge into a fully independent service** — remove the child-process coupling. Give it its own lifecycle, its own deployment, and remote session storage. This eliminates the most fragile single point of failure in the system.

**4. Adopt the generated React Query hooks throughout Portal and Menu** — this eliminates the polling race conditions, reduces state boilerplate by 60%, and makes the frontend correct-by-default.

**5. Implement a CI/CD pipeline** — no further development should happen without automated gates (lint, type-check, test, migration audit) running on every push.
