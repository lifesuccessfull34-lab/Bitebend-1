import { Router } from "express";
import { db } from "@workspace/db";
import { restaurants, menuCategories, menuItems, restaurantTables, orders, orderItems, notifications } from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { RequestHandler } from "express";
import Razorpay from "razorpay";
import { normalizeRestaurantParam, isNumericRestaurantParam } from "@workspace/url-utils";
import { emitOrderEvent } from "../lib/orderEvents";
import { extractPaymentData, matchPayment, isOcrConfigured } from "../services/ocr";

const router = Router();

/**
 * Feature flag: ENABLE_CUSTOMER_RAZORPAY
 * When false (default): Razorpay customer checkout is disabled.
 * When true: legacy per-restaurant Razorpay checkout is available.
 * Set ENABLE_CUSTOMER_RAZORPAY=true in env to re-enable for rollback.
 */
const isCustomerRazorpayEnabled = () => process.env["ENABLE_CUSTOMER_RAZORPAY"] === "true";

/**
 * Feature flag: ENABLE_PAYMENT_OCR
 * When false (default): screenshot is stored and marked awaiting_verification;
 *   restaurant staff verify manually via the dashboard.
 * When true: Google Vision OCR + OpenAI extraction pipeline runs automatically.
 * Set ENABLE_PAYMENT_OCR=true to re-enable AI verification in future.
 */
const isPaymentOcrEnabled = () => process.env["ENABLE_PAYMENT_OCR"] === "true";

/**
 * Resolve a restaurant by either numeric ID (backward-compat) or slug.
 * Numeric IDs keep all existing QR codes working indefinitely.
 * Slug-based URLs are used for all new QR codes and shared links.
 *
 * All param normalisation (URL-decode, trim, lowercase) is performed by the
 * shared @workspace/url-utils utility so frontend and backend stay in sync.
 */
async function resolveRestaurantByParam(req: import("express").Request, raw: string) {
  const param = normalizeRestaurantParam(raw);
  if (!param) return null;

  if (isNumericRestaurantParam(param)) {
    const [r] = await db
      .select()
      .from(restaurants)
      .where(and(eq(restaurants.id, parseInt(param, 10)), eq(restaurants.isActive, true)))
      .limit(1);
    if (!r) {
      req.log.warn({ param, raw }, "Restaurant lookup — numeric ID not found");
    }
    return r ?? null;
  }

  // Slug lookup — lower(slug) = already-lowercased param
  const [r] = await db
    .select()
    .from(restaurants)
    .where(and(sql`lower(${restaurants.slug}) = ${param}`, eq(restaurants.isActive, true)))
    .limit(1);
  if (!r) {
    req.log.warn({ param, raw, ua: req.headers["user-agent"] }, "Restaurant lookup — slug not found");
  }
  return r ?? null;
}

// GET /menu/:restaurantId — public menu for customers (accepts numeric ID or slug)
const getPublicMenu: RequestHandler = async (req, res) => {
  const restaurant = await resolveRestaurantByParam(req, String(req.params.restaurantId));

  if (!restaurant) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }

  const restaurantId = restaurant.id;

  const categories = await db
    .select()
    .from(menuCategories)
    .where(and(eq(menuCategories.restaurantId, restaurantId), eq(menuCategories.isActive, true)))
    .orderBy(menuCategories.displayOrder, menuCategories.name);

  const items = await db
    .select()
    .from(menuItems)
    .where(and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.isAvailable, true)))
    .orderBy(menuItems.displayOrder, menuItems.name);

  const tables = await db
    .select({
      id: restaurantTables.id,
      tableNumber: restaurantTables.tableNumber,
      area: restaurantTables.area,
    })
    .from(restaurantTables)
    .where(eq(restaurantTables.restaurantId, restaurantId))
    .orderBy(restaurantTables.area, restaurantTables.tableNumber);

  const categoriesWithItems = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    displayOrder: cat.displayOrder,
    items: items.filter((item) => item.categoryId === cat.id),
  }));

  // Never expose secret key, raw QR image, or raw QR payload to the customer client.
  // extractedUpiId is the UPI address verified from the merchant QR at setup — safe to expose.
  const {
    razorpayKeySecret: _secret,
    qrImageData: _qrImg,
    qrDecodedPayload: _qrPayload,
    qrExtractedUpiId: _rawUpi,
    qrMerchantName: _rawMerchant,
    ...safeRestaurant
  } = restaurant;
  const hasPaymentQr = restaurant.paymentQrEnabled && !!restaurant.qrExtractedUpiId;
  if (hasPaymentQr) {
    req.log.info({ restaurantId }, "[QR PAYMENT] menu loaded with QR payment enabled");
  }
  res.json({
    restaurant: {
      ...safeRestaurant,
      hasPaymentQr,
      extractedUpiId: hasPaymentQr ? (restaurant.qrExtractedUpiId ?? null) : null,
      extractedMerchantName: restaurant.qrMerchantName ?? null,
    },
    categories: categoriesWithItems,
    tables,
  });
};

