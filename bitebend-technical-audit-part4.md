# Bitebend Final Deep Production Audit — Part 4
## Post-Previous-Audits: New Findings Only

*Audit Date: 29 June 2026 — Read-Only, no files modified*
*Previously audited areas are NOT repeated. Every finding is new evidence from this pass.*
*OCR/OpenAI payment path excluded per audit scope.*

---

## Part 1 — Database Integrity & Data Consistency Audit

### DB-1 · Missing CHECK Constraints on Critical Columns

**Severity: High**

Drizzle ORM defines column types but does not emit PostgreSQL `CHECK` constraints for value ranges or enum membership unless explicitly specified. None of the following have database-level guards:

| Column | Table | File | Line | Missing Constraint | Risk |
|--------|-------|------|------|--------------------|------|
| `price` | `menu_items` | `schema.ts` | 162 | `CHECK (price >= 0)` | A bug or direct DB write can store a negative price; customer cart total goes negative |
| `quantity` | `order_items` | `schema.ts` | 300 | `CHECK (quantity > 0)` | Zero or negative quantity accepted; bill total understated |
| `tax_percent` | `restaurants` | `schema.ts` | 93 | `CHECK (tax_percent BETWEEN 0 AND 100)` | A 200% tax rate is storable; orders become astronomically expensive |
| `subtotal`, `total` | `orders`, `session_bills` | `schema.ts` | 268, 395 | `CHECK (total >= 0)` | Negative bill total is storable if rounding logic has a bug |
| `subscription_status` | `restaurants` | `schema.ts` | 109 | `CHECK (subscription_status IN ('active','exhausted','suspended'))` | Out-of-range string stored silently; subscription enforcement logic falls through |
| `payment_status` | `orders` | `schema.ts` | 261 | `CHECK (payment_status IN ('unpaid','paid','manual_review','awaiting_verification'))` | Invalid state string accepted at DB level |
| `approval_status` | `restaurants` | `schema.ts` | 101 | `CHECK (approval_status IN ('pending','approved','rejected'))` | Invalid status storable |

**Why it matters in production:** These constraints exist only at the application layer. A migration script with a bug, a direct psql query during incident response, or a future code path that forgets validation will silently store invalid values that corrupt downstream calculations.

**Recommended Fix:** Add `.$check(sql`price >= 0`)` Drizzle syntax or a raw SQL migration:
```sql
ALTER TABLE menu_items ADD CONSTRAINT ck_price_positive CHECK (price >= 0);
ALTER TABLE order_items ADD CONSTRAINT ck_quantity_positive CHECK (quantity > 0);
ALTER TABLE restaurants ADD CONSTRAINT ck_tax_range CHECK (tax_percent BETWEEN 0 AND 100);
```

---

### DB-2 · `subscription_status` Updated Lazily — Only on Dashboard Visit

**Severity: High**

**File:** `artifacts/api-server/src/routes/owner.ts`
**Function:** `getStats`
**Line:** 2115

```typescript
.set({ subscriptionStatus: "expired" })
```

The `subscription_status` field on the `restaurants` table is only updated to `"expired"` when the owner visits their dashboard and triggers `GET /api/owner/stats`. There is no background job, cron, or scheduled expiry check.

**Production impact:**
- An owner whose subscription expired yesterday can continue taking customer orders today, tomorrow, and indefinitely — until they happen to reload their dashboard.
- `menu.ts` checks `restaurant.subscriptionStatus !== 'active'` at order placement (line 369 area). Since the status is stale, customers can order at an "expired" subscription restaurant until the owner logs in.
- Quota enforcement (`customersUsed >= customerLimit`) is the secondary guard, but `subscriptionStatus: "expired"` is never proactively enforced.

**Recommended Fix:** Add a nightly scheduled job (or on-startup sweep) that updates `subscription_status = 'expired'` for all restaurants where subscription validity has passed.

---

### DB-3 · Migration 0022 Lacks Pre-Conversion Data Safety Check

**Severity: Medium**

**File:** `lib/db/drizzle/0022_rupee_conversion.sql`

Migration 0022 performs a destructive type change: `INTEGER → DOUBLE PRECISION` with a data transform (`amount / 100.0` to convert paise to rupees). It does not:
1. Verify the current data is indeed in paise before converting (no `WHERE amount > 1000` or similar guard)
2. Include a `DOWN` migration to reverse the conversion
3. Run inside an explicit transaction with a safety rollback

If this migration were ever re-applied (e.g., on a fresh DB with already-converted data), all monetary values would be divided by 100 again, producing amounts like ₹1.99 instead of ₹199.

**Recommended Fix:** Add `DO $$ BEGIN IF EXISTS (SELECT 1 FROM subscription_transactions WHERE amount < 100) THEN RAISE EXCEPTION 'Data already converted'; END IF; END $$;` as a pre-check in the migration.

---

### DB-4 · `bill_number` Passes Through a Temporary Invalid State

**Severity: Low**

**File:** `artifacts/api-server/src/routes/owner.ts`
**Function:** `generateBill`
**Lines:** 1545–1556

Bill generation inserts the session bill with a placeholder `bill_number` value (`BILL-PENDING-${Date.now()}`), then immediately updates it to the final value within the same transaction. If the transaction aborts between the `INSERT` and the `UPDATE`, the placeholder string remains in the database as a committed value.

