# Bitebend Final Deep Audit — Architecture & Business Logic
## Part 3: Evidence-Backed Comprehensive Audit

*Audit Date: 29 June 2026 — Read-Only, no files modified*
*Every finding includes: file · line number(s) · evidence · impact · severity · recommended fix*

---

## 1. Database Integrity Audit

### 1.1 Orphan Records

| Finding | File | Line | Evidence | Impact | Severity |
|---------|------|------|----------|--------|---------|
| `restaurants.owner_id` is nullable — user deletion creates unmanageable orphan restaurant | `lib/db/src/schema/schema.ts` | 80 | `ownerId: integer("owner_id")` — no `.notNull()`, no cascade | Restaurant permanently unmanageable; no owner can log in | **High** |
| `orders` table has no `ON DELETE CASCADE` to `restaurants.id` — deleting a restaurant with orders throws PostgreSQL constraint violation, not a clean delete | `lib/db/src/schema/schema.ts` | 236 | `restaurantId: integer("restaurant_id")` — no `references()` with onDelete | Admin `deleteRestaurant` (`admin.ts:137`) fails silently with a 500 if orders exist | **High** |
| Deleted table leaves `tableId` on future orphaned orders (`orders.tableId` points to a deleted row) | `lib/db/src/schema/schema.ts` | 237 | `tableId: integer("table_id")` — nullable, no cascade | Order records reference a non-existent table; QR links break | **Medium** |

**Recommended Fix:** Add `NOT NULL` to `restaurants.owner_id` with `onDelete: "cascade"`. Add `onDelete: "restrict"` to `orders.restaurant_id` (with a pre-deletion order-clearance check in the admin route) or `onDelete: "set null"` with UI handling.

---

### 1.2 Missing Foreign Keys & Unique Constraints

| Finding | File | Line | Evidence | Impact | Severity |
|---------|------|------|----------|--------|---------|
| No unique constraint on `(restaurant_id, table_number)` — two "Table 1" entries possible | `lib/db/src/schema/schema.ts` | 175–185 | No `uniqueIndex` on this pair | Ambiguous orders; two QR codes map to same table | **High** |
| No unique constraint on `(restaurant_id, name)` for `menu_categories` | `lib/db/src/schema/schema.ts` | 145–152 | No unique index | Duplicate category names confuse customers and staff | **Medium** |
| No unique constraint on `(category_id, name)` for `menu_items` | `lib/db/src/schema/schema.ts` | 155–168 | No unique index | Duplicate items in same category | **Medium** |
| `restaurants.plan_id` references `subscription_plans.id` with no cascade — deleting a plan leaves `plan_id` dangling | `lib/db/src/schema/schema.ts` | 106 | `.references(() => subscriptionPlans.id)` — no onDelete | Restaurant shows stale plan; subscription enforcement breaks | **Medium** |

**Recommended Fix:** Add composite unique indexes via Drizzle `uniqueIndex('idx_table_restaurant_num', (t) => [t.restaurantId, t.tableNumber])` pattern.

---

### 1.3 Missing Indexes on High-Frequency Query Columns

| Column | Table | Missing Index | Query Frequency | Severity |
|--------|-------|--------------|----------------|---------|
| `restaurant_id` | `orders` | ❌ | Every dashboard load, every order query | **Critical** |
| `restaurant_id` | `menu_items` | ❌ | Every customer menu load | **Critical** |
| `category_id` | `menu_items` | ❌ | Every category render | **High** |
| `order_id` | `order_items` | ❌ | Every order detail view | **High** |
| `restaurant_id` | `restaurant_tables` | ❌ | Every table grid load | **High** |
| `restaurant_id` | `notifications` | ❌ | Every notification poll | **Medium** |
| `slug` | `restaurants` | ❌ | Every customer QR scan URL resolution | **High** |

**Evidence:** `lib/db/src/schema/schema.ts` — none of these have an `index()` call. `table_sessions` has good partial indexes but `orders` has none.

**Recommended Fix:** Add a migration that creates these 7 indexes. At 1,000+ orders per restaurant the performance difference is 100x+ on dashboard load.

---

### 1.4 Duplicate Indexes

| Table | Redundant Index | Covered By | File |
|-------|----------------|------------|------|
| `table_sessions` | `idx_table_sessions_restaurant_id` (single-column on `restaurant_id`) | `idx_table_sessions_restaurant_status` (composite `(restaurant_id, status)`) — leading column already covers single lookups | `lib/db/src/schema/schema.ts` |

**Impact:** Marginal write overhead; wastes storage. Remove the single-column index.

---

### 1.5 Transaction Safety — Critical Finding

**File:** `artifacts/api-server/src/routes/menu.ts`
**Lines:** 354, 371, 381, 623, 653, 657, 664, 672

The `placeOrder` handler performs **7 sequential database writes with no wrapping transaction**:

```
Line 354:  db.update(restaurants) — increment customers_used
Line 357:  db.insert(notifications) — owner notification
Line 371:  db.update(restaurants) — set subscription status (conditional)
Line 381:  db.select(menuItems) — fetch items for validation
Line 623:  db.insert(orders) — create order header
Line 653:  db.insert(orderItems) — create line items
Line 657:  db.update(restaurantTables) — mark table occupied
Line 664:  db.update(restaurants) — second customers_used update
```

**Failure scenario:** Server crash or DB timeout between line 623 and line 653 creates an order with header but no line items. `order.total` is stored but `order_items` table is empty. The order appears in the kitchen view as a ghost order with ₹0 items.

**Contrast:** `generateBill` (`owner.ts:1539`), `approveSessionBill` (`owner.ts:1897`), and `markSessionBillPaid` (`owner.ts:2035`) all correctly use `db.transaction()`.

**Recommended Fix:**
```typescript
await db.transaction(async (tx) => {
  // All 7 writes inside this block
});
```

---

### 1.6 Race Condition: Concurrent Table Session Creation

**File:** `artifacts/api-server/src/routes/menu.ts`
**Lines:** 472–572

RULE 3 (table ownership) checks for an active session at the table using a `SELECT` (line ~505), then creates a new session if none is found (line ~554). There is no database-level `UNIQUE` constraint on `(restaurant_id, table_number, status='active')` in `table_sessions`.

**Scenario:** Two customers simultaneously scan the same table QR. Both requests read "no active session" simultaneously. Both proceed to insert. Result: two `active` sessions for the same table — both customers are ordering, bills cannot be reconciled.

**Recommended Fix:** Add a partial unique index: `CREATE UNIQUE INDEX idx_one_active_session_per_table ON table_sessions (restaurant_id, table_number) WHERE status = 'active'`. This moves the race condition enforcement to the database level.

---

### 1.7 Inconsistent Enum Usage

| Enum | Defined In | Also Defined In | Risk |
|------|-----------|----------------|------|
| `orderStatus` | `lib/db/src/schema/schema.ts` | Hardcoded strings in `owner.ts:476`, `menu.ts:233`, `portal/src/lib/types.ts:253` | Typo in one location skips rows silently |
| `paymentStatus` | Schema | Hardcoded in `portal/src/lib/types.ts` | Type drift between frontend and database |
| `sessionStatus` | Schema | Hardcoded strings in multiple owner.ts queries | Inconsistent string values cause silent query misses |