// ─── Phone normalization ───────────────────────────────────────────────────────
// Strips all non-digits, removes leading zeros, and enforces the canonical Indian
// WhatsApp format "91XXXXXXXXXX". Returns null for any unrecognisable number.
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return null;
}

// GET /api/menu/customer/orders — customer order history by phone number
const getCustomerOrders: RequestHandler = async (req, res) => {
  const phone = String(req.query.phone ?? "");
  if (!phone) {
    res.status(400).json({ error: "phone query parameter is required" });
    return;
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    res.status(400).json({ error: "Invalid phone number" });
    return;
  }

  const rows = await db
    .select({
      id: orders.id,
      restaurantId: orders.restaurantId,
      restaurantName: restaurants.name,
      customerName: orders.customerName,
      tableNumber: orders.tableNumber,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      paymentVerificationStatus: orders.paymentVerificationStatus,
      paymentMethod: orders.paymentMethod,
      subtotal: orders.subtotal,
      tax: orders.tax,
      total: orders.total,
      createdAt: orders.createdAt,
      // Restaurant UPI fields — needed for payment QR recovery in order history
      restaurantUpiId: restaurants.upiId,
      restaurantUpiName: restaurants.upiName,
      restaurantPersonalUpiEnabled: restaurants.personalUpiEnabled,
      restaurantHasPaymentQr: restaurants.paymentQrEnabled,
      restaurantExtractedUpiId: restaurants.qrExtractedUpiId,
      restaurantExtractedMerchantName: restaurants.qrMerchantName,
      restaurantSeatingLabel: restaurants.seatingLabel,
    })
    .from(orders)
    .innerJoin(restaurants, eq(orders.restaurantId, restaurants.id))
    .where(eq(orders.customerPhone, normalizedPhone))
    .orderBy(desc(orders.createdAt))
    .limit(50);

  if (rows.length === 0) {
    res.json([]);
    return;
  }

  const ids = rows.map((r) => r.id);
  const allItems = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, ids));

  const itemsByOrder = new Map<number, typeof allItems>();
  for (const item of allItems) {
    const arr = itemsByOrder.get(item.orderId) ?? [];
    arr.push(item);
    itemsByOrder.set(item.orderId, arr);
  }

  res.json(rows.map((r) => ({ ...r, items: itemsByOrder.get(r.id) ?? [] })));
};