**Evidence:** The `bill_number` column has a `UNIQUE` constraint. If a second concurrent bill generation attempt runs while the first is in the `INSERT→UPDATE` window, it will see the `BILL-PENDING-*` value and generate a different pending placeholder — both transactions could then successfully commit with different `BILL-PENDING-*` values, violating the intended uniqueness of the sequential bill number.

**Recommended Fix:** Generate the final bill number value before the transaction and insert it directly, eliminating the placeholder step.

---

### DB-5 · `menu_categories.is_active` Not Consistently Filtered in Internal Lookups

**Severity: Medium**

**File:** `lib/db/src/schema/schema.ts` — `menu_categories` has `isActive: boolean().default(true)`

**File:** `artifacts/api-server/src/routes/owner.ts` — category listing queries

When an owner deactivates a category, its items remain visible to other internal queries (e.g., item re-ordering, analytics aggregation) that do not filter `WHERE is_active = true`. The public menu endpoint (`menu.ts:68`) correctly filters on `isAvailable`, but admin-side category fetches in `owner.ts` do not uniformly apply `eq(menuCategories.isActive, true)`.

**Impact:** Deactivated categories may still appear in the owner's category management grid or in item count analytics, misleading restaurant owners.

---

### DB-6 · No Sequence Gap Prevention for `bill_number`

**Severity: Low**

The `session_bills` table uses a `serial` primary key. If a transaction is rolled back after a `serial` value is consumed, a gap appears in `bill_number` values (e.g., bills 1001, 1003 with 1002 missing). For Indian GST compliance, sequential invoice numbers with no gaps are often required by tax authorities. No documentation or workaround exists for this.

---

## Part 2 — Authentication & Authorization Audit

### AUTH-1 · Suspended Owner Retains Full Dashboard Access

**Severity: Critical**

**File:** `artifacts/api-server/src/middlewares/auth.ts`
**Function:** `requireOwner`
**Line:** 44

**File:** `artifacts/api-server/src/routes/admin.ts`
**Function:** `suspendRestaurant`
**Lines:** 80–96

`requireOwner` checks:
1. Session has a `userId`
2. User exists in `users` table
3. User role is `'owner'`

It does **not** check:
- `restaurant.isActive`
- `restaurant.subscriptionStatus`
- `restaurant.approvalStatus`

`suspendRestaurant` sets `restaurant.subscriptionStatus = 'suspended'` and `restaurant.isActive = false`, but does not destroy active sessions.

**Attack scenario:** Admin suspends restaurant. Owner is currently logged in. Owner continues operating — viewing orders, modifying menu, generating bills, manually marking payments as received — until their session naturally expires (default: PostgreSQL session store TTL).

**Recommended Fix:**
1. Add a check inside `requireOwner` after the user is confirmed:
```typescript
const restaurant = await db.select().from(restaurants).where(eq(restaurants.ownerId, user.id)).limit(1);
if (!restaurant[0]?.isActive) return res.status(403).json({ error: "Restaurant suspended" });
```
2. When `suspendRestaurant` runs, query `sessions` table and delete all sessions belonging to this restaurant's owner:
```sql
DELETE FROM sessions WHERE sess::jsonb->'userId' = to_jsonb($ownerId);
```

---

### AUTH-2 · Password Reset Tokens Stored in Plaintext

**Severity: High**

**File:** `artifacts/api-server/src/routes/auth.ts`
**Function:** `forgotPassword` / `resetPassword`
**Lines:** 368–371, 537

**File:** `artifacts/api-server/src/routes/adminAuth.ts`
**Lines:** 90–93, 286

Token generation is cryptographically strong (`crypto.randomBytes(32).toString("hex")` — 256 bits of entropy ✅). However, the full token string is stored in plaintext in the `owner_password_reset_tokens` and `admin_password_reset_tokens` tables.

**Risk:** A read-only SQL injection, a database backup leak, or a compromised DB replica exposes all active reset tokens. An attacker can immediately use any active token to reset any owner or admin password without knowing the email address.

**Industry standard:** Store only `SHA-256(token)` in the database. When a reset is submitted, hash the provided token and compare against the stored hash. The plaintext token is only in the email link, never stored.

**Recommended Fix:**
```typescript
const token = crypto.randomBytes(32).toString("hex");
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
// Store tokenHash in DB, send token in email link
// On validation: compare sha256(incoming) against stored hash
```

---

### AUTH-3 · Admin Destructive Actions Don't Require Sensitive Auth

**Severity: High**

**File:** `artifacts/api-server/src/routes/admin.ts`
**File:** `artifacts/api-server/src/routes/sensitiveAuth.ts`

`requireSensitiveAuth` (5-minute secondary password window) is applied only to CSV/XLSX export routes (`adminExport.ts:346–349`).

The following destructive admin actions are NOT protected by `requireSensitiveAuth`:

