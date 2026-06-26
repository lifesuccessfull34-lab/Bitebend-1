---
name: Rupee migration (paise → rupees)
description: Currency storage model refactor — what changed, the split state that existed before, and the Razorpay paise boundary rule.
---

## Pre-migration split state (important context)
The DB was NOT uniformly in paise before migration 0022. It was split:
- **Already rupees**: menu_items.price, orders.subtotal/tax/total, order_items.unit_price, session_bills.subtotal/tax/total
- **In paise**: subscription_plans.price, subscription_transactions.amount, restaurants.subscription_fee

The frontend incorrectly divided ALL values by 100, hiding the inconsistency in display.

## Migration 0022 (0022_rupee_conversion.sql)
- subscription_plans.price: ÷ 100 (paise → rupees)
- subscription_transactions.amount: ÷ 100 (paise → rupees)
- restaurants.subscription_fee: ÷ 100 (paise → rupees)
- All monetary INTEGER columns → DOUBLE PRECISION (type change only for menu/order side; data unchanged)

## Razorpay paise boundary rule
Razorpay always requires paise. Multiply by 100 at EVERY Razorpay gateway call:
- `routes/subscriptions.ts`: `Math.round(plan.price * 100)` ← subscription recharge
- `routes/auth.ts`: `Math.round(plan.price * 100)` ← registration flow
- `routes/menu.ts`: `Math.round(amount * 100)` ← customer order payment (was already correct)
- Frontend `Subscription.tsx`: `Math.round(orderRes.amount * 100)` at Razorpay init
- Frontend `RegisterPage.tsx`: `Math.round(orderRes.amount * 100)` at Razorpay init

**Why:** Razorpay API requires integer paise. Internal storage and display must be rupees. Convert only at the gateway boundary, never anywhere else.

## Frontend display rule (after migration)
No /100 conversions needed anywhere for currency display. Values from API are in rupees.
Use `Number(value).toLocaleString("en-IN")` or `Number(value).toFixed(2)`.
The only remaining /100 in the codebase is percentage math (taxPercent, usedPct, openRate) — those are correct.

## Drizzle schema
All monetary columns are now `doublePrecision` (returns JS number from postgres-js driver, not string like numeric would). Adding a new monetary column: use `doublePrecision("col_name")`.

## Admin SQL casts
Monetary sum queries in admin.ts use `::float8` cast (not `::int`) to preserve decimal precision in aggregates.
