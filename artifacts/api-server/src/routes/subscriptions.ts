import { Router } from "express";
import { db } from "@workspace/db";
import {
  subscriptionPlans,
  subscriptionTransactions,
  restaurants,
  notifications,
  platformSettings,
} from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import { requireOwner } from "../middlewares/auth";
import Razorpay from "razorpay";
import type { RequestHandler } from "express";

async function getPlatformUpiId(): Promise<string> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, "platform_upi_id")).limit(1);
  return row?.value ?? process.env.PLATFORM_UPI_ID ?? "bitebend@upi";
}

async function getRazorpayKeys(): Promise<{ keyId: string | null; keySecret: string | null }> {
  const rows = await db.select().from(platformSettings)
    .where(inArray(platformSettings.key, ["razorpay_key_id", "razorpay_key_secret"]));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    keyId: map.get("razorpay_key_id") ?? process.env.RAZORPAY_KEY_ID ?? null,
    keySecret: map.get("razorpay_key_secret") ?? process.env.RAZORPAY_KEY_SECRET ?? null,
  };
}

function computeExpiry(validityType: string, validityValue: number): Date {
  const d = new Date();
  if (validityType === "months") {
    d.setMonth(d.getMonth() + validityValue);
  } else {
    d.setDate(d.getDate() + validityValue);
  }
  return d;
}

const router = Router();

// ── Public: list plans ─────────────────────────────────────────────────────
// Plans almost never change between deploys.  Cache the DB result in memory
// for 5 minutes so every portal page-load doesn't pay the cold-pool round-trip
// (measured at 300–400 ms on first request in production).

let plansCache: { data: unknown; expiresAt: number } | null = null;
const PLANS_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Called by admin plan create/update/delete routes so changes (e.g. deactivating
// a plan) are reflected immediately instead of waiting out the TTL.
export function invalidatePlansCache(): void {
  plansCache = null;
}

const listPlans: RequestHandler = async (_req, res) => {
  const now = Date.now();
  if (plansCache && now < plansCache.expiresAt) {
    res.json(plansCache.data);
    return;
  }
  const plans = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.isActive, true))
    .orderBy(subscriptionPlans.displayOrder);
  plansCache = { data: plans, expiresAt: now + PLANS_TTL_MS };
  res.json(plans);
};

// ── Public: payment gateway config ─────────────────────────────────────────

const getPaymentConfig: RequestHandler = async (_req, res) => {
  const { keyId, keySecret } = await getRazorpayKeys();
  const razorpayAvailable = !!(keyId && keySecret);
  const upiId = await getPlatformUpiId();
  res.json({ razorpayAvailable, upiId });
};

// ── Owner: create order for a plan ─────────────────────────────────────────
// Body: { paymentMethod: "upi" | "razorpay" }  (default: "upi")

const createPlanOrder: RequestHandler = async (req, res) => {
  const user = req.user!;
  const planId = parseInt(String(req.params.planId));
  const { paymentMethod = "upi" } = req.body as {
    paymentMethod?: "upi" | "razorpay";
  };

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, planId))
    .limit(1);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const [restaurant] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, user.restaurantId!))
    .limit(1);
  if (!restaurant) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }

  const { keyId, keySecret } = await getRazorpayKeys();

  // ── Razorpay path ────────────────────────────────────────────────────────
  // IMPORTANT: no local record is created here. Selecting a plan or opening
  // Razorpay Checkout must have zero side effects in our DB — the order only
  // exists on Razorpay's side until payment is verified (see verifyPayment).
  // This guarantees a cancelled/closed checkout leaves nothing pending in the
  // admin panel or the owner dashboard.
  if (paymentMethod === "razorpay") {
    if (!keyId || !keySecret) {
      res
        .status(400)
        .json({ error: "Razorpay is not configured on this platform. Please use UPI." });
      return;
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await razorpay.orders.create({
      amount: Math.round(plan.price * 100), // Razorpay requires paise; plan.price is stored in rupees
      currency: "INR",
      receipt: `sub_${user.restaurantId}_${planId}_${Date.now()}`,
    });

    res.json({
      transactionId: null,
      planId: plan.id,
      amount: plan.price,
      planName: plan.name,
      paymentMethod: "razorpay",
      razorpayOrderId: order.id,
      keyId,
    });
    return;
  }

  // ── UPI path (default) ───────────────────────────────────────────────────
  const [txn] = await db
    .insert(subscriptionTransactions)
    .values({
      restaurantId: user.restaurantId!,
      planId,
      amount: plan.price,
      paymentMethod: "upi",
      status: "pending",
      customersAdded: plan.customerLimit,
    })
    .returning();

  const upiId = await getPlatformUpiId();
  res.json({
    transactionId: txn.id,
    amount: plan.price,
    planName: plan.name,
    paymentMethod: "upi",
    razorpayOrderId: null,
    keyId: null,
    upiId,
  });
};