| Action | Route | Effect |
|--------|-------|--------|
| `suspendRestaurant` | `POST /admin/suspend-restaurant/:id` | Immediately shuts down a restaurant |
| `deleteRestaurant` | `DELETE /admin/restaurants/:id` | Permanently deletes restaurant + cascade |
| `updatePlan` | `PUT /admin/plans/:id` | Changes pricing for all restaurants on a plan |
| `deletePlan` | `DELETE /admin/plans/:id` | Removes a subscription plan |
| `markTransactionPaid` | `POST /admin/transactions/:id/mark-paid` | Manually credits a restaurant's subscription |
| `createNotification` | `POST /admin/notifications` | Sends platform-wide notification to all owners |

A compromised admin session (XSS on the portal, session hijacking, or shoulder surfing) allows all of the above without requiring the secondary admin password.

**Recommended Fix:** Add `requireSensitiveAuth` to `deleteRestaurant`, `suspendRestaurant`, `updatePlan`, `deletePlan`, and `markTransactionPaid`.

---

### AUTH-4 · Session Invalidation Gap on Account Email Change

**Severity: Medium**

**File:** `artifacts/api-server/src/routes/owner.ts`
**Function:** `updateAccount` (line ~2141)

When an owner changes their email or password via `PUT /api/owner/account`, their existing session is not regenerated or invalidated. Any other active sessions (e.g., a browser tab left open on another device) continue using the old session with the old credentials — there is no mechanism to force re-authentication.

**Recommended Fix:** After a successful password or email change, call `req.session.regenerate()` and optionally query+delete all other sessions for this `userId` from the `sessions` table.

---

### AUTH-5 · QR Code Links Are Unauthenticated by Design — Undocumented Risk

**Severity: Low (informational)**

**File:** `artifacts/api-server/src/routes/menu.ts`

QR codes link to `/menu/:restaurantId/table/:tableId`. These are intentionally public (no auth required — any customer can order). However, `tableId` is a sequential integer, which means:
- A customer can change `table/3` to `table/4` in the URL to order from a different table within the same restaurant
- No validation that the customer is physically at that table

This is not an IDOR vulnerability in the traditional sense (restaurant isolation is maintained), but it allows table number spoofing within a restaurant.

---

## Part 3 — Payment & Financial Integrity Audit

### PAY-1 · `rejectPayment` Can Reverse a `paid` Order to `unpaid` — No State Guard

**Severity: Critical**

**File:** `artifacts/api-server/src/routes/owner.ts`
**Function:** `rejectPayment`
**Line:** 1220

```typescript
.set({ paymentStatus: "unpaid", paymentVerificationStatus: "rejected", updatedAt: new Date() })
.where(eq(orders.id, orderId))
```

There is **no check** on the current `paymentStatus` before rejecting. A staff member (or an attacker exploiting the IDOR vulnerability from Part 3 of the previous audit) can call this endpoint on an already-`paid` order, setting it back to `unpaid`.

**Impact:**
1. A paid order at a restaurant shows as unpaid on the dashboard
2. Bill reconciliation breaks — `sessionBill.status = 'paid'` but constituent order has `paymentStatus = 'unpaid'`
3. The restaurant thinks the customer hasn't paid; customer is asked to pay again
4. Double payment collected from customer

**Recommended Fix:**
```typescript
if (existing.paymentStatus === "paid") {
  return res.status(409).json({ error: "Cannot reject an already-paid order" });
}
```

---

### PAY-2 · TOCTOU Race: `approveSessionBill` Status Check Outside Transaction

**Severity: Critical**

**File:** `artifacts/api-server/src/routes/owner.ts`
**Function:** `approveSessionBill`
**Lines:** 1858–1897

```typescript
// Line 1858–1867 (OUTSIDE transaction):
const bill = await db.select()...where(eq(sessionBills.id, billId)).limit(1);
if (bill.status !== "awaiting_verification") {
  return res.status(409).json({ error: "Bill not in verifiable state" });
}

// Line 1897 (transaction begins HERE):
await db.transaction(async (tx) => {
  await tx.update(sessionBills).set({ status: "paid" })...
});
```

**Time-of-Check-to-Time-of-Use (TOCTOU) race:** Two staff members simultaneously approve the same session bill.

1. Both read `bill.status = "awaiting_verification"` ✅
2. Both pass the check ✅
3. Staff A's transaction commits → `status = "paid"` ✅
4. Staff B's transaction also commits → second `status = "paid"` update, `verifiedBy` and `verifiedAt` overwritten

The bill ends up with the second approver's credentials recorded, erasing the first approver. If this is used for audit purposes, the trail is incorrect.

**Same pattern exists in `markSessionBillPaid` at lines 2003–2035.**

**Recommended Fix:** Move the status check INSIDE the transaction and use `SELECT ... FOR UPDATE`:
```typescript
await db.transaction(async (tx) => {
  const [bill] = await tx.select().from(sessionBills)
    .where(eq(sessionBills.id, billId))
    .for("update")  // pessimistic lock
    .limit(1);
  if (bill.status !== "awaiting_verification") {
    throw new Error("ALREADY_PROCESSED");
  }
  // ... rest of updates
});
```

---

### PAY-3 · `rejectSessionBill` Does Not Reset Constituent Order Payment States

**Severity: High**

**File:** `artifacts/api-server/src/routes/owner.ts`
**Function:** `rejectSessionBill`
**Lines:** 1935–1965

