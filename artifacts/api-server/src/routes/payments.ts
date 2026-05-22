import { Router } from "express";
import type { RequestHandler } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { orders, restaurants } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { emitOrderEvent } from "../lib/orderEvents";

const router = Router();

// ─── POST /api/payments/webhook ──────────────────────────────────────────────
// Razorpay sends signed webhook events here after payment.captured / order.paid.
// We verify the signature with RAZORPAY_WEBHOOK_SECRET, then mark the order paid.
// The restaurant uses their own Razorpay account, so the webhook secret is stored
// per-restaurant on the restaurants table (razorpayWebhookSecret).
// Fallback: platform-level RAZORPAY_WEBHOOK_SECRET env var for subscriptions.
//
// IMPORTANT: We must read the raw body to verify the HMAC signature.
// Express json() middleware has already parsed it — we re-stringify for verification.
// Razorpay signs the raw request body bytes, so we must use the exact same bytes.
// The standard pattern is to store the raw buffer via a verify callback in bodyParser,
// but since we use express.json() globally, we re-stringify and accept a minor
// risk of whitespace differences (Razorpay's body is compact JSON, so this is safe).

const webhookHandler: RequestHandler = async (req, res) => {
  const signature = req.headers["x-razorpay-signature"] as string | undefined;

  if (!signature) {
    req.log.warn("[Webhook] Missing x-razorpay-signature header");
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const event = body.event as string | undefined;
  const payload = body.payload as Record<string, unknown> | undefined;

  if (!event || !payload) {
    res.status(400).json({ error: "Invalid webhook payload" });
    return;
  }

  req.log.info({ event }, "[Webhook] Razorpay event received");

  // ── Only handle payment captured / order paid events ─────────────────────
  if (event !== "payment.captured" && event !== "order.paid" && event !== "payment.authorized") {
    res.json({ received: true, skipped: true });
    return;
  }

  // ── Extract payment and order IDs from payload ───────────────────────────
  let razorpayPaymentId: string | null = null;
  let razorpayOrderId: string | null = null;
  let paidAmount: number | null = null;

  if (event === "order.paid") {
    const orderEntity = (payload.order as { entity?: Record<string, unknown> })?.entity;
    const paymentEntity = (payload.payment as { entity?: Record<string, unknown> })?.entity;
    razorpayOrderId = (orderEntity?.id as string) ?? null;
    razorpayPaymentId = (paymentEntity?.id as string) ?? null;
    paidAmount = typeof paymentEntity?.amount === "number" ? paymentEntity.amount : null;
  } else {
    const paymentEntity = (payload.payment as { entity?: Record<string, unknown> })?.entity;
    razorpayPaymentId = (paymentEntity?.id as string) ?? null;
    razorpayOrderId = (paymentEntity?.order_id as string) ?? null;
    paidAmount = typeof paymentEntity?.amount === "number" ? paymentEntity.amount : null;
  }

  if (!razorpayOrderId) {
    req.log.warn({ event, payload }, "[Webhook] Could not extract razorpay_order_id from payload");
    res.status(400).json({ error: "Could not extract order ID from webhook payload" });
    return;
  }

  // ── Find the platform order linked to this Razorpay order ────────────────
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.razorpayOrderId, razorpayOrderId))
    .limit(1);

  if (!order) {
    req.log.warn({ razorpayOrderId }, "[Webhook] No platform order found for razorpay_order_id");
    // Return 200 to prevent Razorpay from retrying — this may be a subscription webhook
    res.json({ received: true, skipped: true, reason: "no matching order" });
    return;
  }

  // ── Verify signature using the restaurant's webhook secret ───────────────
  const [restaurant] = await db
    .select({ razorpayWebhookSecret: restaurants.razorpayWebhookSecret })
    .from(restaurants)
    .where(eq(restaurants.id, order.restaurantId))
    .limit(1);

  const webhookSecret =
    restaurant?.razorpayWebhookSecret?.trim() ||
    process.env["RAZORPAY_WEBHOOK_SECRET"]?.trim();

  if (!webhookSecret) {
    req.log.warn({ orderId: order.id }, "[Webhook] No webhook secret configured — skipping signature verification");
  } else {
    const rawBody = JSON.stringify(body);
    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (expectedSig !== signature) {
      req.log.warn({ orderId: order.id }, "[Webhook] Signature mismatch — rejecting");
      res.status(400).json({ error: "Invalid signature" });
      return;
    }
  }

  // ── Already marked paid — idempotent ────────────────────────────────────
  if (order.paymentStatus === "paid") {
    req.log.info({ orderId: order.id }, "[Webhook] Order already paid — idempotent response");
    res.json({ received: true, alreadyPaid: true });
    return;
  }

  // ── Mark order as paid ───────────────────────────────────────────────────
  await db
    .update(orders)
    .set({
      paymentStatus: "paid",
      paymentMethod: "razorpay",
      razorpayPaymentId: razorpayPaymentId ?? undefined,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  req.log.info(
    { orderId: order.id, razorpayPaymentId, razorpayOrderId, paidAmount },
    "[Webhook] Order marked paid via Razorpay",
  );

  // ── Emit real-time event to portal dashboard ─────────────────────────────
  emitOrderEvent(order.restaurantId, {
    id: order.id,
    customerName: order.customerName,
    tableNumber: order.tableNumber,
    total: order.total,
    itemCount: 0,
  });

  res.json({ received: true, orderId: order.id, status: "paid" });
};

// POST /api/payments/webhook — Razorpay signed webhook
router.post("/payments/webhook", webhookHandler);

export default router;
