import { Router } from "express";
import { db } from "@workspace/db";
import { restaurants, menuCategories, menuItems, restaurantTables, orders, orderItems, notifications } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { RequestHandler } from "express";
import Razorpay from "razorpay";
import { normalizeRestaurantParam, isNumericRestaurantParam } from "@workspace/url-utils";
import { emitOrderEvent } from "../lib/orderEvents";

const router = Router();

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

  // Never expose secret key or raw QR image data to the customer client.
  // hasPaymentQr is a boolean flag; the actual image is fetched lazily via /payment-qr.
  const { razorpayKeySecret: _secret, qrImageData: _qrImg, qrDecodedPayload: _qrPayload, ...safeRestaurant } = restaurant;
  res.json({
    restaurant: { ...safeRestaurant, hasPaymentQr: restaurant.paymentQrEnabled && !!restaurant.qrImageData },
    categories: categoriesWithItems,
    tables,
  });
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

  // ── Offering mode enforcement ───────────────────────────────────────────────
  // seatingLabel === null means the restaurant is "Take Away Only".
  // Reject any order that tries to link to a table (which would indicate dine-in).
  if (restaurant.seatingLabel === null && (tableId || (tableNumber && tableNumber.trim()))) {
    res.status(400).json({ error: "This restaurant only accepts Take Away orders." });
    return;
  }

  // ── Payment method validation ───────────────────────────────────────────────
  if (paymentMethod === "upi" && !(restaurant.paymentQrEnabled && restaurant.qrImageData) && (!restaurant.upiId || !restaurant.personalUpiEnabled)) {
    res.status(400).json({ error: "UPI payment is not configured for this restaurant." });
    return;
  }
  if (paymentMethod === "razorpay" && !restaurant.razorpayKeyId) {
    res.status(400).json({ error: "Online payment is not configured for this restaurant." });
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

  const [order] = await db.insert(orders).values({
    restaurantId,
    tableId: tableId ?? null,
    tableNumber: tableNumber ?? null,
    customerName,
    customerPhone,
    notes: notes ?? null,
    subtotal,
    tax,
    total,
    status: "ordered",
    paymentStatus: "unpaid",
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
const createRazorpayOrder: RequestHandler = async (req, res) => {
  const restaurant = await resolveRestaurantByParam(req, String(req.params.restaurantId));
  if (!restaurant) { res.status(404).json({ error: "Restaurant not found" }); return; }
  const restaurantId = restaurant.id;

  const { amount, customerName, customerPhone } = req.body as {
    amount: number;
    customerName: string;
    customerPhone: string;
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

  const order = await rzp.orders.create({
    amount: amount * 100, // paise
    currency: "INR",
    receipt: `rcpt_${restaurantId}_${Date.now()}`,
    notes: { customerName, customerPhone },
  });

  res.json({
    razorpayOrderId: order.id,
    keyId: restaurant.razorpayKeyId,
    amount: order.amount,
    currency: order.currency,
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

router.get("/menu/:restaurantId", getPublicMenu);
router.get("/menu/:restaurantId/payment-qr", getPaymentQr);
router.post("/menu/:restaurantId/razorpay-order", createRazorpayOrder);
router.post("/menu/:restaurantId/orders", placeOrder);
router.get("/menu/:restaurantId/orders/:orderId", getOrderStatus);
router.patch("/menu/:restaurantId/orders/:orderId/confirm-payment", confirmPayment);

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