// POST /menu/:restaurantId/orders — customer places order (accepts numeric ID or slug)
const placeOrder: RequestHandler = async (req, res) => {
  const restaurant = await resolveRestaurantByParam(req, String(req.params.restaurantId));
  if (!restaurant) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  const restaurantId = restaurant.id;

  const { tableId, tableNumber, customerName, customerPhone, notes, items, paymentMethod } = req.body as {
    tableId?: number;
    tableNumber?: string;
    customerName: string;
    customerPhone: string;
    notes?: string;
    paymentMethod?: string;
    items: { menuItemId: number; quantity: number; notes?: string }[];
  };

  if (!customerName || !customerPhone || !items || items.length === 0) {
    res.status(400).json({ error: "customerName, customerPhone and items are required" });
    return;
  }

  // Normalize and validate phone before touching the DB — only canonical format stored
  const normalizedPhone = normalizePhone(customerPhone);
  if (!normalizedPhone) {
    res.status(400).json({ error: "Invalid customer phone number. Please enter a valid 10-digit Indian mobile number." });
    return;
  }
  req.log.info({ orderId: "new", customerPhone: normalizedPhone }, "[Order] Storing normalized phone");

  // ── Offering mode enforcement ───────────────────────────────────────────────
  // seatingLabel === null means the restaurant is "Take Away Only".
  // Reject any order that tries to link to a table (which would indicate dine-in).
  if (restaurant.seatingLabel === null && (tableId || (tableNumber && tableNumber.trim()))) {
    res.status(400).json({ error: "This restaurant only accepts Take Away orders." });
    return;
  }

  // ── Payment method validation ───────────────────────────────────────────────
  if (paymentMethod === "upi" && !(restaurant.paymentQrEnabled && restaurant.qrExtractedUpiId) && (!restaurant.upiId || !restaurant.personalUpiEnabled)) {
    res.status(400).json({ error: "UPI payment is not configured for this restaurant." });
    return;
  }

  // ── Subscription / quota checks ────────────────────────────────────────────
  if (!restaurant.isActive || restaurant.subscriptionStatus === "suspended") {
    res.status(403).json({ error: "This restaurant is not currently accepting orders." });
    return;
  }

  const now = new Date();

  // Check expiry (only if a plan has been purchased)
  if (restaurant.customerLimit > 0 && restaurant.subscriptionExpiresAt && restaurant.subscriptionExpiresAt < now) {
    await db.update(restaurants)
      .set({ subscriptionStatus: "exhausted" })
      .where(eq(restaurants.id, restaurantId));
    await db.insert(notifications).values({
      restaurantId,
      title: "Subscription Expired",
      message: "Your 30-day subscription period has ended. Please purchase a new plan to continue accepting orders.",
      type: "warning",
    });
    res.status(403).json({ error: "This restaurant's subscription has expired. Please contact the restaurant." });
    return;
  }

  // Check quota exhausted
  if (restaurant.subscriptionStatus === "exhausted" ||
    (restaurant.customerLimit > 0 && restaurant.customersUsed >= restaurant.customerLimit)) {
    if (restaurant.subscriptionStatus !== "exhausted") {
      await db.update(restaurants)
        .set({ subscriptionStatus: "exhausted" })
        .where(eq(restaurants.id, restaurantId));
    }
    res.status(403).json({ error: "This restaurant's order quota is exhausted. Please contact the restaurant." });
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  const itemIds = items.map((i) => i.menuItemId);
  const dbItems = await db.select().from(menuItems).where(inArray(menuItems.id, itemIds));
  const itemMap = new Map(dbItems.map((i) => [i.id, i]));

  for (const item of items) {
    if (!itemMap.has(item.menuItemId)) {
      res.status(400).json({ error: `Menu item ${item.menuItemId} not found` });
      return;
    }
  }

  let subtotal = 0;
  for (const item of items) {
    const dbItem = itemMap.get(item.menuItemId)!;
    subtotal += dbItem.price * item.quantity;
  }

  const tax = Math.round((subtotal * restaurant.taxPercent) / 100);
  const total = subtotal + tax;

  // QR (upi) orders start as awaiting_verification — customer must scan and pay.
  // Cash orders start as unpaid — staff collects at table.
  const initialPaymentStatus = paymentMethod === "upi" ? "awaiting_verification" : "unpaid";

  const [order] = await db.insert(orders).values({
    restaurantId,
    tableId: tableId ?? null,
    tableNumber: tableNumber ?? null,
    customerName,
    customerPhone: normalizedPhone,
    notes: notes ?? null,
    subtotal,
    tax,
    total,
    status: "ordered",
    paymentStatus: initialPaymentStatus,
    paymentMethod: paymentMethod ?? null,
    updatedAt: new Date(),
  }).returning();

  const orderItemValues = items.map((item) => {
    const dbItem = itemMap.get(item.menuItemId)!;
    return {
      orderId: order.id,
      menuItemId: item.menuItemId,
      name: dbItem.name,
      quantity: item.quantity,
      unitPrice: dbItem.price,
      isVeg: dbItem.isVeg,
      notes: item.notes ?? null,
    };
  });

  const createdItems = await db.insert(orderItems).values(orderItemValues).returning();

  // Mark table as occupied if tableId provided
  if (tableId) {
    await db.update(restaurantTables).set({ isOccupied: true }).where(eq(restaurantTables.id, tableId));
  }

  // ── Increment quota usage ─────────────────────────────────────────────────
  if (restaurant.customerLimit > 0) {
    const newUsed = (restaurant.customersUsed ?? 0) + 1;
    const nowExhausted = newUsed >= restaurant.customerLimit;
    await db.update(restaurants)
      .set({
        customersUsed: sql`customers_used + 1`,
        ...(nowExhausted ? { subscriptionStatus: "exhausted" } : {}),
      })
      .where(eq(restaurants.id, restaurantId));

    if (nowExhausted) {
      await db.insert(notifications).values({
        restaurantId,
        title: "Quota Exhausted",
        message: `Your customer quota of ${restaurant.customerLimit.toLocaleString()} has been fully used. Purchase a new plan to continue accepting orders.`,
        type: "warning",
      });
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  emitOrderEvent(restaurantId, {
    id: order.id,
    customerName: order.customerName,
    tableNumber: order.tableNumber,
    total: order.total,
    itemCount: createdItems.length,
  });

  res.status(201).json({ ...order, items: createdItems });
};

// GET /menu/:restaurantId/orders/:orderId — customer checks order status
const getOrderStatus: RequestHandler = async (req, res) => {
  const restaurant = await resolveRestaurantByParam(req, String(req.params.restaurantId));
  if (!restaurant) { res.status(404).json({ error: "Restaurant not found" }); return; }
  const restaurantId = restaurant.id;

  const orderId = parseInt(String(req.params.orderId));
  if (isNaN(orderId)) {
    res.status(400).json({ error: "Invalid order ID" });
    return;
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  res.json({ ...order, items });
};

// POST /menu/:restaurantId/razorpay-order — create Razorpay order (accepts numeric ID or slug)
// @deprecated — disabled by default. Set ENABLE_CUSTOMER_RAZORPAY=true to re-enable for rollback.
const createRazorpayOrder: RequestHandler = async (req, res) => {
  if (!isCustomerRazorpayEnabled()) {
    res.status(404).json({ error: "Razorpay customer checkout is not enabled on this platform." });
    return;
  }
  const restaurant = await resolveRestaurantByParam(req, String(req.params.restaurantId));
  if (!restaurant) { res.status(404).json({ error: "Restaurant not found" }); return; }
  const restaurantId = restaurant.id;

  const { amount, customerName, customerPhone, orderId } = req.body as {
    amount: number;
    customerName: string;
    customerPhone: string;
    orderId?: number;
  };
  if (!amount || !customerName || !customerPhone) {
    res.status(400).json({ error: "amount, customerName and customerPhone are required" });
    return;
  }
  if (!restaurant.razorpayKeyId || !restaurant.razorpayKeySecret) {
    res.status(400).json({ error: "Razorpay not configured for this restaurant" });
    return;
  }

  const rzp = new Razorpay({ key_id: restaurant.razorpayKeyId, key_secret: restaurant.razorpayKeySecret });

  const rzpOrder = await rzp.orders.create({
    amount: Math.round(amount * 100), // paise — must be integer
    currency: "INR",
    receipt: `rcpt_${restaurantId}_${orderId ?? Date.now()}`,
    notes: { customerName, customerPhone, platformOrderId: String(orderId ?? "") },
  });

  // Link the Razorpay order ID to the platform order so the webhook can find it
  if (orderId) {
    await db
      .update(orders)
      .set({ razorpayOrderId: rzpOrder.id, paymentMethod: "razorpay", updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)));

    req.log.info({ orderId, razorpayOrderId: rzpOrder.id }, "[Razorpay] Order linked to platform order");
  }

  res.json({
    razorpayOrderId: rzpOrder.id,
    keyId: restaurant.razorpayKeyId,
    amount: rzpOrder.amount,
    currency: rzpOrder.currency,
    restaurantName: restaurant.name,
  });
};

// PATCH /menu/:restaurantId/orders/:orderId/confirm-payment
// Customer taps "I have completed payment" — moves order from pending_payment → awaiting_confirmation
// Accepts optional { utrNumber } in body to record the UPI transaction reference
const confirmPayment: RequestHandler = async (req, res) => {
  const restaurant = await resolveRestaurantByParam(req, String(req.params.restaurantId));
  if (!restaurant) { res.status(404).json({ error: "Restaurant not found" }); return; }
  const restaurantId = restaurant.id;

  const orderId = parseInt(String(req.params.orderId));
  if (isNaN(orderId)) {
    res.status(400).json({ error: "Invalid order ID" });
    return;
  }

  const { utrNumber } = req.body as { utrNumber?: string };

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status !== "pending_payment") {
    res.status(400).json({ error: "Order is not awaiting payment" });
    return;
  }

  const utrSuffix = utrNumber?.trim() ? ` · UTR: ${utrNumber.trim()}` : "";
  const updatedNotes = order.notes ? `${order.notes}${utrSuffix}` : utrSuffix || null;

  const [updated] = await db
    .update(orders)
    .set({ status: "awaiting_confirmation", notes: updatedNotes, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  res.json(updated);
};

// GET /menu/:restaurantId/payment-qr — serve the uploaded QR image (public, no auth)
const getPaymentQr: RequestHandler = async (req, res) => {
  const restaurant = await resolveRestaurantByParam(req, String(req.params.restaurantId));
  if (!restaurant) { res.status(404).json({ error: "Restaurant not found" }); return; }
  if (!restaurant.qrImageData) { res.status(404).json({ error: "No payment QR configured" }); return; }
  res.json({ qrImageData: restaurant.qrImageData, qrDecodedPayload: restaurant.qrDecodedPayload ?? null });
};

// ─── POST /menu/:restaurantId/orders/:orderId/payment-proof ──────────────────
// Public endpoint: customer uploads payment screenshot for AI verification.
const submitPaymentProof: RequestHandler = async (req, res) => {
  const restaurantId = parseInt(String(req.params.restaurantId));
  const orderId = parseInt(String(req.params.orderId));

  const { screenshotBase64, mimeType = "image/jpeg" } = req.body as {
    screenshotBase64?: string;
    mimeType?: string;
  };

  if (!screenshotBase64) {
    res.status(400).json({ error: "screenshotBase64 is required" });
    return;
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.paymentStatus === "paid") {
    res.json({ alreadyPaid: true, ocrConfigured: true, matched: true, confidence: 100 });
    return;
  }

  // Guard: prevent accidental screenshot replacement.
  // If screenshot already exists and forceReplace is not explicitly set, return 409.
  const { forceReplace } = req.body as { screenshotBase64?: string; mimeType?: string; forceReplace?: boolean };
  if (order.paymentScreenshotUrl && !forceReplace) {
    res.status(409).json({ alreadyHasScreenshot: true });
    return;
  }

  // ENABLE_PAYMENT_OCR=false (default): store screenshot, set awaiting_verification,
  // let restaurant staff verify manually in the dashboard.
  if (!isPaymentOcrEnabled()) {
    await db
      .update(orders)
      .set({
        paymentScreenshotUrl: screenshotBase64,
        paymentVerificationStatus: "manual_review",
        paymentStatus: "awaiting_verification",
        verificationMethod: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
    req.log.info(
      { event: "screenshot_uploaded", orderId, restaurantId, forceReplace: !!forceReplace },
      "screenshot_uploaded: payment screenshot stored for staff verification",
    );
    res.json({ ocrConfigured: false, matched: false, confidence: 0 });
    return;
  }

  // ENABLE_PAYMENT_OCR=true path: run OCR pipeline (Google Vision + OpenAI).
  if (!isOcrConfigured()) {
    await db
      .update(orders)
      .set({
        paymentScreenshotUrl: screenshotBase64,
        paymentVerificationStatus: "manual_review",
        paymentStatus: "awaiting_verification",
        verificationMethod: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
    req.log.info({ orderId }, "Payment screenshot stored; OCR API keys not configured");
    res.json({ ocrConfigured: false, matched: false, confidence: 0 });
    return;
  }

  const ocrResult = await extractPaymentData(screenshotBase64, mimeType);
  const match = matchPayment(ocrResult, order.total);
  const newPaymentStatus = match.matched ? "paid" : "manual_review";
  const newVerificationStatus = match.matched ? "ai_verified" : "manual_review";
  const now = new Date();

  await db
    .update(orders)
    .set({
      paymentScreenshotUrl: screenshotBase64,
      paymentOcrData: JSON.stringify(ocrResult),
      paymentVerificationStatus: newVerificationStatus,
      paymentStatus: newPaymentStatus,
      ...(match.matched ? { verificationMethod: "ocr_ai", verifiedAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(orders.id, orderId));

  req.log.info(
    { orderId, matched: match.matched, confidence: ocrResult.confidence, utr: ocrResult.utr },
    "Payment proof processed via OCR",
  );

  res.json({
    ocrConfigured: true,
    matched: match.matched,
    paymentStatus: newPaymentStatus,
    confidence: ocrResult.confidence,
    utr: ocrResult.utr,
    amount: ocrResult.amount,
    reason: match.reason,
  });
};

// POST /menu/:restaurantId/orders/:orderId/verify-razorpay
// @deprecated — disabled by default. Set ENABLE_CUSTOMER_RAZORPAY=true to re-enable for rollback.
const verifyRazorpayPayment: RequestHandler = async (req, res) => {
  if (!isCustomerRazorpayEnabled()) {
    res.status(404).json({ error: "Razorpay customer checkout is not enabled on this platform." });
    return;
  }
  const restaurant = await resolveRestaurantByParam(req, String(req.params.restaurantId));
  if (!restaurant) { res.status(404).json({ error: "Restaurant not found" }); return; }
  if (!restaurant.razorpayKeySecret) { res.status(400).json({ error: "Razorpay not configured" }); return; }

  const orderId = parseInt(String(req.params.orderId));
  if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order ID" }); return; }

  const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body as {
    razorpayPaymentId: string;
    razorpayOrderId: string;
    razorpaySignature: string;
  };
  if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
    res.status(400).json({ error: "razorpayPaymentId, razorpayOrderId and razorpaySignature are required" });
    return;
  }

  // Verify HMAC-SHA256: body = razorpay_order_id + "|" + razorpay_payment_id
  const { createHmac } = await import("crypto");
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = createHmac("sha256", restaurant.razorpayKeySecret)
    .update(body)
    .digest("hex");

  if (expected !== razorpaySignature) {
    req.log.warn({ orderId, razorpayOrderId }, "[Razorpay] Signature mismatch — rejecting client verification");
    res.status(400).json({ error: "Payment signature invalid" });
    return;
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurant.id)))
    .limit(1);

  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  if (order.paymentStatus === "paid") {
    res.json({ success: true, alreadyPaid: true });
    return;
  }

  const [updated] = await db
    .update(orders)
    .set({
      paymentStatus: "paid",
      razorpayPaymentId,
      paidAt: new Date(),
      status: order.status === "pending_payment" ? "awaiting_confirmation" : order.status,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))
    .returning();

  req.log.info({ orderId, razorpayPaymentId }, "[Razorpay] Client verification successful — order marked paid");

  // Emit SSE event so the dashboard updates in real time
  const { emitOrderEvent } = await import("../lib/orderEvents");
  emitOrderEvent(restaurant.id, {
    id: updated.id,
    customerName: updated.customerName,
    tableNumber: updated.tableNumber,
    total: updated.total,
    itemCount: 0, // item count not tracked on orders table directly
  });

  res.json({ success: true });
};

router.get("/menu/:restaurantId", getPublicMenu);
router.get("/menu/:restaurantId/payment-qr", getPaymentQr);
router.post("/menu/:restaurantId/razorpay-order", createRazorpayOrder);
router.get("/menu/customer/orders", getCustomerOrders);
router.post("/menu/:restaurantId/orders", placeOrder);
router.get("/menu/:restaurantId/orders/:orderId", getOrderStatus);
router.patch("/menu/:restaurantId/orders/:orderId/confirm-payment", confirmPayment);
router.post("/menu/:restaurantId/orders/:orderId/payment-proof", submitPaymentProof);
router.post("/menu/:restaurantId/orders/:orderId/verify-razorpay", verifyRazorpayPayment);

/**
 * POST /api/menu/client-error
 *
 * Lightweight telemetry endpoint for client-side React crashes captured by
 * the ErrorBoundary in the menu app. No authentication required; no DB write.
 * The payload is logged via pino so it appears in server logs alongside
 * normal request logs.
 *
 * Payload (application/json via navigator.sendBeacon):
 *   { message, stack, componentStack, url, ua, ts }
 *
 * Responds 204 — the client never waits for the response.
 */
router.post("/menu/client-error", ((req, res) => {
  const body = req.body as Record<string, unknown> | null;
  req.log.warn(
    {
      clientError: {
        message: body?.message ?? "(no message)",
        stack: typeof body?.stack === "string" ? body.stack.slice(0, 2000) : undefined,
        componentStack: typeof body?.componentStack === "string"
          ? body.componentStack.slice(0, 1000)
          : undefined,
        url: body?.url,
        ua: body?.ua,
        ts: body?.ts,
      },
    },
    "Client-side React crash reported by ErrorBoundary",
  );
  res.status(204).end();
}) as RequestHandler);

export default router;
