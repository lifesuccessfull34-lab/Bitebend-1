-- Migration 0026: DB-level duplicate protection for razorpay_payment_id
--
-- verifyPayment previously relied only on an application-level
-- SELECT-then-INSERT check to avoid creating two subscription_transactions
-- rows for the same Razorpay payment. Two concurrent verify requests for the
-- same payment could both pass the SELECT check before either INSERT
-- completed, creating duplicate rows and potentially double-activating the
-- subscription.
--
-- This partial unique index makes that scenario impossible at the database
-- level: only one row per non-null razorpay_payment_id can exist. NULLs
-- (pending UPI transactions awaiting a UTR) are unaffected since the index
-- excludes them. The application catches the resulting unique-violation
-- (23505) and returns the existing transaction instead of a 500 error.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_subscription_transactions_razorpay_payment_id_unique"
  ON "subscription_transactions" ("razorpay_payment_id")
  WHERE "razorpay_payment_id" IS NOT NULL;
