ALTER TABLE "orders" ADD COLUMN "razorpay_order_id" text;
ALTER TABLE "orders" ADD COLUMN "razorpay_payment_id" text;
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp;
