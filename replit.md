# Bitebend — QR Restaurant Marketplace

## User Preferences

- **Production is the source of truth.** When fixing, debugging, or resolving any issue, target the live deployed app at `bitebend.in`. Never stop after confirming a fix only on the local dev server or Vite preview. Always verify the fix will survive the production build pipeline and deploy it. If dev and production behave differently, production wins.

## Overview

QR-based restaurant ordering platform for Indian restaurants. Customers scan a QR code at their table to browse the menu and place orders. Restaurant owners manage their menu, tables, and live orders from a portal. An admin panel allows platform moderation.

pnpm workspace monorepo using TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

| Artifact | Path | Description |
|---|---|---|
| `api-server` | `/api` | Express 5 REST API, session auth, all routes |
| `portal` | `/portal` | React + Vite owner/admin dashboard |
| `menu` | `/menu` | React + Vite customer-facing menu app |

## Demo Credentials

- **Owner**: `demo@spicegarden.com` / `demo123` — "Spice Garden" restaurant
- **Admin**: `admin@bitebend.in` / `admin123` — super_admin role (DB email updated from tableserve.in)

## Customer Menu QR URL Format

```
/menu/<restaurantId>/table/<tableId>
```

Example: `/menu/1/table/3` → Spice Garden, Table T3

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm run test` — run all test suites (url-utils unit tests + MenuPage regression tests)
- `pnpm run lint` — ESLint: show all hooks errors and warnings across menu and portal
- `pnpm run check:hooks` — ESLint hooks gate (used in CI / pre-deploy; exits non-zero on any error)
- `pnpm run verify-deployment` — full pre-deploy gate: render safety + freshness + hooks lint
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run generate` — generate a new migration file from schema changes
- `pnpm --filter @workspace/db run migrate` — apply pending migrations (dev; production runs automatically on startup)

## Architecture

### Database Schema (11 tables)

- `users` — owner and super_admin accounts (bcrypt password)
- `restaurants` — profile + `plan_id`, `customers_used`, `customer_limit`, `subscription_status`
- `subscription_plans` — Starter/Growth/Pro/Unlimited plans with price + customer_limit
- `subscription_transactions` — payment records (Razorpay or UPI), status: pending/paid/failed; stores `razorpay_order_id`, `razorpay_payment_id` (also used for `UTR:<ref>` for manual UPI)
- `notifications` — admin-to-owner messages with read status
- `menu_categories` — ordered categories per restaurant
- `menu_items` — items with price, veg flag, availability
- `restaurant_tables` — tables with QR code URL
- `orders` — customer orders with status lifecycle (`pending_payment` → `awaiting_confirmation` → `pending` → `confirmed` → `preparing` → `ready` → `completed`)
- `order_items` — line items per order
- `platform_settings` — key/value store for admin-configurable settings (e.g. `platform_upi_id`)

### Subscription Model

- Usage-based: pay per customer quota (₹199/500, ₹499/2000, ₹999/5000, ₹1999/unlimited)
- Razorpay integration for card/UPI payments; manual UPI fallback (admin marks paid)
- `subscription_status`: active | exhausted | suspended
- `customers_used` tracks unique customer quota consumption (incremented per new unique customer)
- Owners can recharge any time from the Subscription page

### API Routes

**Public**
- `GET /api/subscription/plans` — list active plans (no auth)
- `GET /api/menu/:restaurantId` — public menu (categories + items)
- `POST /api/menu/:restaurantId/orders` — place order (customer)

**Auth**
- `POST /api/auth/register` — create owner + restaurant, optionally with planId + Razorpay payment
- `POST /api/auth/login` / `GET /api/auth/me` / `POST /api/auth/logout`
- `POST /api/auth/registration-order` — create Razorpay order during registration

**Admin Auth (public — no session required)**
- `POST /api/admin/auth/forgot-password` — generate 30-min single-use reset token (admin only; sends email if SMTP configured, otherwise returns `resetLink` in response)
- `GET /api/admin/auth/validate-reset-token?token=` — check token validity (for frontend page load)
- `POST /api/admin/auth/reset-password` — validate token, bcrypt-hash new password, invalidate token

**Owner** (requireOwner)
- `GET/PUT /api/owner/restaurant`
- `GET/POST/PUT/DELETE /api/owner/categories`
- `GET/POST/PUT/DELETE /api/owner/menu-items`
- `GET/POST/DELETE /api/owner/tables` + `POST /api/owner/tables/:id/qr`
- `GET/PUT /api/owner/orders/:id` + `GET /api/owner/orders/:id/whatsapp`
- `GET /api/owner/stats`
- `POST /api/subscription/plans/:planId/order`
- `POST /api/subscription/verify`
- `GET /api/subscription/transactions`
- `GET /api/subscription/notifications`
- `PATCH /api/subscription/notifications/:id/read`