`rejectSessionBill` rolls the `session_bills` row back to `'sent'` and the `table_sessions` row back to `'awaiting_payment'`. However, it does **not** reset the `orders.paymentStatus` for constituent orders.

**Scenario:**
1. Customer places 3 orders (total ₹500). Staff generates bill and sends it.
2. Customer uploads payment proof. Staff individually approves orders 1 and 2 as `paid`.
3. Staff then rejects the session bill (decides proof was invalid).
4. Session bill status: `'sent'` ✅ Reset correctly
5. Orders 1 and 2: `paymentStatus = 'paid'` ❌ Not reset — still show as paid
6. Order 3: `paymentStatus = 'unpaid'` ✅ Unchanged

**Result:** The session appears unpaid, but two of three orders show as paid. When the customer eventually pays and the bill is approved, the `approveSessionBill` function marks ALL orders as `'paid'` again — creating a double-approval record for orders 1 and 2 with different `verifiedAt` timestamps.

**Recommended Fix:** Add to `rejectSessionBill`:
```typescript
await tx.update(orders)
  .set({ paymentStatus: "unpaid", paymentVerificationStatus: null, updatedAt: now })
  .where(and(eq(orders.sessionId, session.id), eq(orders.paymentStatus, "awaiting_verification")));
```

---

### PAY-4 · `approvePayment` and `confirmStaffPayment` Are Not Transactional

**Severity: High**

**File:** `artifacts/api-server/src/routes/owner.ts`
**Functions:** `approvePayment` (line 1135), `confirmStaffPayment` (line 1167)

Both functions perform a single `db.update(orders)` with no transaction wrapper and no idempotency guard. If:
- A future version adds a secondary effect (audit log entry, analytics increment)
- The DB connection drops mid-way through a more complex update

...the update will partially apply. More importantly, double approval is possible: two staff simultaneously approving the same order will both succeed and will overwrite each other's `verifiedBy` and `verifiedAt` fields.

**Evidence:** No `WHERE payment_status != 'paid'` guard exists in either function.

---

### PAY-5 · Table IDs Fetched Before Bill Approval Transaction — Race on New Orders

**Severity: Medium**

**File:** `artifacts/api-server/src/routes/owner.ts`
**Function:** `approveSessionBill`
**Lines:** 1884–1897

Table IDs to be released are fetched **before** the transaction begins:
```typescript
// Line 1884: OUTSIDE transaction
const tableIdsRaw = await db.select({ tableId: orders.tableId })
  .from(orders).where(eq(orders.sessionId, sessionId));

// Line 1897: Transaction begins
await db.transaction(async (tx) => { ... });
```

**Scenario:** If a new order is added to the session between line 1884 and line 1897 (possible if session is still `active` at that moment), its table will not be in `tableIdsRaw` and will not be released when the session closes.

**Impact:** Table permanently shows "Occupied" even after the session closes and payment is confirmed.

---

### PAY-6 · No Guard Against Approving Already-Cancelled Bills

**Severity: Medium**

**File:** `artifacts/api-server/src/routes/owner.ts`
**Function:** `approveSessionBill` (line 1867)

The allowed statuses for approval are `"awaiting_verification"`. However, `"cancelled"` and `"generated"` bills are not explicitly rejected by name — the check only verifies the bill IS in `"awaiting_verification"`. A bill in `"cancelled"` state would correctly return 409. ✅

However: `markSessionBillPaid` at line 2012 defines `ALLOWED_STATUSES = ["generated", "sent", "awaiting_verification"]`. This means a bill that was "generated" but never sent can be marked as manually paid — the staff skips the payment proof collection step entirely. This may be intentional for walk-up cash payment, but it is not documented and allows bypassing the payment verification workflow.

---

## Part 4 — Concurrency & Race Condition Audit

### CONC-1 · Subscription Quota Race — Stale Read Allows Limit Overshoot

**Severity: High**

**File:** `artifacts/api-server/src/routes/menu.ts`
**Function:** `placeOrder`
**Line:** 369

The quota check reads the restaurant's `customersUsed` at request entry:
```typescript
// Line 300: restaurant fetched with current customersUsed
const [restaurant] = await db.select().from(restaurants)...

// Line 369: check is against STALE value
if (restaurant.customersUsed >= restaurant.customerLimit) {
  // reject
}

// Line 666: atomic increment
customersUsed: sql`customers_used + 1`
```

**Race:** If a restaurant has 1 quota slot remaining (e.g., limit=100, used=99), and two customers simultaneously place orders:
1. Both read `customersUsed = 99`
2. Both pass the check (`99 < 100`)
3. Both atomically increment → `customersUsed = 101`
4. Restaurant now exceeds quota by 1 with no correction

For Unlimited plan restaurants this is irrelevant. For Starter (500 customer limit), during a viral day this could allow 1–2 extra customers — minor financial impact.

**Recommended Fix:** Move the quota check into an atomic conditional update:
```sql
UPDATE restaurants
SET customers_used = customers_used + 1
WHERE id = $1 AND customers_used < customer_limit
RETURNING customers_used;
```
If no row is returned, the quota is exhausted.

---

### CONC-2 · Duplicate "Quota Exhausted" Notifications Under Concurrent Load

**Severity: Medium**