// ── Owner: verify payment and activate plan ────────────────────────────────

const verifyPayment: RequestHandler = async (req, res) => {
  const user = req.user!;
  const { transactionId, planId, razorpayPaymentId, razorpayOrderId, razorpaySignature, utrRef } =
    req.body as {
      transactionId?: number;
      planId?: number;
      razorpayPaymentId?: string;
      razorpayOrderId?: string;
      razorpaySignature?: string;
      utrRef?: string;
    };

  if (razorpayPaymentId && razorpayOrderId && razorpaySignature) {
    // ── Razorpay: verify HMAC signature — this is the ONLY point where a
    // subscription_transactions row is created for Razorpay payments. No
    // record exists before this, so a cancelled/failed checkout never shows
    // up as "pending" anywhere. ──────────────────────────────────────────
    if (!planId) {
      res.status(400).json({ error: "Missing plan reference" });
      return;
    }

    const { keySecret } = await getRazorpayKeys();
    const crypto = await import("crypto");
    const expectedSignature = crypto
      .createHmac("sha256", keySecret || "")
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      res.status(400).json({ error: "Payment verification failed" });
      return;
    }

    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    // Idempotency guard: Razorpay's handler can theoretically fire more than
    // once for the same payment — never double-activate the same payment id.
    const [existing] = await db
      .select()
      .from(subscriptionTransactions)
      .where(eq(subscriptionTransactions.razorpayPaymentId, razorpayPaymentId))
      .limit(1);
    if (existing) {
      const [already] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, user.restaurantId!))
        .limit(1);
      res.json({ pending: false, restaurant: already });
      return;
    }

    const now = new Date();
    const expiry = computeExpiry(plan.validityType, plan.validityValue);

    // DB-level idempotency backstop: a unique index on razorpay_payment_id
    // (migration 0026) guarantees only one row can ever exist per payment,
    // even if two verify requests race past the SELECT check above at the
    // same instant. If this insert loses that race, treat it exactly like
    // the "already exists" branch above instead of surfacing a 500.
    try {
      await db.insert(subscriptionTransactions).values({
        restaurantId: user.restaurantId!,
        planId: plan.id,
        amount: plan.price,
        paymentMethod: "razorpay",
        razorpayOrderId,
        razorpayPaymentId,
        status: "paid",
        customersAdded: plan.customerLimit,
      });
    } catch (err) {
      // node-postgres sets `code` directly on the thrown error, but
      // drizzle-orm wraps driver errors in a DrizzleQueryError whose
      // `cause` holds the original pg error — check both shapes.
      const pgCode =
        (err as { code?: string })?.code ??
        (err as { cause?: { code?: string } })?.cause?.code;
      if (pgCode !== "23505") throw err;

      const [already] = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, user.restaurantId!))
        .limit(1);
      res.json({ pending: false, restaurant: already });
      return;
    }

    await db
      .update(restaurants)
      .set({
        planId: plan.id,
        customerLimit: sql`customer_limit + ${plan.customerLimit}`,
        customersUsed: 0,
        subscriptionStatus: "active",
        subscriptionExpiresAt: expiry,
        subscriptionStartedAt: now,
      })
      .where(eq(restaurants.id, user.restaurantId!));

    const expiryLabel = expiry.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    await db.insert(notifications).values({
      restaurantId: user.restaurantId!,
      title: "Subscription Activated",
      message: `Your ${plan.name} plan is now active. ${plan.customerLimit.toLocaleString()} customer quota added. Valid till ${expiryLabel}.`,
      type: "success",
    });

    const [updated] = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, user.restaurantId!))
      .limit(1);

    res.json({ pending: false, restaurant: updated });
    return;
  }

  // ── UPI: requires an existing pending transaction (created eagerly in
  // createPlanOrder since manual UPI genuinely needs admin review). Store
  // the UTR for admin review — do NOT activate plan yet ──────────────────
  if (!transactionId) {
    res.status(400).json({ error: "Missing transaction reference" });
    return;
  }

  const [txn] = await db
    .select()
    .from(subscriptionTransactions)
    .where(eq(subscriptionTransactions.id, transactionId))
    .limit(1);
  if (!txn || txn.restaurantId !== user.restaurantId) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  if (!utrRef || utrRef.trim().length < 6) {
    res.status(400).json({ error: "A valid UTR / transaction reference is required." });
    return;
  }

  if (txn.status !== "pending") {
    res.status(409).json({ error: "This transaction has already been processed." });
    return;
  }

  await db
    .update(subscriptionTransactions)
    .set({ razorpayPaymentId: `UTR:${utrRef.trim().toUpperCase()}` })
    .where(eq(subscriptionTransactions.id, transactionId));

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, txn.planId))
    .limit(1);

  await db.insert(notifications).values({
    restaurantId: user.restaurantId!,
    title: "Payment Under Review",
    message: `Your UPI payment for ${plan?.name ?? "plan"} (UTR: ${utrRef.trim().toUpperCase()}) has been received and is under review. Your plan will activate within 24 hours once verified.`,
    type: "info",
  });

  res.json({ pending: true });
};