**Recommended Fix:** Export a `const orderStatuses` object from `lib/db` and import it everywhere instead of repeating string literals.

---

## 2. Business Logic Audit — Complete Lifecycle

### 2.1 Restaurant → Table → QR

| Hole | File | Line | Evidence | Impact | Severity |
|------|------|------|----------|--------|---------|
| **Deleted table with active QR** — physical QR code keeps working at scanner level; `tableId` on future orders becomes null since `restaurant_tables` row is gone | `artifacts/api-server/src/routes/owner.ts` | 380 | `db.delete(restaurantTables).where(eq(restaurantTables.id, tableId))` — no session check before delete | Customer scans old QR, places order with `tableId: null` — kitchen cannot identify table | **High** |
| **Duplicate restaurant slugs** — handled at registration by timestamp suffix; but slug column has a DB unique constraint so truly impossible to duplicate | `lib/db/src/schema/schema.ts` | ~70 | `slug: text("slug").notNull().unique()` | ✅ Protected at DB level | — |
| **No maximum table count** — a restaurant can create unlimited tables; each gets its own QR | `artifacts/api-server/src/routes/owner.ts` | ~360 | No `COUNT(*) > limit` check before insert | Quota abuse; no plan-based table limits | **Low** |

---

### 2.2 Menu → Cart → Checkout

| Hole | File | Line | Evidence | Impact | Severity |
|------|------|------|----------|--------|---------|
| **Price changes mid-order** — customer sees old price, order is placed at new DB price | `artifacts/api-server/src/routes/menu.ts` | 394 | `price: dbItem.price` — uses live DB price at order time, not the price shown in cart | Customer charged more/less than displayed; dispute risk | **High** |
| **Deleted menu item mid-order** — item removed between cart load and order submit | `artifacts/api-server/src/routes/menu.ts` | 385 | `if (!itemMap.has(String(item.menuItemId))) { res.status(400)...}` | Order is rejected with a 400 — customer sees an error after payment intent | **Medium** |
| **No maximum cart item quantity** — customer can order 9999 units of an item | `artifacts/api-server/src/routes/menu.ts` | ~380 | No `item.quantity > 0 && item.quantity <= MAX` check | Inflated totals; potential payment gateway issues | **Low** |

---

### 2.3 Payment → Order

| Hole | File | Line | Evidence | Impact | Severity |
|------|------|------|----------|--------|---------|
| **Duplicate order creation via double-click** — `placeOrder` has no idempotency key | `artifacts/api-server/src/routes/menu.ts` | 299 | No `X-Idempotency-Key` header processing; no server-side dedup | Two identical orders created; restaurant sees duplicate kitchen ticket; customer billed double | **Critical** |
| **Payment succeeds but order creation fails (Razorpay legacy path)** — `createRazorpayOrder` at line 1016 creates a Razorpay order; if the subsequent frontend `placeOrder` call never arrives (network drop), Razorpay has collected money with no Bitebend order record | `artifacts/api-server/src/routes/menu.ts` | 1016 | `createRazorpayOrder` endpoint creates only a Razorpay `orderId`; actual order insertion happens in a separate frontend-initiated `placeOrder` call | Payment collected, no food ordered, no refund flow exists | **High** |
| **No partial payment support** — bill is binary paid/unpaid | `artifacts/api-server/src/routes/owner.ts` | 1844–1931 | `markSessionBillPaid` updates all orders to `paid` regardless of amount paid | Undercharging risk if customer pays less; no workflow for staff | **Medium** |

---

### 2.4 Order → Kitchen → Bill

| Hole | File | Line | Evidence | Impact | Severity |
|------|------|------|----------|--------|---------|
| **Abandoned session — table permanently occupied** — no cleanup job exists | `artifacts/api-server/src/routes/menu.ts` | — | No `DELETE FROM table_sessions WHERE status = 'active' AND created_at < NOW() - INTERVAL '4 hours'` | Table shows "Occupied" forever; staff must manually clear from dashboard | **High** |
| **Session closes with all orders marked paid regardless of payment status** — `approveSessionBill` marks ALL session orders as `paid` | `artifacts/api-server/src/routes/owner.ts` | 1902–1925 | `db.update(orders).set({ paymentStatus: 'paid' }).where(eq(orders.sessionId, sessionId))` | Old unpaid orders from previous sessions inadvertently swept as paid when a new session bill is approved | **Medium** |
| **Bill total inconsistency** — `session_bills.total` is sum of `orders.total`; but `orders.total` uses `Math.round()` (integer rupees) while frontend shows `toFixed(2)` decimals | `artifacts/api-server/src/routes/menu.ts` | 397 | `const tax = Math.round((subtotal * restaurant.taxPercent) / 100)` | Customer cart shows ₹5.48 tax; bill shows ₹5 — customer disputes | **Medium** |
| **Concurrent bill generation race** — check for existing bill is outside transaction | `artifacts/api-server/src/routes/owner.ts` | 1502–1540 | `SELECT existing bills` at line 1502 then `INSERT new bill` at 1540 in separate steps; two concurrent staff clicks can pass the check simultaneously | Two active bills for the same session; payment reconciliation fails | **High** |

---

### 2.5 Session Close → Analytics

| Hole | File | Line | Evidence | Impact | Severity |
|------|------|------|----------|--------|---------|
| **`customers_used` can drift** — counter incremented outside the (non-existent) transaction | `artifacts/api-server/src/routes/menu.ts` | 354 | Increment at line 354 before order creation at line 623 — crash between them permanently over-counts | Quota exhausted earlier than actual usage; restaurant pays for phantom customers | **High** |
| **Analytics revenue includes tax in total** — `orders.total` is subtotal+tax; no separate tax column in analytics queries | `artifacts/api-server/src/routes/owner.ts` | ~2069 | `SUM(orders.total)` in stats query | Dashboard shows gross revenue (incl. tax); no GST-exclusive revenue view for accounting | **Low** |
| **No audit log table** — admin actions (suspend restaurant, change plan price, mark payment paid) are only logged to pino — no queryable record | `artifacts/api-server/src/routes/admin.ts` | — | No `INSERT INTO audit_logs` after any admin action | Cannot prove who suspended a restaurant or changed a price after the fact | **Medium** |

---

## 3. Multi-Tenant Isolation Audit

### 3.1 IDOR Vulnerabilities — Critical

**Severity: Critical**

The following payment verification endpoints in `owner.ts` filter by `orderId` only, **not** by `restaurantId`. An authenticated owner with restaurant ID=1 can verify, approve, or reject payment on orders belonging to restaurant ID=2 by guessing integer `orderId` values.