**File:** `artifacts/api-server/src/routes/menu.ts`
**Function:** `placeOrder`
**Lines:** 663–672

```typescript
const nowExhausted = newCount >= restaurant.customerLimit;
if (nowExhausted) {
  await db.insert(notifications).values({ ... "Quota exhausted" ... });
}
```

**Race:** If two orders simultaneously cross the quota threshold, both see `nowExhausted = true` (using stale reads) and both insert a notification. The owner's dashboard shows two "Quota Exhausted" alerts simultaneously. There is no deduplication — no `WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE type='quota_exhausted' AND restaurant_id=$1 AND created_at > NOW() - INTERVAL '1 minute')`.

**Recommended Fix:** Add a cooldown check or use `INSERT ... ON CONFLICT DO NOTHING` with a unique partial index on `(restaurant_id, type)` for time-windowed notification dedup.

---

### CONC-3 · SSE Set Modification During Concurrent Emission

**Severity: Medium**

**File:** `artifacts/api-server/src/lib/orderEvents.ts`
**Lines:** 31–37

```typescript
for (const res of clients) {     // iterating Set
  try {
    res.write(data);
  } catch {
    clients.delete(res);          // modifying Set during iteration
  }
}
```

JavaScript's `Set` is safe to modify during `for...of` iteration in the V8 engine — added items will be visited, deleted items will not cause errors. However, the **real risk** is:

If `res.write()` throws synchronously (e.g., socket is destroyed), the `catch` block deletes from the Set. But if `res.write()` throws asynchronously (returns a failed Promise), the deletion doesn't happen — the dead connection remains in the Set indefinitely, accumulating until the next successful-then-failed write.

**Node.js `http.ServerResponse.write()`** throws synchronously on a destroyed socket, so in practice this is safe. But the pattern is fragile and relies on undocumented V8/Node behaviour.

**More importantly:** There is no heartbeat `res.write(": keep-alive\n\n")` in `orderEvents.ts` itself. The heartbeat lives in `streamOrders` (`owner.ts:2245`) as a `setInterval`. If a second SSE consumer is ever added without the heartbeat, connections will silently stale.

---

### CONC-4 · Order Status Update — No Optimistic Locking

**Severity: Low**

**File:** `artifacts/api-server/src/routes/owner.ts`
**Function:** `updateOrder`
**Lines:** 477–516

Order status advances through a state machine (`ordered → preparing → ready → completed`). The validation reads current status, validates the transition, then writes the new status. No `version` column or `SELECT FOR UPDATE` prevents two concurrent staff members from both passing the same transition check.

**Practical impact:** Two staff simultaneously click "Mark as Preparing" → order correctly ends at `preparing` state but the side-effect (SSE notification to kitchen display) fires twice — kitchen display shows the ticket twice. Currently the only side effect is the SSE emit, which is idempotent in display terms. If future versions add inventory deductions or supplier alerts at status change, this becomes more dangerous.

---

### CONC-5 · Concurrent QR Regeneration — Redundant Chromium Work

**Severity: Low**

**File:** `artifacts/api-server/src/routes/owner.ts`
**Function:** `regenerateQr`
**Line:** 389

Two simultaneous requests to `POST /api/owner/tables/:id/qr` will both generate the same QR code PNG in parallel, then both write it to the database. The second write overwrites the first — same value, wasted CPU. No mutex or in-flight dedup exists.

---

## Part 5 — API Contract & Backend Consistency Audit

### API-1 · Inconsistent HTTP Status Codes for Missing `restaurantId`

**Severity: Medium**

**File:** `artifacts/api-server/src/routes/owner.ts`

`listCategories` (line 212): If `restaurantId` is missing from session → returns `200 OK` with `[]` (empty array).
`createCategory` (line 223): Same condition → returns `400 Bad Request`.
`createTable` (line 361): Same condition → returns `400 Bad Request`.

The read path silently succeeds with empty data, the write path correctly errors. A frontend that relies on an empty array to indicate "no categories yet" will silently succeed even if the session is broken.

---

### API-2 · `whatsappBridge.ts` Returns 422 While All Other Routes Return 400

**Severity: Low**

**File:** `artifacts/api-server/src/routes/whatsappBridge.ts`
**Line:** 221

Phone normalization failure returns `422 Unprocessable Entity`. Every other validation failure in the codebase returns `400 Bad Request`. This creates an inconsistency the frontend must handle separately.

---

### API-3 · Raw Database Error Leaked in `updateRestaurant` Response

**Severity: High**

**File:** `artifacts/api-server/src/routes/owner.ts`
**Function:** `updateRestaurant`
**Line:** 204

```typescript
res.status(500).json({ error: `Failed to save restaurant: ${message}` });
```

The `message` variable here is the raw error message from the PostgreSQL driver or Drizzle. It can contain:
- Column names and constraint names (`duplicate key value violates unique constraint "restaurants_slug_key"`)
- Table names
- SQL syntax fragments

**Real example if slug conflicts:** `"duplicate key value violates unique constraint \"restaurants_slug_key\""` — exposed to the owner's browser, leaking schema details.

**Recommended Fix:**
```typescript
res.status(500).json({ error: "Failed to save restaurant settings. Please try again." });
// Log the original error server-side: req.log.error({ err }, "updateRestaurant failed")
```

