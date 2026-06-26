-- Migration 0022: Convert monetary columns from paise to rupees
--
-- Three subscription tables were storing amounts in paise (smallest INR unit).
-- All menu/order tables were already storing amounts in rupees (confirmed by
-- code audit of placeOrder route). This migration:
--   1. Converts subscription_plans.price, subscription_transactions.amount,
--      and restaurants.subscription_fee from paise → rupees (÷ 100).
--   2. Changes all monetary INTEGER columns to DOUBLE PRECISION so decimal
--      rupee values (e.g. ₹125.50) can be stored without precision loss.
--   3. Menu/order monetary columns only change type — data is unchanged.
--
-- REVERSIBLE: multiply by 100 and cast back to integer to undo.

ALTER TABLE "subscription_plans"
  ALTER COLUMN "price" TYPE double precision USING price / 100.0;

ALTER TABLE "subscription_transactions"
  ALTER COLUMN "amount" TYPE double precision USING amount / 100.0;

ALTER TABLE "restaurants"
  ALTER COLUMN "subscription_fee" TYPE double precision USING subscription_fee / 100.0;

-- Menu / order columns — data already in rupees, type change only.
ALTER TABLE "menu_items"
  ALTER COLUMN "price" TYPE double precision USING price::double precision;

ALTER TABLE "order_items"
  ALTER COLUMN "unit_price" TYPE double precision USING unit_price::double precision;

ALTER TABLE "orders"
  ALTER COLUMN "subtotal" TYPE double precision USING subtotal::double precision,
  ALTER COLUMN "tax"      TYPE double precision USING tax::double precision,
  ALTER COLUMN "total"    TYPE double precision USING total::double precision;

ALTER TABLE "session_bills"
  ALTER COLUMN "subtotal" TYPE double precision USING subtotal::double precision,
  ALTER COLUMN "tax"      TYPE double precision USING tax::double precision,
  ALTER COLUMN "total"    TYPE double precision USING total::double precision;