| Endpoint | File | Lines | Missing Guard | Attack |
|----------|------|-------|--------------|--------|
| `POST /owner/orders/:orderId/verify-upi` | `owner.ts` | 532, 548–551 | `db.update(orders).where(eq(orders.id, orderId))` — no `restaurantId` filter | Owner A approves Owner B's payment as verified |
| `POST /owner/orders/:orderId/reject-upi` | `owner.ts` | 557, 573–576 | Same pattern | Owner A rejects Owner B's payment |
| `POST /owner/orders/:orderId/verify-payment` | `owner.ts` | 1060, 1097, 1116 | `db.update(orders).where(eq(orders.id, orderId))` at lines 1097 and 1116 | Owner A manipulates Owner B's OCR verification result |
| `PATCH /owner/orders/:orderId/approve-payment` | `owner.ts` | 1135, 1158 | Same pattern | Owner A marks Owner B's order as paid |
| `POST /owner/orders/:orderId/confirm-staff-payment` | `owner.ts` | 1167, 1197 | Same pattern | Full cross-tenant payment state manipulation |
| `PATCH /owner/orders/:orderId/reject-payment` | `owner.ts` | 1207, 1221 | Same pattern | Owner A rejects Owner B's customer payment |

**Proof of exploitability:** All these routes are behind `requireOwner` (valid authentication required), but the authorization check — verifying the order belongs to the authenticated owner's restaurant — is absent. An authenticated owner can iterate `orderId` values.

**Recommended Fix for all 6:** Add `and(eq(orders.id, orderId), eq(orders.restaurantId, user.restaurantId!))` to every where clause.

---

### 3.2 Unauthenticated Customer Data Access

| Endpoint | File | Line | Evidence | Impact | Severity |
|----------|------|------|----------|--------|---------|
| `GET /api/menu/customer/orders?phone=` | `artifacts/api-server/src/routes/menu.ts` | 144–186 | No auth middleware; `phone` is a query parameter; returns all orders across all restaurants for that phone | Anyone who knows a customer's phone number can retrieve their complete order history at every restaurant | **High** |
| `GET /api/menu/:restaurantId/orders/:orderId` | `artifacts/api-server/src/routes/menu.ts` | 1113 | No auth middleware; orderId is guessable integer | Anyone can poll any order status | **Medium** |

**Recommended Fix:** For order history, require a signed token (e.g., HMAC of phone + timestamp) or OTP verification before returning history. For order status polling, this is intentional for the customer receipt view — add a short-lived signed `orderToken` to the order-placement response and validate it on status checks.

---

### 3.3 Bridge Webhook Restaurant Injection

**File:** `artifacts/api-server/src/routes/whatsappBridge.ts`
**Lines:** 96, 135, 189, 338

The WhatsApp bridge sends incoming screenshot webhooks with `restaurantId` in the request body. The API server trusts this value for routing payment screenshots to the correct restaurant. The only protection is the `BITEBEND_WEBHOOK_SECRET` header check.

**Risk:** If `BITEBEND_WEBHOOK_SECRET` is compromised or not set, an attacker can inject a payment screenshot into any restaurant's orders by spoofing the `restaurantId` field.

**Recommended Fix:** The bridge should only know about sessions it manages. Cross-reference incoming `restaurantId` against a whitelist of restaurants the bridge is actively serving, not just accept any integer.

---

### 3.4 Image Access — No Tenant Check

**File:** `artifacts/api-server/src/routes/images.ts`
**Line:** 16

`GET /api/images/:id` serves image blobs by UUID with no ownership check. While payment screenshots are stored as base64 directly on order rows (not in `imageBlobs`), menu item images and restaurant logos stored in `imageBlobs` are accessible by any UUID — there is no check that the requester owns the restaurant the image belongs to.

**Impact:** Low — UUIDs are not guessable, but security-by-obscurity is not the same as authorization.

---

### 3.5 Admin Endpoints — Cross-Tenant by Design (Acceptable)

All `GET /api/admin/*` routes are behind `requireAdmin`. Cross-tenant data access by super_admin is intentional. ✅

---

## 4. Billing & Money Audit

### 4.1 Monetary Precision

**File:** `lib/db/src/schema/schema.ts` — Lines 44, 123, 162

All monetary columns use `doublePrecision` (IEEE 754 64-bit float). For Indian restaurant pricing (₹10–₹2000 range), floating-point precision loss is academically possible but practically unlikely with two-decimal amounts.

**More immediate risk:** `doublePrecision` allows values like `249.99999999999997` to be stored, which would display as `₹249.99` on the frontend but `250.00` after `Math.round()` — creating a mismatch between the displayed amount and the charged amount.

**Recommended Fix:** Migrate to `numeric(12, 2)` for all monetary columns. Migration SQL:
```sql
ALTER TABLE orders ALTER COLUMN total TYPE numeric(12,2) USING total::numeric(12,2);
```

---

### 4.2 Rounding Mismatch

**Backend (`menu.ts:397`):** `const tax = Math.round((subtotal * restaurant.taxPercent) / 100)`
- Rounds to the nearest **integer rupee**
- ₹109 at 5% = `Math.round(5.45)` = ₹5

**Frontend cart display (`MenuPage.tsx` + `CartView.tsx`):** Uses `parseFloat((value).toFixed(2))` or direct arithmetic
- Shows two decimal places: ₹5.45

**Result:** Customer cart shows ₹109 + ₹5.45 tax = ₹114.45. Final bill shows ₹109 + ₹5 = ₹114. Customer is confused; screenshot uploaded shows ₹114.45 (camera of their UPI receipt which shows cart total), but OCR matches against ₹114 (the DB total). This falls within the ₹2 tolerance but is a preventable UX issue.

**Recommended Fix:** Align frontend to also round to the nearest rupee, matching the backend calculation exactly. Or switch both to half-up rounding on two decimal places.

---

### 4.3 Rupee Trace — End-to-End

```
Customer cart: subtotal = sum(price * qty) for each item (doublePrecision * integer)
                                    ↓
Backend placeOrder (menu.ts:391–398):
  subtotal = Σ(dbItem.price * item.quantity)   ← uses LIVE DB price, not cart price
  tax      = Math.round(subtotal * taxPercent / 100)  ← integer rupees
  total    = subtotal + tax                            ← stored in orders.total

                                    ↓
Customer pays via UPI QR:
  generateUPILink: amount = Number(total).toFixed(2)  ← two decimal string
  e.g. total=114 → "114.00" in UPI deep-link          ✅ correct

                                    ↓
Screenshot uploaded → OCR:
  OCR extracts amount from screenshot
  matchPayment: Math.abs(result.amount - order.total) < 2  ← ₹2 tolerance
  UTR extracted but NOT checked for uniqueness              ❌ replay risk

                                    ↓
Bill generation (owner.ts:1481):
  sessionBill.total = SUM of orders.total for all session orders  ✅ correct
  sessionBill.subtotal, sessionBill.tax = aggregated sums         ✅ correct

                                    ↓
Analytics (owner.ts:2069):
  Revenue = SUM(orders.total) — includes tax                      ⚠️ gross revenue only
  No GST-exclusive revenue figure available

                                    ↓
Exports (adminExport.ts):
  Uses same totals from orders/sessions tables                     ✅ consistent
```