---

### API-4 · Health Endpoint Leaks Internal Service URLs

**Severity: Medium**

**File:** `artifacts/api-server/src/routes/health.ts`
**Lines:** ~20, 31

The `/api/health/db` endpoint returns raw error messages from DB connectivity checks. If `DATABASE_URL` is misconfigured, the response may include the partial connection string (hostname, port, database name) in the error message.

This endpoint is **not** protected by `requireAdmin`. Any unauthenticated caller can probe `/api/health/db` and potentially extract infrastructure details from error messages.

**Recommended Fix:** Protect `/api/health/db/details` with `requireAdmin` (already done). Add the same protection to `/api/health/db` or return only a binary `{ healthy: false }` on error without the message.

---

### API-5 · Free-Text Fields Stored Without Input Sanitization

**Severity: High**

**File:** `artifacts/api-server/src/routes/owner.ts`
**Functions:** `updateRestaurant` (lines 152–158), `createCategory` (line 228), `createMenuItem` (lines 288–289)

Restaurant `name`, `address`, `city`, category `name`, and menu item `name` and `description` are stored exactly as provided in `req.body` without `.trim()` and without HTML/script stripping.

**XSS risk:** If any of these fields are ever rendered as `innerHTML` in the portal or menu (rather than as text content), a restaurant owner could inject `<script>alert(document.cookie)</script>` into their restaurant name, which would execute in the browser of any customer visiting their menu or any admin viewing the restaurant list.

**Current mitigation:** React's default JSX rendering escapes HTML in text nodes. The risk is realized only if any component uses `dangerouslySetInnerHTML` with these fields. A grep is needed to confirm this — but the server should not trust the client to sanitize.

**Recommended Fix:** Add `.trim()` to all string fields on entry. Consider `xss` or `sanitize-html` for the `description` fields.

---

### API-6 · No File Size Check for Payment Screenshot Upload via Menu App

**Severity: Medium**

**File:** `artifacts/api-server/src/routes/menu.ts`
**Function:** `uploadPaymentProof` (line ~830)

The menu app payment screenshot upload (`POST /menu/:restaurantId/orders/:orderId/payment-proof`) accepts a base64-encoded image in the request body. There is no server-side check on:
- Maximum base64 string length
- Resulting decoded file size
- MIME type validation

A customer could submit a 50 MB base64 string. This is stored directly in `orders.paymentScreenshotUrl` (a `text` column in PostgreSQL). PostgreSQL has no practical row size limit for text, but:
1. Each oversized screenshot inflates every query that touches the `orders` table (full rows returned)
2. The Node.js process must hold the entire base64 string in memory during the request

**Contrast:** Owner image uploads (`owner.ts:2868`) correctly enforce a 5 MB limit via Multer + Sharp. The customer payment proof path has no equivalent guard.

**Recommended Fix:** Add a `Content-Length` check or base64 length limit (e.g., `if (req.body.screenshot.length > 10_000_000) return res.status(413)`).

---

## Part 6 — Memory Leak & Resource Management Audit

### MEM-1 · No Maximum WhatsApp Client Cap — OOM Risk at Scale

**Severity: Critical**

**File:** `services/whatsapp-bridge/src/services/whatsappClient.ts`

The `clients` Map has no size limit. Each entry spawns a Chromium instance consuming approximately 150–300 MB RAM.

| Restaurants | Chromium RAM | Total |
|-------------|-------------|-------|
| 10 | 150–300 MB each | 1.5–3 GB |
| 50 | 150–300 MB each | 7.5–15 GB |
| 100 | 150–300 MB each | 15–30 GB |

On Replit's hosting tier, this will trigger OOM-killing of the bridge process long before 100 simultaneously connected restaurants.

**Recommended Fix:** Add a `MAX_WHATSAPP_CLIENTS = parseInt(process.env.MAX_WA_CLIENTS ?? "20")` cap. When the cap is reached, new `initClient` calls should queue or return an error until a slot is available.

---

### MEM-2 · No Cleanup When Restaurant Is Deleted While WhatsApp Client Is Active

**Severity: High**

**File:** `services/whatsapp-bridge/src/services/whatsappClient.ts`
**File:** `artifacts/api-server/src/routes/admin.ts` (line 135: `deleteRestaurant`)

When `deleteRestaurant` runs, it deletes the restaurant row (and cascades to tables, categories, etc.). It does not call the bridge's `DELETE /api/clients/:restaurantId` endpoint to destroy the active WhatsApp session.

**Result:** The deleted restaurant's Chromium instance continues running in the bridge process — consuming RAM, CPU, and a WhatsApp connection slot — until the bridge is manually restarted. The `clients` Map retains the orphaned entry with `restaurantId` pointing to a non-existent restaurant.

**Recommended Fix:** In `deleteRestaurant` (`admin.ts`), after the DB delete, call:
```typescript
await tryBridgeSend(`DELETE /api/clients/${restaurantId}`);
```

---

### MEM-3 · `screenshotCleanup` Job Has No Concurrency Lock

**Severity: Medium**

**File:** `artifacts/api-server/src/lib/screenshotCleanup.ts`