**Admin** (requireAdmin — super_admin only)
- `GET /api/admin/restaurants` + toggle/suspend/activate/delete
- `GET/POST/PUT/DELETE /api/admin/plans`
- `GET /api/admin/transactions` + `POST /api/admin/transactions/:id/mark-paid`
- `GET /api/admin/stats` / orders / customers
- `POST /api/admin/notifications`
- `GET /api/admin/payment-settings` — returns `{ upiId, razorpayConfigured, razorpayKeyId, pendingCount, pendingAmount, collectedAmount }`
- `PUT /api/admin/payment-settings` — updates platform UPI ID in `platform_settings` table

### Portal Pages

- `/portal/login` — sign-in page
- `/portal/register` — 3-step wizard: Account+Restaurant → Plan+Pay (Razorpay/UPI) → Confirm
- `/portal/dashboard` — stats cards + live orders + tables grid
- `/portal/menu` — category + item CRUD with veg toggles
- `/portal/tables` — table management + QR code generation
- `/portal/subscription` — owner: quota usage bar, plan cards (recharge), payment history, notifications
- `/portal/profile` — restaurant settings (UPI, WhatsApp, tax)
- `/portal/admin` — 7-tab super-admin: Overview, Restaurants, Plans CRUD, Payments, Orders, Customers, Notifications

### Menu App Pages

- `/menu/` — scan-prompt splash (no QR context)
- `/menu/:restaurantId` — full menu browse (no table context)
- `/menu/:restaurantId/table/:tableId` — menu + cart + order placement

### Auth Flow

- Session cookie (express-session + connect-pg-simple)
- `SESSION_SECRET` env var
- `sameSite: "lax"` in dev, `"none"` in prod (proxy mTLS)
- Protected routes: owner role required; super_admin for admin panel

### WhatsApp Billing

Uses `wa.me/{phone}?text=...` deep-link — no API key required. Bill text is URL-encoded and includes itemized order details.

## React Hooks Rules

### The cardinal rule

**All hook calls must appear before any conditional `return` statement.**

React counts how many hooks a component calls on each render. If any render path calls fewer hooks than another (because a hook appears after an early `return`), React throws error #310 ("hook count mismatch"). This always results in a production crash.

```tsx
// ❌ WRONG — useMemo after an early return
function MyComponent() {
  const [loading, setLoading] = useState(true);

  if (loading) return <Spinner />;   // ← early return

  const value = useMemo(() => compute(), []);  // ← never reached when loading=true
  //                                               React error #310 when loading flips!
}

// ✅ CORRECT — all hooks before any return
function MyComponent() {
  const [loading, setLoading] = useState(true);

  // useMemo is always called, regardless of the loading branch
  const value = useMemo(() => compute(), []);

  if (loading) return <Spinner />;   // ← early return is now safe

  return <div>{value}</div>;
}
```

### Enforcement

The ESLint `react-hooks/rules-of-hooks` rule catches violations **as errors** at lint time:

```
pnpm run lint          # show all errors + warnings
pnpm run check:hooks   # CI gate — exits non-zero on any error
```

`check:hooks` is part of `verify-deployment`, so the pre-deploy gate fails if a violation exists:

```
pnpm run verify-deployment
# = check:render-safety + check:freshness + check:hooks
```

### The other hooks rule

`react-hooks/exhaustive-deps` is set to **warn** (not error). Every warning should be reviewed — missing dependencies cause stale-closure bugs — but some intentional omissions are valid (e.g. a `ref` or a stable setter from `useState`).

### Regression tests

`artifacts/menu/src/__tests__/MenuPage.hooks.test.tsx` covers the exact scenario that caused the production crash:

- **loading=true render**: hooks still all called; no early-return skips them
- **loading → loaded transition**: hook count identical on both renders; no React error
- **error state**: same hook stability through error transition
- **re-mount**: clean hook state after unmount/remount cycle

Run with: `pnpm --filter @workspace/menu run test`

### What to do when you see a hooks warning or error

| Symptom | Cause | Fix |
|---|---|---|
| ESLint error: `react-hooks/rules-of-hooks` | Hook after conditional return / inside if/for/nested fn | Move hook above the early return |
| React error #310 in production | Same as above, wasn't caught by lint | Move hook; add/run regression test |
| ESLint warning: `react-hooks/exhaustive-deps` | Missing dependency in useEffect/useCallback/useMemo | Add the dep, or suppress with a comment **and a justification** |

## Payment Architecture — STABLE

```
CUSTOMER_PAYMENT_V2 = STABLE
PAYMENT_VERIFICATION_MODE = MANUAL
ENABLE_PAYMENT_OCR = false (default, intentional)
```

**Full customer payment flow:**
```
Checkout → Scan QR & Pay → PaymentBillView → OrderSuccessView
```

### PaymentBillView — Dynamic QR (FROZEN)