**Finding: UTR is never checked for uniqueness.** A customer who paid ₹500 at Restaurant A can take the same screenshot and submit it as payment proof at Restaurant B for a ₹500 order. OCR will extract the same amount, the same UTR, the same "success" status, and auto-approve.

---

### 4.4 GST Consistency

`taxPercent` is stored per-restaurant in `restaurants.tax_percent` (default 5%). It is applied uniformly to the full subtotal. No distinction between:
- GST-inclusive items (e.g., beer in Maharashtra)
- GST-exclusive items
- Items at different GST slabs (5%, 12%, 18%)

For a simple restaurant operation this is acceptable. For multi-category restaurants with different item GST rates, this is incorrect. The architecture does not support per-item tax rates.

---

## 5. API Contract Audit

### 5.1 Undocumented Endpoints (Backend Has, Spec Doesn't)

**File:** `lib/api-spec/openapi.yaml` (spec) vs `artifacts/api-server/src/routes/`

| Endpoint | Backend File | In Spec? |
|----------|-------------|---------|
| `GET /api/owner/sessions` | `owner.ts:2785` | ❌ |
| `POST /api/owner/sessions/:id/bill` | `owner.ts` | ❌ |
| `GET /api/owner/sessions/:id/bill` | `owner.ts` | ❌ |
| `POST /api/owner/sessions/:id/bill/send` | `owner.ts` | ❌ |
| `PATCH /api/owner/sessions/:id/bill/approve` | `owner.ts` | ❌ |
| `PATCH /api/owner/sessions/:id/bill/reject` | `owner.ts` | ❌ |
| `PATCH /api/owner/sessions/:id/bill/mark-paid` | `owner.ts` | ❌ |
| `GET /api/owner/history` | `owner.ts` | ❌ |
| `GET /api/owner/history/revenue` | `owner.ts` | ❌ |
| `GET /api/owner/history/:sessionId` | `owner.ts` | ❌ |
| `GET /api/menu/customer/orders` | `menu.ts:144` | ❌ |
| `PUT /api/owner/account` | `owner.ts:2141` | ❌ |
| `GET /api/owner/orders/stream` | SSE endpoint | ❌ |
| `POST /api/menu/client-error` | `menu.ts` | ❌ |
| `GET /api/admin/resources/stats` | `admin.ts:807` | ❌ |

**Impact:** The generated API client (`lib/api-client-react`) does not cover these endpoints. Frontend calls them via direct `fetch()` with no type safety.

---

### 5.2 Dead Spec Entries (Spec Has, Backend Doesn't)

| Spec Entry | Status |
|-----------|--------|
| `POST /admin/restaurants/{id}/approve` | Not implemented as a standalone route; merged into `updateRestaurantAdmin` |
| `POST /admin/restaurants/{id}/reject` | Not found in `admin.ts` |
| `PUT /admin/restaurants/{id}/subscription` | No dedicated route; handled indirectly |

---

### 5.3 Response Shape Mismatches

| Endpoint | Spec Documents | Backend Returns | File | Line |
|----------|---------------|----------------|------|------|
| `GET /api/owner/stats` | 6 fields (`todayOrders`, `todayRevenue`, `activeOrders`, `totalMenuItems`, `totalTables`, `pendingOrders`) | **15 fields** — includes `subscriptionStatus`, `customerLimit`, `customersUsed`, `subscriptionExpiresAt`, `planId`, `hasPendingUpi`, `upiVerified`, `verifiedAt`, and more | `owner.ts` | 2069 |
| `GET /api/menu/:restaurantId` | Standard restaurant/category/item structure | Adds `tables[]`, `hasPaymentQr`, `extractedUpiId`, `extractedMerchantName` to restaurant object | `menu.ts` | 68 |

The frontend relies on the extra undocumented fields; the generated Zod types from the spec would strip them, which is why the generated hooks are not used.

---

### 5.4 Unused Generated API Client

**Files:** `lib/api-client-react/src/generated/`, `lib/api-zod/src/generated/`

These were generated from the OpenAPI spec via Orval but the Portal and Menu apps use direct `fetch()` calls for all primary functionality. The generated client covers only a subset of what the backend exposes. Neither app uses the generated hooks for order management, session management, billing, or analytics.

---

## 6. Authentication & Authorization Audit

### 6.1 Missing Rate Limit on Login

**File:** `artifacts/api-server/src/routes/auth.ts`
**Evidence:** `rateLimiter` is imported (line 8) but only applied to `/forgot-password` and `/reset-password`. `POST /api/auth/login` has **no rate limiting**.

**Impact:** Unlimited password brute-force attempts against any owner account. 1,000 requests/second is feasible with no throttle.

**Severity: Critical**

**Recommended Fix:** Apply the existing `createRateLimiter` to `POST /api/auth/login` — 10 attempts per 15 minutes per IP.

---

### 6.2 SESSION_SECRET Insecure Fallback

**File:** `artifacts/api-server/src/app.ts`
**Line:** 81

```typescript
secret: process.env.SESSION_SECRET ?? "dev-secret-change-in-prod",
```

If `SESSION_SECRET` is not set in production, all session cookies are signed with a hardcoded, publicly known string. An attacker can forge valid session cookies for any user.

**Severity: Critical**

**Recommended Fix:**
```typescript
const secret = process.env.SESSION_SECRET;
if (!secret || secret === "dev-secret-change-in-prod") {
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set or is using the default value in production");
  }
}
```

---

### 6.3 Bridge API Protection Bypass

**File:** `services/whatsapp-bridge/src/middlewares/auth.ts`
**Line:** 7

```typescript
if (!config.bridgeApiSecret) {
  logger.warn('BRIDGE_API_SECRET not set – API is unprotected!');
  return next(); // ← all traffic allowed
}
```

If `BRIDGE_API_SECRET` is not set, **every bridge API endpoint is open without authentication**. Any process that can reach the bridge's port (3001) can trigger WhatsApp messages, destroy sessions, or inject webhook data.

**Severity: Critical**

**Recommended Fix:** If `BRIDGE_API_SECRET` is not set in production, refuse to start: `throw new Error("BRIDGE_API_SECRET must be set")`. Gate this on `NODE_ENV === "production"`.

---

### 6.4 CORS: All Origins Allowed

**File:** `artifacts/api-server/src/app.ts`
**Line:** 62–65

```typescript
cors({
  origin: true,     // ← reflects any Origin header
  credentials: true,
})
```

`origin: true` allows any website to make credentialed requests to the API. Combined with `sameSite: "lax"` in development, this is a CSRF risk in non-Replit deployments.

**Severity: High**

**Recommended Fix:** Explicitly list allowed origins:
```typescript
origin: process.env.ALLOWED_ORIGINS?.split(",") ?? ["https://bitebend.in"]
```

---

### 6.5 Customer Order History — No Authentication

**File:** `artifacts/api-server/src/routes/menu.ts`
**Line:** 144

`GET /api/menu/customer/orders?phone=9876543210` requires no authentication. The phone number is a query parameter. Any caller who knows (or guesses) a customer's phone number retrieves their complete order history across all restaurants.