// ── Owner: get own transactions ────────────────────────────────────────────

const getMyTransactions: RequestHandler = async (req, res) => {
  const user = req.user!;
  const rows = await db
    .select({
      id: subscriptionTransactions.id,
      restaurantId: subscriptionTransactions.restaurantId,
      planId: subscriptionTransactions.planId,
      amount: subscriptionTransactions.amount,
      paymentMethod: subscriptionTransactions.paymentMethod,
      razorpayOrderId: subscriptionTransactions.razorpayOrderId,
      razorpayPaymentId: subscriptionTransactions.razorpayPaymentId,
      status: subscriptionTransactions.status,
      customersAdded: subscriptionTransactions.customersAdded,
      createdAt: subscriptionTransactions.createdAt,
      planName: subscriptionPlans.name,
    })
    .from(subscriptionTransactions)
    .leftJoin(subscriptionPlans, eq(subscriptionTransactions.planId, subscriptionPlans.id))
    .where(eq(subscriptionTransactions.restaurantId, user.restaurantId!))
    .orderBy(sql`${subscriptionTransactions.createdAt} DESC`);

  res.json(rows);
};

// ── Owner: get notifications ───────────────────────────────────────────────

const getNotifications: RequestHandler = async (req, res) => {
  const user = req.user!;
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.restaurantId, user.restaurantId!))
    .orderBy(sql`${notifications.createdAt} DESC`)
    .limit(50);
  res.json(rows);
};

const markNotificationRead: RequestHandler = async (req, res) => {
  const user = req.user!;
  const notifId = parseInt(String(req.params.id));
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      sql`${notifications.id} = ${notifId} AND ${notifications.restaurantId} = ${user.restaurantId}`
    );
  res.json({ ok: true });
};

router.get("/subscription/plans", listPlans);
router.get("/subscription/payment-config", getPaymentConfig);
router.post("/subscription/plans/:planId/order", requireOwner, createPlanOrder);
router.post("/subscription/verify", requireOwner, verifyPayment);
router.get("/subscription/transactions", requireOwner, getMyTransactions);
router.get("/subscription/notifications", requireOwner, getNotifications);
router.patch("/subscription/notifications/:id/read", requireOwner, markNotificationRead);

export default router;