`artifacts/menu/src/pages/menu/PaymentBillView.tsx`

**Do NOT** render the restaurant's uploaded QR image directly. The `/payment-qr` API endpoint is not used by this view.

**QR generation:** `QRCodeSVG` (from `qrcode.react`) renders a dynamically generated UPI deep-link per order. The link is built by `generateUPILink()` in `utils.ts`:

```
upi://pay?pa={vpa}&pn={sanitized+encoded name}&am={N.toFixed(2)}&tn=Order-{orderId}&cu=INR
```

**Field rules (validated, do not change):**
| Field | Value | Encoding |
|---|---|---|
| `pa` | UPI VPA (`extractedUpiId` or `upiId`) | NOT encoded — `@` must be literal |
| `pn` | Merchant name (max 50 chars) | `sanitizeUPIText` strips `& \| / # ? = % : ; \`, then `encodeURIComponent` |
| `am` | Order total | `Number(total).toFixed(2)` — always 2 decimal places |
| `tn` | `Order-{orderId}` (max 25 chars) | `sanitizeUPIText` + `encodeURIComponent` (no-op for plain alphanumeric) |
| `cu` | `INR` | Literal — no encoding |

**Amount precision contract:** `249.1` → `"249.10"`, `249.999999` → `"250.00"`. Never `₹249.1` or `₹249.999999` in the QR payload.

**UPI ID resolution:** `restaurant.hasPaymentQr ? extractedUpiId : upiId`. Fallback to cash-payment UI when no valid VPA (`activeUpiId` must contain `@` and no spaces).

**Scan behaviour:** QR is passive — no force-open, no `window.location.href`, no `intent://`. Customer scans from any UPI app (GPay, PhonePe, Paytm, BHIM). Amount and merchant are pre-filled; customer taps Pay only.

**Production scan validation (confirmed):**
- GPay: merchant populated, amount prefilled, note visible ✅
- PhonePe: merchant populated, amount prefilled, note visible ✅
- BHIM: merchant populated, amount prefilled, note visible ✅
- Paytm: merchant populated, amount prefilled (ignores `tn` silently, does not reject) ✅

**Primary verification flow (current architecture):**
```
QR code → customer uploads payment screenshot → restaurant staff verifies manually in dashboard
```

**Why OCR is disabled:** The `ENABLE_PAYMENT_OCR` flag defaults to `false`. OCR code (Google Vision + OpenAI) is retained in `artifacts/api-server/src/routes/menu.ts` but gated behind the flag. Do **not** re-enable without explicit product decision. To re-enable: set `ENABLE_PAYMENT_OCR=true` in env vars.

**Screenshot retention:** Stored as base64 in `orders.paymentScreenshotUrl`. A cleanup job (`purgeExpiredScreenshots`) runs on startup and every 24 h. It NULLs the screenshot blob for orders that are `paid` or `rejected` and older than `PAYMENT_SCREENSHOT_RETENTION_DAYS` (default: 30 days). Audit metadata (`paymentVerificationStatus`, `verificationMethod`, `verifiedBy`, `verifiedAt`) is preserved.

**Screenshot replacement guard:** Backend returns 409 if screenshot already exists and `forceReplace` is not `true`. Frontend shows "Screenshot already submitted" with a "Replace Screenshot" button that requires explicit confirmation before overwriting.

**Rejection flow:** Staff rejects → `paymentStatus: "unpaid"`, `paymentVerificationStatus: "rejected"`. Customer sees: *"Payment proof could not be verified. Please show payment confirmation to restaurant staff."* in order history.

**Analytics events** (structured log fields, queryable from server logs):
- `screenshot_uploaded` — customer uploaded proof
- `manual_payment_verified` — staff confirmed payment
- `manual_payment_rejected` — staff rejected proof

## Important Notes

- Express 5: `req.params.xxx` is `string | string[]` — routes cast with `parseInt(String(...))`
- Menu artifact BASE_URL is `/menu/` but API calls use absolute paths (no BASE prefix)
- `lib/api-zod/src/index.ts` must only re-export from generated — codegen overwrites it
- bcrypt listed in `onlyBuiltDependencies` in `pnpm-workspace.yaml`
- Tax is stored as `tax_percent` on restaurant; applied at order creation
- **CRITICAL**: Never use `router.use(middleware)` in a sub-router that is mounted via `router7.use(subRouter)` — it acts as a catch-all and leaks auth to ALL subsequent routes. Always use per-route middleware: `router.get("/path", requireOwner, handler)`
- `lib/db` is a composite TypeScript lib — must run `pnpm run typecheck:libs` after schema changes so declaration files in `lib/db/dist/` are updated before api-server typecheck
- Razorpay keys: `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` env vars — falls back gracefully to UPI if not set
- Subscription plans are seeded in the DB (Starter ₹199, Growth ₹499, Pro ₹999, Unlimited ₹1999); prices stored in paise