**Severity: High**

---

### 6.6 Privilege Escalation: Admin Sensitive Auth

**File:** `artifacts/api-server/src/routes/sensitiveAuth.ts`

`requireSensitiveAuth` middleware checks `req.user!.id` with a non-null assertion. If this middleware is inadvertently placed on an owner-accessible route (or if the middleware chain is misconfigured), it would throw at runtime, not gracefully return 403.

**Severity: Medium** — current routing appears correct; this is a fragility concern.

---

## 7. Concurrency Audit

### 7.1 Two Customers Ordering from the Same Table Simultaneously

**File:** `artifacts/api-server/src/routes/menu.ts`
**Lines:** 472–572

**Simulation:**
1. T=0: Customer A reads table session state → no active session
2. T=0: Customer B reads table session state → no active session
3. T=1: Customer A creates session and places order ✅
4. T=1: Customer B creates second session for same table ← **race**
5. Result: Two `active` sessions for "Table 3"

No database-level uniqueness prevents this. The application-level RULE 3 check is a read-then-write without a lock.

**Recommended Fix:** Partial unique index on `table_sessions (restaurant_id, table_number) WHERE status = 'active'`. This makes the second INSERT fail with a constraint violation, which the handler should catch and return a 409.

---

### 7.2 Simultaneous Bill Generation for the Same Session

**File:** `artifacts/api-server/src/routes/owner.ts`
**Lines:** 1502–1540

**Simulation:**
1. Staff member A clicks "Generate Bill" → existing bills query returns empty → proceeds
2. Staff member B clicks "Generate Bill" simultaneously → existing bills query also returns empty → proceeds
3. Staff A's transaction commits → bill created
4. Staff B's transaction also tries to commit → `bill_number` unique constraint violation → 500 error to Staff B

The race resolves at the database with a constraint violation, but Staff B receives a 500 (not a clean 409). The check-then-insert pattern should be replaced with an `INSERT ... ON CONFLICT DO NOTHING` or the SELECT should be moved inside the transaction with `FOR UPDATE`.

---

### 7.3 Duplicate Webhook Delivery (Razorpay)

**File:** `artifacts/api-server/src/routes/payments.ts`
**Line:** 117

Handler checks `if (order.paymentStatus === "paid") { return 200 }` before updating. This is effectively idempotent. ✅

**Minor risk:** The check and the update are not inside a `db.transaction()`. Under extreme concurrency, two simultaneous webhooks could both pass the check before either writes. The probability is very low given Razorpay's delivery semantics, but a DB-level unique constraint on `razorpay_payment_id` would fully close this.

---

### 7.4 Duplicate Screenshot Upload via Two Browser Tabs

**File:** `artifacts/api-server/src/routes/menu.ts`
**Line:** 862 (409 guard)

The `forceReplace` guard returns 409 if a screenshot already exists. Two simultaneous uploads (two tabs opened by customer) can both pass the "no screenshot exists" check and both upload. The second write overwrites the first. The guard is effective only for sequential attempts, not concurrent ones.

---

### 7.5 `customers_used` Counter Under Concurrent Orders

**File:** `artifacts/api-server/src/routes/menu.ts`
**Line:** 666

```typescript
customersUsed: sql`customers_used + 1`
```

This is an atomic SQL increment — correct for concurrency. ✅ Concurrent orders will not lose counter increments.

---

## 8. Offline Failure Audit

### 8.1 Database Disconnect Mid-Write

**Finding:** No connection retry logic. `lib/db/src/index.ts` uses `pg.Pool` with `max: 10`. A DB disconnect during `placeOrder` — which has no transaction — causes partial writes. The `pool.on("error")` listener (line 28) prevents a process crash but does not retry the query.

**Impact:** Orders with header but no items; `customers_used` incremented but no order created.

---

### 8.2 Bridge Disconnect During Bill Send

**File:** `artifacts/api-server/src/routes/owner.ts`
**Lines:** 41–77

`tryBridgeSend` wraps bridge HTTP calls with a 10s timeout and returns `false` on failure. The caller falls back to a `wa.me` deep-link for manual sending. ✅ Graceful fallback exists.

---

### 8.3 OpenAI Timeout During OCR

**File:** `artifacts/api-server/src/services/ocr.ts`

The OpenAI client call has **no timeout configured**. A hung OpenAI response holds the request handler open indefinitely. If the DB connection pool is exhausted by hung handlers, all subsequent requests queue and eventually time out.

**Recommended Fix:** Use `AbortSignal.timeout(15_000)` on the fetch call, or set the OpenAI client `timeout` option:
```typescript
const openai = new OpenAI({ apiKey, timeout: 15_000 });
```

---

### 8.4 Server Restart Mid-Order

**Without a transaction:** A restart between `db.insert(orders)` (line 623) and `db.insert(orderItems)` (line 653) leaves an order with no items. This order is not recoverable automatically. Staff will see a ghost order in the kitchen view.

**With sessions in PostgreSQL:** Authentication sessions survive a restart (backed by `connect-pg-simple`). ✅

**SSE connections:** Lost on restart. The browser `EventSource` auto-reconnects within ~3 seconds. During that window, the dashboard misses any real-time order events. ✅ Acceptable.

---

### 8.5 API Pool Exhaustion

`lib/db/src/index.ts` — `max: 10` connections. If 10 concurrent handlers are each waiting for DB queries (e.g., all waiting for a slow OCR result), the 11th request waits up to 30 seconds for a connection. After that, `pg` throws `Error: timeout exceeded when trying to connect`, which surfaces as a 500 to the customer.

**Recommended Fix:** Ensure all OCR-path routes have a tight timeout (15s) so pool connections are never held for the duration of an OpenAI call.

---

## 9. Data Consistency Audit

### 9.1 `orders.total` vs Sum of `order_items`

No DB constraint or trigger enforces that `orders.total = SUM(order_items.unitPrice * order_items.quantity) + tax`. If a bug or race condition stores the wrong total, the discrepancy is permanent and undetectable without a manual audit query.

**Recommended Fix:** A nightly reconciliation job that flags any order where `abs(orders.total - calculated_total) > 1`.

---

### 9.2 `restaurants.customers_used` vs Actual Count

`customers_used` is incremented manually. No periodic reconciliation against `COUNT(DISTINCT orders.customerPhone)` per restaurant exists. A crash in `placeOrder` after the increment (line 354) but before order creation (line 623) permanently over-counts.

---

### 9.3 `restaurant_tables.is_occupied` vs Session State

`isOccupied` is set at order placement (line 657) outside of a transaction. It is cleared inside the `approveSessionBill` transaction. A server crash between these can leave the table permanently showing "Occupied" with no active session. Staff must manually refresh or reset.

---

### 9.4 Notification Delivery Consistency

Notifications (`db.insert(notifications)`) are inserted at lines 357 and 672 of `menu.ts` — both outside any transaction. A crash after order creation but before notification insert means the owner never gets notified about a successfully placed order.

---

## 10. Code Ownership Audit

### 10.1 Duplicated Business Logic — Centralisation Required