The cleanup job runs via `setInterval` every 24 hours (`index.ts:187`). There is no boolean flag, advisory lock, or distributed lock to prevent simultaneous runs. If:
1. The first run takes longer than 24 hours (unlikely, but possible on a very large orders table with thousands of screenshots to null)
2. A second server instance starts (future horizontal scaling scenario)

...two cleanup jobs could run simultaneously, both issuing `UPDATE orders SET payment_screenshot_url = NULL WHERE ...` on the same rows. While the result is idempotent (nullifying a null is safe), it generates unnecessary DB load.

**For a distributed environment:** Use `pg_try_advisory_lock(12345)` at the start of the job and `pg_advisory_unlock(12345)` after completion.

---

### MEM-4 · Bridge `stdout`/`stderr` Streams Not Explicitly Unpiped on Kill

**Severity: Low**

**File:** `artifacts/api-server/src/lib/bridgeManager.ts`
**Function:** `_stopAll`

When the bridge process is killed (`_proc.kill("SIGTERM")`), the `stdout` and `stderr` `on("data")` listeners attached at lines 137–148 are not explicitly removed with `removeListener` or `_proc.stdout?.unpipe()`. Node.js will garbage-collect these once the process exits and the streams close, so in practice this is not a persistent leak — but it can cause a brief spike of buffered data from the dying process to be emitted to the already-terminated `data` listeners.

---

### MEM-5 · Bridge Manager Process Listeners Stack on Re-Initialisation

**Severity: Low**

**File:** `artifacts/api-server/src/lib/bridgeManager.ts`
**Lines:** 65–66

```typescript
process.on("exit", _stopAll);
process.on("SIGTERM", _stopAll);
```

These are added every time `startBridgeManager` is called. If the function were called twice (e.g., in a future hot-reload scenario or test environment), Node.js would emit a warning after 10 stacked listeners and the `_stopAll` function would execute multiple times on process exit.

**Current risk:** Low — `startBridgeManager` is called exactly once at `index.ts:173`. Becomes a risk if the architecture evolves.

---

### MEM-6 · SSE Connections Map Never Fully Pruned Without Active Events

**Severity: Medium**

**File:** `artifacts/api-server/src/lib/orderEvents.ts`
**Lines:** 11–25

The `connections` Map stores `Set<Response>` per `restaurantId`. The 25-second heartbeat in `streamOrders` (`owner.ts:2245`) will detect dead connections via a failed write and call `removeConnection`. However:

- A restaurant with no orders and no active kitchen events receives no SSE writes between heartbeats
- If the heartbeat interval is cleared (e.g., `streamOrders` component unmounts on the client side but the SSE connection socket stays open at the TCP layer), the `Set` entry remains with the stale `Response` object

**Realistic scenario:** Restaurant owner opens dashboard, SSE connects, then the owner's PC goes into sleep mode mid-session. TCP keepalive may not trigger for minutes or hours. The `Response` object sits in the Map undetectable until either a write is attempted or the heartbeat fires.

The heartbeat at 25-second intervals mitigates this effectively for active use, but long-idle connections in between heartbeats occupy Map entries.

---

## Final Scores

| Domain | Score | Primary Evidence |
|--------|-------|----------------|
| **Database Integrity** | 48 / 100 | Missing CHECKs, lazy subscription expiry, TOCTOU in bill approval, no sequence gap handling, `bill_number` placeholder state |
| **Authentication & Authorization** | 52 / 100 | Suspended owner keeps access, plaintext reset tokens, admin destructive actions unprotected by sensitive auth |
| **Payment Integrity** | 44 / 100 | `rejectPayment` reverses paid orders, TOCTOU in session bill approval (both paths), `rejectSessionBill` doesn't reset order states |
| **Concurrency Safety** | 45 / 100 | Quota overshoot race, duplicate notifications, TOCTOU in bill approval, no advisory locks anywhere |
| **API Consistency** | 58 / 100 | Raw DB errors leaked, no screenshot size limit, free-text stored unsanitized, status code inconsistency |
| **Resource Management** | 50 / 100 | No WhatsApp client cap, no restaurant-deletion bridge cleanup, no cleanup lock |

---

## Top 10 Remaining Production Blockers

| Priority | Blocker | File | Lines | Effort |
|----------|---------|------|-------|--------|
| **1** | **Suspended owner retains full dashboard access** — `requireOwner` does not check `restaurant.isActive`; admin suspensions have no effect until session expires | `middlewares/auth.ts:44`, `admin.ts:80–96` | 2 hours |
| **2** | **`rejectPayment` reverses `paid` → `unpaid` with no guard** — staff error or IDOR can unpay a confirmed order; customer double-charged | `owner.ts:1220` | 30 minutes |
| **3** | **TOCTOU race in `approveSessionBill` and `markSessionBillPaid`** — status check outside transaction allows two staff to double-approve the same bill | `owner.ts:1858–1897, 2003–2035` | 3 hours |
| **4** | **`rejectSessionBill` leaves constituent orders in stale `paid` state** — financial ledger diverges; re-payment creates double-approval records | `owner.ts:1935–1965` | 2 hours |
| **5** | **No WhatsApp client cap** — unlimited Chromium instances; OOM at ~20+ simultaneously connected restaurants | `whatsappClient.ts` | 1 hour |
| **6** | **Raw PostgreSQL error messages leaked in API responses** — schema details (`constraint names`, `column names`) visible to users | `owner.ts:204` | 30 minutes |
| **7** | **Admin destructive actions bypass sensitive auth** — suspend, delete restaurant, change plan pricing require only a regular admin session | `admin.ts`, `sensitiveAuth.ts` | 3 hours |
| **8** | **Password reset tokens stored in plaintext** — DB leak exposes all active reset tokens; any can be immediately used for account takeover | `auth.ts:371`, `adminAuth.ts:93` | 3 hours |
| **9** | **Subscription quota race** — concurrent orders can exceed quota by N simultaneous customers; revenue lost without corresponding quota deduction | `menu.ts:369–666` | 2 hours |
| **10** | **No cleanup when restaurant deleted while WhatsApp session active** — orphaned Chromium processes persist, consuming RAM and WA connection slots | `admin.ts:137`, `whatsappClient.ts` | 1 hour |