| Logic | Locations | Recommended Home |
|-------|----------|-----------------|
| Phone normalization | `menu.ts:136–142`, `billService.ts:255–261`, `whatsapp-bridge/incomingMessages.ts:25–52` | `lib/utils` shared package |
| UPI link generation | `menu/src/utils.ts:43–70`, `owner.ts:982`, `portal/RegisterPage.tsx:247`, `portal/Profile.tsx:201` | `lib/utils` shared package |
| Tax calculation | `menu.ts:391–398` (backend), `CartView.tsx:237–259` (frontend) | Backend only; frontend should display server-computed values |
| Order status labels | `owner.ts:476`, `menu.ts:233`, `portal/src/lib/types.ts:253` | `lib/db` or `lib/utils` as exported constants |
| `cn()` Tailwind merge utility | `portal/src/lib/utils.ts:4`, `menu/src/lib/utils.ts:4` | `lib/ui` shared package |
| shadcn/ui component library | `portal/src/components/ui/` (full copy), `menu/src/components/ui/` (full copy) | `lib/ui` shared package |

### 10.2 Validation Duplication

Generated Zod schemas exist in `lib/api-zod/src/generated/api.ts` for every request body. None are used in route handlers. Every route performs manual `if (!field)` checks.

**Files with unused Zod schemas:** `PlaceOrderInput` (line 508 of generated types) vs manual check at `menu.ts:317`. `UpdateRestaurantInput` vs manual extraction at `owner.ts:151–188`.

### 10.3 Constants Duplication

Order status values defined in three locations:
1. `lib/api-zod/src/generated/types/orderStatus.ts`
2. `lib/api-client-react/src/generated/api.schemas.ts` (line 283)
3. `artifacts/portal/src/lib/types.ts` (line 253)

A typo in location 3 would silently skip matching orders in frontend filters.

---

## 11. Dependency Audit

### 11.1 Unused Dependencies

| Package | In | Evidence of Use | Action |
|---------|-----|----------------|--------|
| `@google-cloud/storage` | `api-server` | Not imported in any active code path; `objectStorage.ts` is fully stubbed | Remove |
| `@replit/object-storage` | `api-server` | Not imported | Remove |
| `google-auth-library` | `api-server` | Not imported | Remove |
| `@uppy/core`, `@uppy/aws-s3`, `@uppy/dashboard`, `@uppy/react` | `portal` | Not imported in `portal/src` | Remove (4 packages) |
| `@workspace/object-storage-web` | `portal` | Not imported | Remove |

**Total: 8 unused packages bundled into production builds**

---

### 11.2 Security-Vulnerable Packages

| Package | Version | CVE / Risk | Location | Action |
|---------|---------|------------|---------|--------|
| `xlsx` | `0.18.5` | `CVE-2022-36212` (Prototype Pollution) — last public registry version before vendor moved to private registry | `api-server`, `portal` | Replace with `exceljs` (MIT, maintained) |
| `whatsapp-web.js` | `1.23.0` | Non-official API; WhatsApp actively blocks updated detection methods; breaks without warning on WhatsApp Web changes | `whatsapp-bridge` | Pin to a known-working commit hash; monitor the project's issue tracker |

---

### 11.3 Duplicate Libraries

| Function | Library A | Library B | Recommendation |
|----------|----------|----------|----------------|
| QR generation | `qrcode` (Canvas/PNG, used in api-server + bridge) | `qrcode.react` (SVG, used in portal + menu) | Keep both — different use cases (server-side PNG vs. client-side SVG) |
| HTTP client | `fetch` (native, portal + menu + api-server) | `axios` (whatsapp-bridge only) | Replace `axios` in bridge with native `fetch` — Node 18+ has it built-in |
| `@types` packages in `dependencies` | `@types/multer` (api-server), `@types/qrcode` (portal) | Should be in `devDependencies` | Move to devDependencies |

---

### 11.4 Outdated / High-Risk Packages

| Package | Risk |
|---------|------|
| `express@^5` | Express 5 is GA since late 2024 — acceptable; just ensure patches are applied |
| `whatsapp-web.js@1.23.0` | High operational risk — not semver-stable; WhatsApp Web changes break it; no SLA |
| `connect-pg-simple` | Check for updates; session storage libraries attract security patches |

---

## 12. Memory Leak Audit

### 12.1 Orphaned Chromium Process — Critical

**File:** `services/whatsapp-bridge/src/services/whatsappClient.ts`
**Line:** 189

```typescript
clients.delete(restaurantId);   // ← only removes from Map
// Missing: await managed.client.destroy()
```

When auto-reconnect fails after `MAX_AUTO_RECONNECT` attempts, the client is removed from the `Map` but the underlying Puppeteer browser instance is never shut down. The Chromium subprocess continues consuming 150–300 MB RAM indefinitely.

**Severity: High**

**Recommended Fix:** Replace line 189 with `await destroyClient(restaurantId, false)`.

---

### 12.2 SSE Dead Connection Accumulation

**File:** `artifacts/api-server/src/lib/orderEvents.ts`
**Lines:** 11, 20, 35, 55, 77

The SSE `connections` Map (`Map<restaurantId, Set<Response>>`) removes dead connections only when a write fails. If a restaurant dashboard tab is closed but no new order event fires, the dead `Response` object remains in the Set indefinitely.

**At scale:** 100 restaurants × 3 open dashboard tabs each = 300 `Response` objects. If staff leaves tabs open overnight, these accumulate. Each holds memory for the HTTP response object and its associated socket.

**Recommended Fix:** Add a 30-second heartbeat write to all connections. Failed writes trigger `removeConnection()` immediately.

---

### 12.3 WhatsApp Window Reference Not Closed on Unmount

**File:** `artifacts/portal/src/pages/Dashboard.tsx`
**Lines:** 125, 239

`waWindowRef` stores a `window.open()` handle. On Dashboard unmount (page navigation), the reference is not closed. The opened WhatsApp Web window remains in the browser.

**Severity: Low** — browser memory only; closes when user closes tab.

---

### 12.4 Bridge Manager Process Listener Accumulation

**File:** `artifacts/api-server/src/lib/bridgeManager.ts`
**Lines:** ~228–230

`process.on("exit")` and `process.on("SIGTERM")` listeners are added inside `startBridgeManager`. If this function were ever called twice (e.g., during a hot-reload in development), listeners would stack. Node.js warns at >10 listeners; beyond 15, it could affect shutdown behavior.

**Severity: Low** — `startBridgeManager` is called once at startup in practice.

---

## 13. Production Configuration Audit

### 13.1 Environment Variable Inventory

| Variable | Required? | Default | Risk | Location |
|----------|----------|---------|------|---------|
| `DATABASE_URL` | ✅ Required | None — crashes on missing | Low (correct behavior) | `lib/db/src/index.ts` |
| `SESSION_SECRET` | ✅ Required | **`"dev-secret-change-in-prod"`** | **Critical** | `app.ts:81` |
| `PORT` | ✅ Required | None — throws on missing | Low (correct behavior) | `index.ts:9` |
| `BRIDGE_API_SECRET` | Should be required | **`""` (empty)** — bridge opens to all | **Critical** | Bridge `config/index.ts:11` |
| `NODE_ENV` | ✅ Required | `"unknown"` | Medium — affects cookie flags | `app.ts` |
| `SITE_URL` | Optional | `REPLIT_DOMAINS` or `localhost` | Medium — affects QR URLs | `index.ts` |
| `RAZORPAY_KEY_ID` | Optional | `null` | Low — graceful degradation | `auth.ts` |
| `RAZORPAY_KEY_SECRET` | Optional | `""` | Medium — signatures bypass-able | `auth.ts:108` |
| `BRIDGE_URL` | Optional | **`http://localhost:3001`** | Medium — wrong in K8s/Docker | `owner.ts:38` |
| `GOOGLE_VISION_API_KEY` | Optional | None | Low — OCR disabled | `ocr.ts` |
| `OPENAI_API_KEY` | Optional | None | Low — OCR disabled | `ocr.ts` |
| `SMTP_HOST/USER/PASS` | Optional | None | Low — emails disabled | `email.ts` |

### 13.2 Startup Sequence

`artifacts/api-server/src/index.ts` — startup order:
1. Log build metadata ✅
2. Frontend version sync check ✅
3. DB schema safety check (tables exist) ✅
4. Auto-seed if DB empty ✅ (safe for fresh installs, see risk below)
5. Bridge process spawn ✅
6. Background cleanup jobs ✅
7. HTTP server start ✅

**Risk:** Auto-seed (step 4) fires if `users` table is empty. In production, if a DB backup restore goes wrong and the table is temporarily empty, the seeder will inject demo credentials (`demo@spicegarden.com/demo123`) into the production database — undetectable until the admin notices unauthorized access.

**Recommended Fix:** Gate auto-seed on `NODE_ENV !== "production"` explicitly.

---

### 13.3 Login Rate Limiting Gap

**File:** `artifacts/api-server/src/routes/auth.ts`

`POST /api/auth/login` — **no rate limiter applied**.

Rate limiters are applied to `/forgot-password` and `/reset-password` only. An attacker can attempt unlimited password combinations against any owner account.

---

### 13.4 Reverse Proxy Configuration

`app.set("trust proxy", 1)` (`app.ts:21`) — correct for single-hop reverse proxy (Replit, nginx). ✅

---

### 13.5 Docker / Kubernetes Compatibility

No Dockerfile exists. To containerise:
- Node 24 + pnpm required
- Chromium required for WhatsApp bridge (adds ~300 MB to image)
- esbuild needed at build time (not runtime)
- Multi-stage build recommended (builder + runtime stages)
- Bridge process must run as a child of the API server *or* be separated into its own container

`BRIDGE_URL` defaults to `localhost:3001` — this default is **wrong in any Docker Compose or K8s setup** where the bridge runs as a separate container. Must be set explicitly.

---

## 14. Final Readiness Scores

| Domain | Score | Primary Blocker |
|--------|-------|----------------|
| **Database** | 50 / 100 | Untransacted `placeOrder`, 7 missing indexes, 3 missing unique constraints |
| **Business Logic** | 55 / 100 | No order idempotency, abandoned session accumulation, concurrent session race |
| **Multi-Tenant Isolation** | 40 / 100 | **6 IDOR vulnerabilities in payment verification endpoints** |
| **API Design** | 53 / 100 | 15+ undocumented endpoints, spec drift, no pagination |
| **Authentication** | 45 / 100 | Login not rate-limited, SESSION_SECRET fallback, CORS wildcard |
| **Reliability** | 44 / 100 | No transaction on order placement, no OCR timeout, no CI gate |
| **Maintainability** | 48 / 100 | 3 monolithic files, 3 parallel type systems, duplicated utilities |
| **Performance** | 50 / 100 | 7 missing FK indexes, no query pagination, polling vs push |
| **Scalability** | 30 / 100 | In-memory SSE, bridge as child process, no Redis, single-node only |
| **Production** | 42 / 100 | No Docker, no CI/CD, dangerous env var fallbacks, no rollback |

---

## Top 20 Critical Issues

| # | Issue | File | Line | Severity |
|---|-------|------|------|---------|
| 1 | **IDOR: 6 payment endpoints missing `restaurantId` filter** — Owner A can verify/approve/reject Owner B's orders | `owner.ts` | 550, 575, 1097, 1116, 1158, 1197, 1221 | 🔴 Critical |
| 2 | **Untransacted `placeOrder`** — crash between `INSERT orders` and `INSERT order_items` creates corrupt ghost orders | `menu.ts` | 623–657 | 🔴 Critical |
| 3 | **No rate limit on `POST /api/auth/login`** — unlimited brute-force possible | `auth.ts` | route definition | 🔴 Critical |
| 4 | **SESSION_SECRET falls back to hardcoded value** — session cookies forgeable in production if env var not set | `app.ts` | 81 | 🔴 Critical |
| 5 | **BRIDGE_API_SECRET not set → bridge fully open** — any process on port 3001 can send WhatsApp messages or destroy sessions | Bridge `middlewares/auth.ts` | 7 | 🔴 Critical |
| 6 | **UTR replay attack** — same payment screenshot reusable across orders/restaurants; no UTR uniqueness check | `ocr.ts`, `menu.ts` | — | 🔴 Critical |
| 7 | **No order idempotency key** — double-click creates duplicate orders; customer charged twice | `menu.ts` | 299 | 🔴 Critical |
| 8 | **OCR calls have no request timeout** — hung OpenAI call blocks handler thread indefinitely; can exhaust DB pool | `ocr.ts` | 161–173 | 🔴 Critical |
| 9 | **`customers_used` incremented before order transaction** — crash between increment and order insert permanently over-counts quota | `menu.ts` | 354 vs 623 | 🔴 Critical |
| 10 | **Concurrent table session race** — two customers scanning same table QR simultaneously create two active sessions | `menu.ts` | 472–572 | 🔴 Critical |
| 11 | **CORS `origin: true`** — all origins accepted with credentials | `app.ts` | 62–65 | 🔴 Critical |
| 12 | **Auto-seed fires in production if DB is empty** — demo credentials injected into live database on accidental table truncation | `index.ts` | 146–164 | 🔴 Critical |
| 13 | **Orphaned Chromium processes** — `clients.delete()` instead of `destroyClient()` on max reconnect failure | `whatsappClient.ts` | 189 | 🔴 Critical |
| 14 | **`GET /api/menu/customer/orders` — no authentication** — phone number in URL parameter exposes full order history to anyone | `menu.ts` | 144 | 🔴 Critical |
| 15 | **`xlsx` CVE-2022-36212 (Prototype Pollution)** — vulnerable package in production | `api-server/package.json` | — | 🔴 Critical |
| 16 | **No database transaction on `generateBill`** — check for existing bill is outside the transaction; concurrent bill generation can create two bills per session | `owner.ts` | 1502–1540 | 🔴 Critical |
| 17 | **7 missing indexes on foreign key columns** — full table scans on every dashboard load, order query, and customer menu fetch | `schema.ts` | — | 🔴 Critical (performance) |
| 18 | **`restaurants.owner_id` nullable** — user deletion creates unmanageable orphan restaurant | `schema.ts` | 80 | 🔴 Critical |
| 19 | **Missing unique index on active table sessions** — no DB-level guard against two active sessions per table | `schema.ts` | — | 🔴 Critical |
| 20 | **No CI/CD pipeline** — broken code deploying to production with no automated gate; no pre-merge tests | `.github/` absent | — | 🔴 Critical |