**Total estimated effort for all 10 blockers: ~18 engineering hours (2–3 days)**

---

## Production Scale Assessment

### Can Bitebend safely run for 100 restaurants?

**Conditionally yes**, after fixing blockers 1–6 above. The primary constraints at 100 restaurants:
- WhatsApp Bridge: 100 simultaneously connected restaurants would require ~15–30 GB RAM for Chromium alone. In practice, fewer than 30% of restaurants are simultaneously connected at peak. With the client cap (blocker 5) set to 40–50 concurrent sessions, 100 restaurants is feasible on a 16 GB server.
- Database: 7 missing FK indexes become painful at 100 restaurants × average 50 orders/day = 5,000 daily orders. Dashboard query time degrades from ~50ms to ~2–5 seconds without indexes.
- SSE: 100 restaurants × 2 open dashboard tabs = 200 SSE connections. Fully manageable on a single Node process.

**Verdict: Yes after fixing blockers 1–10 and adding the 7 missing DB indexes.**

---

### Can Bitebend safely run for 500 restaurants?

**No in the current architecture** without two specific changes:

1. **WhatsApp Bridge must be extracted** from the API server's child process into an independent service. At 500 restaurants with 150 active sessions, Chromium RAM alone (150 × 250MB) = 37.5 GB — exceeding any single-server budget. The bridge needs horizontal scaling (multiple bridge instances with a session registry in Redis or DB).

2. **Missing database indexes must be added.** At 500 restaurants × 50 orders/day, `orders` table grows at 25,000 rows/day. Without an index on `orders.restaurant_id`, every dashboard query at peak dinner service (500 restaurants × 2 staff viewing dashboards = 1,000 concurrent queries) will full-scan the orders table.

**With those two changes:** 500 restaurants is achievable on a 3-node setup (API server + bridge cluster + PostgreSQL).

---

### Can Bitebend safely run for 1,000 restaurants?

**No** without the following architectural changes not present in the current codebase:

| Required Change | Current State | Work Required |
|----------------|--------------|---------------|
| Redis-backed SSE (replace in-memory Map) | In-memory, single-node only | 2 weeks |
| Distributed WhatsApp bridge with session storage in DB/S3 | Single child process | 4–6 weeks |
| PostgreSQL read replicas for dashboard queries | Single DB | Infrastructure only |
| S3/GCS for payment screenshots and images | Base64 in PostgreSQL | 2 weeks |
| API server horizontal scaling (stateless) | Single node (sessions in PG ✅) | Mostly ready; SSE is the blocker |
| Rate limiting per-restaurant (not just per-IP) | Per-IP only | 1 week |

**With all of the above:** 1,000 restaurants is achievable. Without them, the system will collapse under SSE memory pressure and WhatsApp Chromium OOM between 200–300 restaurants.

---

## Remaining Architectural Blockers Before Large-Scale Deployment

1. **In-memory SSE Map** (`orderEvents.ts`) — single-node assumption; must be replaced with Redis Pub/Sub before any horizontal scaling of the API server
2. **WhatsApp Bridge as child process** — must become an independent, horizontally scalable service with remote session storage
3. **Base64 screenshots in PostgreSQL** — row size bloat; must move to object storage (S3/GCS) before the `orders` table grows beyond ~1M rows
4. **No CI/CD pipeline** — every deployment is a manual, unvalidated event; must be automated before team size exceeds 2 engineers
5. **Untransacted `placeOrder`** (reported in Part 2/3) — data integrity risk that worsens under concurrent load; must be fixed before scale
6. **Missing database indexes** (7 columns) — performance cliff at ~100k+ orders in the table

---

## Overall Production Readiness Score After This Audit

**43 / 100**

The application has a well-designed data model, a competent session-based auth system, a smart payment UX, and good operational logging. The score is held back by:
- Active IDOR vulnerabilities in payment endpoints (Part 3)
- Financial state machine bugs (`rejectPayment`, `rejectSessionBill`)
- Missing session invalidation on suspension
- No transactional safety on order placement
- No CI/CD
- Single-node architecture with no clear path to horizontal scale

**Minimum score to go to production: 70/100**
**Estimated effort to reach 70/100: 10–14 engineering days of focused fixes**