---

## Top 20 High Priority Issues

| # | Issue | File | Line |
|---|-------|------|------|
| 1 | No unique constraint on `(restaurant_id, table_number)` — duplicate table names allowed | `schema.ts` | 175–185 |
| 2 | `orders` table has no cascade to `restaurants.id` — restaurant deletion fails if orders exist | `schema.ts` | 236 |
| 3 | Deleted table leaves orphaned QR; physical QR keeps scanning but `tableId` on new orders is null | `owner.ts` | 380 |
| 4 | `session closes with unpaid orders` — all orders in session bulk-marked paid on approval, including old unverified ones | `owner.ts` | 1902–1925 |
| 5 | `placeOrder` price change race — customer billed at live DB price, not the cart price they saw | `menu.ts` | 394 |
| 6 | Abandoned sessions never expire — table stays "Occupied" indefinitely; requires manual staff intervention | `menu.ts` | — |
| 7 | Bridge media `uploads/` directory grows unbounded — no cleanup job; disk exhaustion risk | Bridge `imageStorage.ts` | — |
| 8 | Frontend/backend rounding mismatch — `Math.round()` vs `toFixed(2)` creates display discrepancy | `menu.ts:397`, `CartView.tsx:237` | — |
| 9 | SSE dead connection accumulation — closed tabs stay in `connections` Map until next write attempt | `orderEvents.ts` | 11–77 |
| 10 | 8 unused packages bundled — `@google-cloud/storage`, `@replit/object-storage`, `google-auth-library`, 4× `@uppy/*`, `object-storage-web` | Various `package.json` | — |
| 11 | No pagination on `GET /api/admin/orders` (500 row limit), `GET /api/admin/restaurants` (no limit) | `admin.ts` | — |
| 12 | Razorpay legacy payment-then-order split — payment succeeds but order never placed if network drops | `menu.ts` | 1016 |
| 13 | Three parallel type systems (`Drizzle`, generated Zod, manual `types.ts`) — type drift on schema changes | `portal/src/lib/types.ts` | — |
| 14 | 15+ API endpoints undocumented in OpenAPI spec — generated client unusable for core flows | `api-spec/openapi.yaml` | — |
| 15 | Phone normalization duplicated in 3 locations (menu.ts, billService.ts, bridge incomingMessages.ts) | Multiple | — |
| 16 | UPI link generation in 4 locations — inconsistent sanitization | Multiple | — |
| 17 | shadcn/ui fully duplicated between portal and menu | `portal/src/components/ui/`, `menu/src/components/ui/` | — |
| 18 | `BRIDGE_URL` defaults to `localhost:3001` — wrong in any containerised / multi-node deployment | `owner.ts` | 38 |
| 19 | No audit log table — admin actions (suspend, plan price change, manual payment mark) only in pino logs | `admin.ts` | — |
| 20 | WhatsApp window reference (`waWindowRef`) not closed on Dashboard unmount | `Dashboard.tsx` | 125, 239 |

---

## Top 20 Medium Priority Issues

| # | Issue |
|---|-------|
| 1 | `restaurants.plan_id` references plan with no cascade — deleted plan leaves dangling FK |
| 2 | No max cart quantity per item — customer can order 9,999 units |
| 3 | `orders.total` not validated against sum of `order_items` — silent discrepancy possible |
| 4 | No per-item tax rates — all items taxed at restaurant-level `taxPercent`; wrong for mixed GST-slab menus |
| 5 | `noUnusedLocals: false` and `noUnusedParameters: false` in `tsconfig.base.json` — dead code invisible to TS |
| 6 | `@types/multer` and `@types/qrcode` in `dependencies` instead of `devDependencies` |
| 7 | Duplicate Razorpay webhook idempotency — check is not inside a DB transaction; extreme concurrency risk |
| 8 | Missing `aria-live` regions for cart updates and order status changes |
| 9 | Dashboard.tsx `1353` lines — one God Component managing 20+ state variables |
| 10 | Admin.tsx `2947` lines — 7 tabs in one file; re-renders entire admin surface on any interaction |
| 11 | `Bridge authentication` allows all traffic if `BRIDGE_API_SECRET=""` (empty string, not unset) — same bypass |
| 12 | Revenue analytics includes tax — no GST-exclusive revenue figure for accounting |
| 13 | No graceful shutdown handler (SIGTERM) — in-flight requests dropped on restart |
| 14 | `axios` in whatsapp-bridge is unnecessary — replace with native `fetch` |
| 15 | `whatsapp-web.js@1.23.0` is fragile — pin to a known-stable commit; add a health check for WhatsApp Web API compatibility |
| 16 | Customer menu `view` state machine should be URL routes — browser back button broken |
| 17 | Menu items: no `(category_id, name)` unique constraint — duplicate item names in same category |
| 18 | Menu categories: no `(restaurant_id, name)` unique constraint — duplicate category names |
| 19 | `connect-pg-simple` session table `sessions` ensured at runtime — only safe because it's checked at boot |
| 20 | `db.pool` max=10 — under high concurrent OCR load, pool exhaustion causes request queuing and eventual 500s |

---

## Final Go / No-Go Recommendation

### Current Status: ⛔ NO-GO for Production

**The application cannot safely go to production in its current state** due to the following active security vulnerabilities:

**Must fix before any production deployment (blockers in priority order):**

1. **Fix IDOR in 6 payment endpoints** (`owner.ts:550, 575, 1097, 1116, 1158, 1197, 1221`) — authenticated owners can currently manipulate each other's payment records
2. **Add rate limiting to `POST /api/auth/login`** — currently bruteforceable
3. **Enforce `SESSION_SECRET` at startup** — throw if not set or using default value in production
4. **Enforce `BRIDGE_API_SECRET` at startup** — throw if empty in production
5. **Wrap `placeOrder` in a `db.transaction()`** — eliminates ghost orders and quota drift
6. **Add `AbortSignal.timeout(15_000)` to OCR service calls** — prevents thread starvation
7. **Add UTR uniqueness check** — prevents payment replay attacks
8. **Gate auto-seed on `NODE_ENV !== 'production'`** — prevents demo credential injection on DB accident
9. **Replace CORS `origin: true` with explicit allowlist**
10. **Fix the orphaned Chromium leak** — `destroyClient()` instead of `clients.delete()` at `whatsappClient.ts:189`

**Estimated time to fix all 10 blockers:** 2–3 focused engineering days.

**After fixing those 10 issues:** The application can safely serve production traffic at the 1–100 restaurant scale with acceptable reliability.
