import { Router } from "express";
import { db } from "@workspace/db";
import {
  restaurants,
  menuCategories,
  menuItems,
  restaurantTables,
  orders,
  orderItems,
  subscriptionTransactions,
  users,
  imageBlobs,
  tableSessions,
  sessionBills,
} from "@workspace/db";
import { eq, and, gte, lte, sql, desc, inArray, ne } from "drizzle-orm";
import { requireOwner } from "../middlewares/auth";
import { logger } from "../lib/logger";
import QRCode from "qrcode";
import bcrypt from "bcrypt";
import type { RequestHandler, Request, Response } from "express";
import multer from "multer";
import { extname } from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { addConnection, removeConnection } from "../lib/orderEvents";
import { extractPaymentData, matchPayment, isOcrConfigured } from "../services/ocr";
import {
  storeBill,
  getBillByToken,
  getBillByShortId,
  sendPaymentBill,
  BillRateLimitError,
  BillCooldownError,
  type BillResult,
} from "../lib/billService";

const BRIDGE_URL = process.env.BRIDGE_URL ?? "http://localhost:3001";
const BRIDGE_API_SECRET = process.env.BRIDGE_API_SECRET ?? "";

async function tryBridgeSend(
  restaurantId: number,
  phone: string,
  message: string,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (BRIDGE_API_SECRET) headers["x-bridge-secret"] = BRIDGE_API_SECRET;

    const statusRes = await fetch(`${BRIDGE_URL}/api/whatsapp/status/${restaurantId}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(3000),
    });
    const statusData = (await statusRes.json()) as { status?: string };
    logger.info({ restaurantId, bridgeStatus: statusData.status }, "[tryBridgeSend] bridge status response");

    if (statusData.status !== "connected") {
      logger.info({ restaurantId, bridgeStatus: statusData.status }, "[tryBridgeSend] not connected — falling back to deeplink");
      return false;
    }

    const sendRes = await fetch(`${BRIDGE_URL}/api/send-message`, {
      method: "POST",
      headers,
      body: JSON.stringify({ restaurantId, phone, message }),
      signal: AbortSignal.timeout(10000),
    });
    const sendData = (await sendRes.json()) as { success?: boolean; error?: string };
    logger.info({ restaurantId, phone, sendSuccess: sendData.success, sendError: sendData.error }, "[tryBridgeSend] send-message response");

    return sendData.success === true;
  } catch (err) {
    logger.warn({ restaurantId, error: (err as Error).message }, "[tryBridgeSend] exception — falling back to deeplink");
    return false;
  }
}

const router = Router();

function getQrUrl(restaurantSlug: string, tableId: number): string {
  // SITE_URL takes top priority — set this in production to your custom domain
  // (e.g. https://bitebend.in). Falls back to REPLIT_DOMAINS (the .replit.app
  // hostname), then the dev preview domain. Never falls back to localhost.
  const base =
    process.env.SITE_URL?.trim() ||
    (() => {
      const d = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
      return d ? `https://${d}` : null;
    })() ||
    (process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "http://localhost:80");
  return `${base}/menu/${restaurantSlug}/table/${tableId}`;
}

/** Look up the restaurant slug; falls back to numeric ID string so old behaviour is safe.
 *  Always returns lowercase to ensure QR codes embed a canonical slug. */
async function getRestaurantSlug(restaurantId: number): Promise<string> {
  const [r] = await db
    .select({ slug: restaurants.slug })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  return (r?.slug ?? String(restaurantId)).toLowerCase();
}

// ─── Restaurant ───────────────────────────────────────────────────────────────

const getRestaurant: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) {
    res.status(404).json({ error: "No restaurant found for this account" });
    return;
  }
  const [restaurant] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, user.restaurantId))
    .limit(1);
  if (!restaurant) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  res.json(restaurant);
};

const updateRestaurant: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) {
    res.status(404).json({ error: "No restaurant found for this account" });
    return;
  }

  const {
    name, description, cuisineType, logoUrl, address, city, phone, email,
    upiId, upiName, personalUpiEnabled, whatsappNumber, taxPercent, seatingLabel,
    upiVerified, verifiedAt,
    qrImageData, qrDecodedPayload, qrMerchantName, qrExtractedUpiId, paymentQrEnabled,
  } = req.body as Record<string, unknown>;

  req.log.info(
    {
      "[PROFILE SAVE RECEIVED]": true,
      "[QR IMAGE LENGTH]": typeof qrImageData === "string" ? qrImageData.length : null,
      "[PAYMENT QR ENABLED]": paymentQrEnabled ?? null,
    },
    "updateRestaurant called",
  );

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (cuisineType !== undefined) updates.cuisineType = cuisineType;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl;
  if (address !== undefined) updates.address = address;
  if (city !== undefined) updates.city = city;
  if (phone !== undefined) updates.phone = phone;
  // ── Email sync guard ──────────────────────────────────────────────────────
  // users.email is the canonical credential source of truth. restaurants.email
  // must always mirror it. Log a warning if the submitted value diverges, then
  // override with the canonical value unconditionally to self-heal any drift.
  if (email !== undefined && email !== req.user!.email) {
    req.log.warn(
      { submitted: email, canonical: req.user!.email },
      "[EMAIL_SYNC] Restaurant profile email submission diverges from users.email — overriding with canonical",
    );
  }
  updates.email = req.user!.email; // unconditional — always mirrors users.email
  if (upiId !== undefined) updates.upiId = upiId;
  if (upiName !== undefined) updates.upiName = upiName;
  if (personalUpiEnabled !== undefined) updates.personalUpiEnabled = personalUpiEnabled;
  if (upiVerified !== undefined) updates.upiVerified = upiVerified;
  if (verifiedAt !== undefined) updates.verifiedAt = verifiedAt ? new Date(verifiedAt as string) : null;
  if (qrImageData !== undefined) updates.qrImageData = qrImageData;
  if (qrDecodedPayload !== undefined) updates.qrDecodedPayload = qrDecodedPayload;
  if (qrMerchantName !== undefined) updates.qrMerchantName = qrMerchantName;
  if (qrExtractedUpiId !== undefined) updates.qrExtractedUpiId = qrExtractedUpiId;
  if (paymentQrEnabled !== undefined) updates.paymentQrEnabled = paymentQrEnabled;
  if (qrExtractedUpiId) {
    req.log.info(
      { "[EXTRACTED PA]": qrExtractedUpiId, "[EXTRACTED PN]": qrMerchantName ?? null },
      "QR payment UPI extracted and saved",
    );
  }
  if (whatsappNumber !== undefined) updates.whatsappNumber = whatsappNumber;
  if (taxPercent !== undefined) updates.taxPercent = taxPercent;
  if (seatingLabel !== undefined) updates.seatingLabel = seatingLabel;
  try {
    const [updated] = await db
      .update(restaurants)
      .set(updates)
      .where(eq(restaurants.id, user.restaurantId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Restaurant not found" });
      return;
    }
    req.log.info({ "[DB UPDATE SUCCESS]": true, restaurantId: updated.id }, "restaurant saved");
    res.json(updated);
  } catch (err) {
    req.log.error(err, "updateRestaurant failed");
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to save restaurant: ${message}` });
  }
};

// ─── Categories ───────────────────────────────────────────────────────────────

const listCategories: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.json([]); return; }
  const cats = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.restaurantId, user.restaurantId))
    .orderBy(menuCategories.displayOrder, menuCategories.name);
  res.json(cats);
};

const createCategory: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.status(400).json({ error: "No restaurant" }); return; }
  const { name, displayOrder } = req.body as { name: string; displayOrder?: number };
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [cat] = await db.insert(menuCategories).values({
    restaurantId: user.restaurantId,
    name,
    displayOrder: displayOrder ?? 0,
  }).returning();
  res.status(201).json(cat);
};

const updateCategory: RequestHandler = async (req, res) => {
  const user = req.user!;
  const categoryId = parseInt(String(req.params.categoryId));
  const updates = req.body as { name?: string; displayOrder?: number; isActive?: boolean };
  const [cat] = await db
    .update(menuCategories)
    .set(updates)
    .where(and(eq(menuCategories.id, categoryId), eq(menuCategories.restaurantId, user.restaurantId!)))
    .returning();
  if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
  res.json(cat);
};

const deleteCategory: RequestHandler = async (req, res) => {
  const user = req.user!;
  const categoryId = parseInt(String(req.params.categoryId));
  await db
    .delete(menuCategories)
    .where(and(eq(menuCategories.id, categoryId), eq(menuCategories.restaurantId, user.restaurantId!)));
  res.status(204).send();
};

// ─── Menu Items ───────────────────────────────────────────────────────────────

const listMenuItems: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.json([]); return; }
  const items = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.restaurantId, user.restaurantId))
    .orderBy(menuItems.categoryId, menuItems.displayOrder, menuItems.name);
  res.json(items);
};

const createMenuItem: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.status(400).json({ error: "No restaurant" }); return; }
  const { categoryId, name, description, price, imageUrl, isVeg, displayOrder } = req.body as {
    categoryId: number;
    name: string;
    description?: string | null;
    price: number;
    imageUrl?: string | null;
    isVeg?: boolean;
    displayOrder?: number;
  };
  if (!categoryId || !name || price === undefined) {
    res.status(400).json({ error: "categoryId, name, price required" });
    return;
  }
  const [item] = await db.insert(menuItems).values({
    restaurantId: user.restaurantId,
    categoryId,
    name,
    description: description ?? null,
    price,
    imageUrl: imageUrl ?? null,
    isVeg: isVeg ?? true,
    displayOrder: displayOrder ?? 0,
  }).returning();
  res.status(201).json(item);
};

const updateMenuItem: RequestHandler = async (req, res) => {
  const user = req.user!;
  const itemId = parseInt(String(req.params.itemId));
  const updates = req.body as Partial<{
    categoryId: number;
    name: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
    isAvailable: boolean;
    isVeg: boolean;
    displayOrder: number;
  }>;
  const [item] = await db
    .update(menuItems)
    .set(updates)
    .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, user.restaurantId!)))
    .returning();
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }
  res.json(item);
};

const deleteMenuItem: RequestHandler = async (req, res) => {
  const user = req.user!;
  const itemId = parseInt(String(req.params.itemId));

  // Fetch the item first so we can clean up its image blob afterwards
  const [item] = await db
    .select({ imageUrl: menuItems.imageUrl })
    .from(menuItems)
    .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, user.restaurantId!)))
    .limit(1);

  await db
    .delete(menuItems)
    .where(and(eq(menuItems.id, itemId), eq(menuItems.restaurantId, user.restaurantId!)));

  // Clean up orphaned image blob (best-effort; non-blocking)
  if (item?.imageUrl) {
    const match = /^\/api\/images\/([0-9a-f-]+)$/i.exec(item.imageUrl);
    if (match) {
      db.delete(imageBlobs).where(eq(imageBlobs.id, match[1])).catch(() => undefined);
    }
  }

  res.status(204).send();
};

// ─── Tables ───────────────────────────────────────────────────────────────────

const listTables: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.json([]); return; }
  const tbls = await db
    .select()
    .from(restaurantTables)
    .where(eq(restaurantTables.restaurantId, user.restaurantId))
    .orderBy(restaurantTables.tableNumber);
  res.json(tbls);
};

const createTable: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.status(400).json({ error: "No restaurant" }); return; }
  const { tableNumber, area } = req.body as { tableNumber: string; area?: string };
  if (!tableNumber) { res.status(400).json({ error: "tableNumber required" }); return; }

  const slug = await getRestaurantSlug(user.restaurantId);

  const [tbl] = await db.insert(restaurantTables).values({
    restaurantId: user.restaurantId,
    tableNumber,
    area: area?.trim() || null,
  }).returning();

  const qrUrl = getQrUrl(slug, tbl.id);
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 600, margin: 4, errorCorrectionLevel: "H" });

  const [updated] = await db.update(restaurantTables).set({ qrCodeUrl: qrDataUrl }).where(eq(restaurantTables.id, tbl.id)).returning();
  res.status(201).json(updated);
};

const deleteTable: RequestHandler = async (req, res) => {
  const user = req.user!;
  const tableId = parseInt(String(req.params.tableId));
  await db
    .delete(restaurantTables)
    .where(and(eq(restaurantTables.id, tableId), eq(restaurantTables.restaurantId, user.restaurantId!)));
  res.status(204).send();
};

const regenerateQr: RequestHandler = async (req, res) => {
  const user = req.user!;
  const tableId = parseInt(String(req.params.tableId));
  const [tbl] = await db
    .select()
    .from(restaurantTables)
    .where(and(eq(restaurantTables.id, tableId), eq(restaurantTables.restaurantId, user.restaurantId!)))
    .limit(1);
  if (!tbl) { res.status(404).json({ error: "Table not found" }); return; }

  const slug = await getRestaurantSlug(user.restaurantId!);
  const qrUrl = getQrUrl(slug, tableId);
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 600, margin: 4, errorCorrectionLevel: "H" });

  const [updated] = await db.update(restaurantTables).set({ qrCodeUrl: qrDataUrl }).where(eq(restaurantTables.id, tableId)).returning();
  res.json(updated);
};

// ─── Orders ───────────────────────────────────────────────────────────────────

const listOrders: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.json([]); return; }

  const { status, date } = req.query as { status?: string; date?: string };

  let query = db
    .select()
    .from(orders)
    .where(eq(orders.restaurantId, user.restaurantId));

  const allOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, user.restaurantId),
        status && status !== "all" ? eq(orders.status, status as "pending_payment" | "awaiting_confirmation" | "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled") : undefined,
        date ? gte(orders.createdAt, new Date(date)) : undefined,
      )
    )
    .orderBy(desc(orders.createdAt));

  void query;

  if (allOrders.length === 0) { res.json([]); return; }

  const orderIds = allOrders.map((o) => o.id);
  const allItems = await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds));

  const itemsByOrder = new Map<number, typeof allItems>();
  for (const item of allItems) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId)!.push(item);
  }

  res.json(allOrders.map((o) => ({
    ...o,
    paymentScreenshotUrl: null,          // excluded from list — fetch individually on demand
    hasScreenshot: !!o.paymentScreenshotUrl,
    items: itemsByOrder.get(o.id) ?? [],
  })));
};

const getOwnerOrder: RequestHandler = async (req, res) => {
  const user = req.user!;
  const orderId = parseInt(String(req.params.orderId));
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, user.restaurantId!)))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  res.json({ ...order, items });
};

const updateOrder: RequestHandler = async (req, res) => {
  const user = req.user!;
  const orderId = parseInt(String(req.params.orderId));
  const { status, paymentStatus, paymentMethod } = req.body as {
    status?: "ordered" | "preparing" | "ready" | "completed" | "cancelled";
    paymentStatus?: "unpaid" | "paid";
    paymentMethod?: string | null;
  };

  // Strict transition validation when advancing order status
  if (status && status !== "cancelled") {
    const [existing] = await db
      .select({ status: orders.status, paymentStatus: orders.paymentStatus })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.restaurantId, user.restaurantId!)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Order not found" }); return; }

    // Map legacy entry states to "ordered" for transition purposes
    const LEGACY_ENTRY = new Set(["pending_payment", "awaiting_confirmation", "pending", "confirmed"]);
    const currentNorm = LEGACY_ENTRY.has(existing.status) ? "ordered" : existing.status;

    const NEXT: Record<string, string> = { ordered: "preparing", preparing: "ready", ready: "completed" };
    const expectedNext = NEXT[currentNorm];

    if (!expectedNext) {
      res.status(400).json({ error: `Cannot advance order from status: ${existing.status}` });
      return;
    }
    if (status !== expectedNext) {
      res.status(400).json({ error: `Invalid transition: expected ${expectedNext} but got ${status}` });
      return;
    }
    if (status === "completed" && existing.paymentStatus !== "paid") {
      res.status(400).json({ error: "Please complete payment before closing the order" });
      return;
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status) updates.status = status;
  if (paymentStatus) updates.paymentStatus = paymentStatus;
  if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;

  const [order] = await db
    .update(orders)
    .set(updates)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, user.restaurantId!)))
    .returning();

  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  // Free the table when completed
  if (status === "completed" || status === "cancelled") {
    if (order.tableId) {
      await db.update(restaurantTables).set({ isOccupied: false }).where(eq(restaurantTables.id, order.tableId));
    }
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  res.json({ ...order, items });
};

const verifyUpiPayment: RequestHandler = async (req, res) => {
  const user = req.user!;
  const orderId = parseInt(String(req.params.orderId));

  const [existing] = await db
    .select({ id: orders.id, status: orders.status, paymentMethod: orders.paymentMethod, tableId: orders.tableId })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, user.restaurantId!)))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Order not found" }); return; }
  if (existing.status !== "awaiting_confirmation" || existing.paymentMethod !== "upi") {
    res.status(400).json({ error: "Order is not pending UPI payment verification" }); return;
  }

  const [order] = await db
    .update(orders)
    .set({ paymentStatus: "paid", updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  res.json({ ...order, items });
};

const rejectUpiPayment: RequestHandler = async (req, res) => {
  const user = req.user!;
  const orderId = parseInt(String(req.params.orderId));

  const [existing] = await db
    .select({ id: orders.id, status: orders.status, paymentMethod: orders.paymentMethod, tableId: orders.tableId })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, user.restaurantId!)))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Order not found" }); return; }
  if (existing.status !== "awaiting_confirmation" || existing.paymentMethod !== "upi") {
    res.status(400).json({ error: "Order is not pending UPI payment verification" }); return;
  }

  const [order] = await db
    .update(orders)
    .set({ status: "payment_failed", updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  if (existing.tableId) {
    await db.update(restaurantTables).set({ isOccupied: false }).where(eq(restaurantTables.id, existing.tableId));
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  res.json({ ...order, items });
};

const getWhatsappBill: RequestHandler = async (req, res) => {
  const user = req.user!;
  const orderId = parseInt(String(req.params.orderId));

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, user.restaurantId!)))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, user.restaurantId!)).limit(1);
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  let msg = `🧾 *Bill from ${restaurant?.name ?? "Restaurant"}*\n`;
  msg += `Order #${order.id} | ${order.tableNumber ? `Table: ${order.tableNumber}` : "Takeaway"}\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  for (const item of items) {
    msg += `${item.quantity}x ${item.name} — ₹${item.unitPrice * item.quantity}\n`;
  }
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `Subtotal: ₹${order.subtotal}\n`;
  if (order.tax > 0) msg += `Tax (${restaurant?.taxPercent ?? 5}%): ₹${order.tax}\n`;
  msg += `*Total: ₹${order.total}*\n`;
  if (restaurant?.upiId) {
    msg += `\nPay via UPI: *${restaurant.upiId}*\n`;
  }
  msg += `\n📸 After payment, please *reply with your payment screenshot* so we can verify it instantly.\n`;
  msg += `\nThank you for dining with us! 🙏`;

  const rawPhone = order.customerPhone.replace(/\D/g, "");
  const phone = rawPhone.startsWith("91") && rawPhone.length === 12
    ? rawPhone
    : rawPhone.length === 10
      ? `91${rawPhone}`
      : rawPhone;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

  res.json({ url, message: msg });
};

// ─── Table label helper ───────────────────────────────────────────────────────
// Derives a display label from the table numbers across all orders in a session.
// Single table  → "T2"
// Multiple tables → "T2, T6"  (sorted, deduplicated)
// No table numbers found → falls back to the session-row's tableNumber column.
function deriveTableLabel(
  sessionOrders: Array<{ tableNumber: string | null }>,
  sessionTableNumber: string | null,
): string | null {
  const tables = [
    ...new Set(
      sessionOrders
        .map((o) => o.tableNumber)
        .filter((t): t is string => t !== null && t.trim() !== ""),
    ),
  ].sort();
  if (tables.length === 0) return sessionTableNumber;
  return tables.join(", ");
}

// ─── Bill image generator (server-side) ──────────────────────────────────────
// Produces a 600×N pixel PNG payment bill with embedded UPI QR code using sharp.
// No browser Canvas needed — runs entirely on the server.

interface BillItem { name: string; quantity: number; unitPrice: number; isVeg: boolean }

async function generateBillPng(opts: {
  restaurantName: string;
  orderId: number;
  tableNumber: string | null;
  customerName: string;
  items: BillItem[];
  subtotal: number;
  tax: number;
  total: number;
  qrPngBuffer: Buffer;
}): Promise<Buffer> {
  const W = 600;
  const ITEM_H = 28;
  const itemsH = opts.items.length * ITEM_H;
  const H = 680 + itemsH;

  const svgLines: string[] = [];

  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#E5E7EB" stroke-width="1"/>`;

  const text = (x: number, y: number, content: string, opts: {
    size?: number; weight?: string; fill?: string; anchor?: string
  } = {}) => {
    const { size = 15, weight = "normal", fill = "#111827", anchor = "start" } = opts;
    const escaped = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" font-family="Arial,sans-serif">${escaped}</text>`;
  };

  svgLines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`);

  // White background
  svgLines.push(`<rect width="${W}" height="${H}" fill="#FFFFFF"/>`);

  // Orange header
  svgLines.push(`<rect width="${W}" height="86" fill="#F97316"/>`);
  svgLines.push(text(W / 2, 52, opts.restaurantName, { size: 26, weight: "bold", fill: "#FFFFFF", anchor: "middle" }));
  svgLines.push(text(W / 2, 76, "Payment Bill", { size: 13, fill: "#FED7AA", anchor: "middle" }));

  let y = 120;

  // Title
  svgLines.push(text(W / 2, y, "Payment Bill", { size: 22, weight: "bold", fill: "#111827", anchor: "middle" }));
  y += 32;

  // Order meta
  svgLines.push(text(40, y, `Order #${opts.orderId}`, { size: 14, fill: "#6B7280" }));
  if (opts.tableNumber) {
    svgLines.push(text(W - 40, y, `Table: ${opts.tableNumber}`, { size: 14, fill: "#6B7280", anchor: "end" }));
  }
  y += 24;
  svgLines.push(text(40, y, `Customer: ${opts.customerName}`, { size: 14, fill: "#6B7280" }));
  y += 28;

  // Divider
  svgLines.push(line(40, y, W - 40, y));
  y += 24;

  // Items header
  svgLines.push(text(40, y, "Items Ordered", { size: 15, weight: "bold", fill: "#374151" }));
  y += 10;

  // Item rows
  for (const item of opts.items) {
    y += ITEM_H;
    const dotColor = item.isVeg ? "#22C55E" : "#EF4444";
    svgLines.push(`<circle cx="50" cy="${y - 5}" r="5" fill="${dotColor}"/>`);
    svgLines.push(text(64, y, `${item.quantity}\u00D7 ${item.name}`, { size: 14, fill: "#111827" }));
    svgLines.push(text(W - 40, y, `\u20B9${item.unitPrice * item.quantity}`, { size: 14, fill: "#111827", anchor: "end" }));
  }
  y += 24;

  // Divider
  svgLines.push(line(40, y, W - 40, y));
  y += 28;

  // Subtotal / tax / total
  if (opts.tax > 0) {
    svgLines.push(text(40, y, "Subtotal", { size: 14, fill: "#6B7280" }));
    svgLines.push(text(W - 40, y, `\u20B9${opts.subtotal}`, { size: 14, fill: "#6B7280", anchor: "end" }));
    y += 24;
    svgLines.push(text(40, y, "Tax", { size: 14, fill: "#6B7280" }));
    svgLines.push(text(W - 40, y, `\u20B9${opts.tax}`, { size: 14, fill: "#6B7280", anchor: "end" }));
    y += 24;
    svgLines.push(line(40, y, W - 40, y));
    y += 20;
  }

  svgLines.push(text(40, y, "Total", { size: 20, weight: "bold", fill: "#111827" }));
  svgLines.push(text(W - 40, y, `\u20B9${opts.total}`, { size: 22, weight: "bold", fill: "#F97316", anchor: "end" }));
  y += 44;

  // QR label
  svgLines.push(text(W / 2, y, "Scan QR Code to Pay", { size: 17, weight: "bold", fill: "#374151", anchor: "middle" }));
  y += 18;

  // QR placeholder (replaced below with actual PNG embed)
  const QR_SIZE = 220;
  const qrX = (W - QR_SIZE) / 2;
  svgLines.push(`<rect x="${qrX - 10}" y="${y - 4}" width="${QR_SIZE + 20}" height="${QR_SIZE + 20}" rx="12" fill="#FFFFFF" stroke="#E5E7EB"/>`);
  // Mark position for QR overlay: store y in a sentinel comment
  svgLines.push(`<!--QR:${qrX}:${y + 4}:${QR_SIZE}-->`);
  y += QR_SIZE + 32;

  // Footer
  svgLines.push(text(W / 2, y, "After payment, reply with your payment screenshot", { size: 13, fill: "#6B7280", anchor: "middle" }));
  y += 20;
  svgLines.push(text(W / 2, y, `Reference: Order#${opts.orderId}`, { size: 13, fill: "#6B7280", anchor: "middle" }));
  y += 28;

  // Thank-you strip
  svgLines.push(`<rect x="0" y="${H - 44}" width="${W}" height="44" fill="#FFF7ED"/>`);
  svgLines.push(text(W / 2, H - 16, "Thank you for dining with us!", { size: 14, fill: "#EA580C", anchor: "middle" }));

  svgLines.push("</svg>");

  const svgStr = svgLines.join("\n");

  // Extract QR position from sentinel comment
  const qrMatch = svgStr.match(/<!--QR:(\d+\.?\d*):(\d+\.?\d*):(\d+\.?\d*)-->/);
  const qrLeft = qrMatch ? Number(qrMatch[1]) : qrX;
  const qrTop  = qrMatch ? Number(qrMatch[2]) : 118 + 32 + 24 + 28 + 28 + 24 + itemsH + 24 + 28 + 44 + 18;

  // Composite: SVG base + QR PNG overlay
  const svgBuffer = Buffer.from(svgStr, "utf-8");

  const png = await sharp(svgBuffer)
    .resize(W, H)
    .composite([{
      input: await sharp(opts.qrPngBuffer).resize(QR_SIZE, QR_SIZE).toBuffer(),
      top: Math.round(qrTop),
      left: Math.round(qrLeft),
    }])
    .png()
    .toBuffer();

  return png;
}

// ─── Bill HTML helpers ────────────────────────────────────────────────────────

function buildSiteUrl(): string {
  return (
    process.env["SITE_URL"]?.trim() ||
    (() => {
      const d = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
      return d ? `https://${d}` : null;
    })() ||
    (process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
      : `http://localhost:${process.env["PORT"] ?? 8080}`)
  );
}

const BILL_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: #fff8f0; min-height: 100vh; display: flex; flex-direction: column;
         align-items: center; justify-content: center; padding: 20px; color: #1a1a1a; }
  .card { background: #fff; border-radius: 16px; padding: 24px; max-width: 480px;
          width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
  .header { text-align: center; margin-bottom: 16px; }
  .header h1 { font-size: 18px; font-weight: 700; color: #1a1a1a; }
  .header p { font-size: 13px; color: #888; margin-top: 4px; }
  .bill-img { width: 100%; height: auto; border-radius: 8px; display: block; }
  .hint { text-align: center; margin-top: 16px; font-size: 13px; color: #666; line-height: 1.5; }
  .brand { text-align: center; margin-top: 24px; font-size: 11px; color: #ccc; }
  .icon { font-size: 48px; margin-bottom: 16px; text-align: center; }
  .sub { font-size: 15px; color: #555; line-height: 1.5; margin-bottom: 12px; text-align: center; }
  .meta { font-size: 13px; color: #888; margin-top: 4px; text-align: center; }`;

function renderBillPage(
  imageUrl: string,
  restaurantName: string,
  orderId: number,
  tableNumber: string | null,
): string {
  const tableText = tableNumber ? ` · Table ${tableNumber}` : "";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const safeRestaurant = esc(restaurantName);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Bill — ${safeRestaurant}</title>
  <meta property="og:title" content="Payment Bill — ${safeRestaurant}" />
  <meta property="og:description" content="Order #${orderId}${tableText} — Scan the QR code to pay instantly" />
  <meta property="og:image" content="${esc(imageUrl)}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="600" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Payment Bill — ${safeRestaurant}" />
  <meta name="twitter:image" content="${esc(imageUrl)}" />
  <style>${BILL_CSS}</style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Payment Bill</h1>
      <p>${safeRestaurant}${tableText}</p>
    </div>
    <img class="bill-img" src="${esc(imageUrl)}" alt="Payment Bill" />
    <p class="hint">Scan the QR code in the bill to pay instantly.<br>The amount is already pre-filled.</p>
  </div>
  <p class="brand">Powered by Bitebend</p>
</body>
</html>`;
}

function renderBillError(result: BillResult): { statusCode: number; html: string } {
  const isExpired = result.status === "expired";
  const statusCode = isExpired ? 410 : 404;
  const title = isExpired ? "Bill Expired" : "Bill Not Found";
  const restaurantName = isExpired ? result.context.restaurantName : "";
  const orderId = isExpired ? result.context.orderId : null;
  const tableNumber = isExpired ? result.context.tableNumber : null;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Bitebend</title>
  <style>${BILL_CSS}</style>
</head>
<body>
  <div class="card">
    <div class="icon">${isExpired ? "&#x23F1;&#xFE0F;" : "&#x1F50D;"}</div>
    <h1 style="text-align:center;font-size:22px;font-weight:700;margin-bottom:8px">${title}</h1>
    <p class="sub">${
      isExpired
        ? `This payment bill from <strong>${restaurantName}</strong> has expired. Bills are valid for 24 hours. Please ask staff to resend it.`
        : "This bill link is invalid or has already been removed."
    }</p>
    ${orderId ? `<p class="meta">Order #${orderId}</p>` : ""}
    ${tableNumber ? `<p class="meta">Table: ${tableNumber}</p>` : ""}
  </div>
  <p class="brand">Powered by Bitebend</p>
</body>
</html>`;
  return { statusCode, html };
}

// ─── GET /api/bills/:token ─────────────────────────────────────────────────────
// Public — serves an OpenGraph-tagged HTML page with the bill image.
// WhatsApp scrapes this URL and shows a rich card preview in chat.
const serveBillPage: RequestHandler = async (req, res) => {
  const token = String(req.params.token);
  const result = await getBillByToken(token);

  if (result.status === "ok") {
    const imageUrl = `${buildSiteUrl()}/api/bills/${token}/image`;
    res.setHeader("Content-Type", "text/html; charset=utf-8")
       .setHeader("Cache-Control", "public, max-age=3600")
       .send(renderBillPage(imageUrl, result.context.restaurantName, result.context.orderId, result.context.tableNumber));
    return;
  }

  const { statusCode, html } = renderBillError(result);
  res.status(statusCode).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
};

// ─── GET /api/bills/:token/image ──────────────────────────────────────────────
// Public — serves the raw PNG. Used as og:image src and for direct image access.
const serveBillImageRaw: RequestHandler = async (req, res) => {
  const token = String(req.params.token);
  const result = await getBillByToken(token);

  if (result.status === "ok") {
    res.setHeader("Content-Type", "image/png")
       .setHeader("Cache-Control", "public, max-age=3600")
       .setHeader("Content-Disposition", `inline; filename="bill.png"`)
       .end(result.png);
    return;
  }

  if (result.status === "expired") {
    res.status(410).json({ error: "Bill expired" });
    return;
  }
  res.status(404).json({ error: "Bill not found" });
};

// ─── GET /api/b/:shortId ──────────────────────────────────────────────────────
// Public — short URL used in WhatsApp messages (e.g. /api/b/a1b2c3d4e5).
// Serves the same OpenGraph HTML page as /api/bills/:token.
const serveBillShort: RequestHandler = async (req, res) => {
  const shortId = String(req.params.shortId);
  const result = await getBillByShortId(shortId);

  if (result.status === "ok") {
    const imageUrl = `${buildSiteUrl()}/api/bills/${result.context.token}/image`;
    res.setHeader("Content-Type", "text/html; charset=utf-8")
       .setHeader("Cache-Control", "public, max-age=3600")
       .send(renderBillPage(imageUrl, result.context.restaurantName, result.context.orderId, result.context.tableNumber));
    return;
  }

  const { statusCode, html } = renderBillError(result);
  res.status(statusCode).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
};

// ─── GET /owner/orders/:orderId/bill ─────────────────────────────────────────
// Generates a payment bill PNG on the server, stores it persistently with a
// 24-hour signed token, and returns a public billUrl + WhatsApp deep-link.
// No file download on the restaurant device. Rate-limited to 5 sends/order/day.
const getBill: RequestHandler = async (req, res) => {
  const user = req.user!;
  const orderId = parseInt(String(req.params.orderId));

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, user.restaurantId!)))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, user.restaurantId!)).limit(1);
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  // UPI QR payload — auto-fills amount in GPay / PhonePe / Paytm
  const upiId = restaurant?.upiId ?? "";
  const qrPayload = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(restaurant?.name ?? "")}&am=${order.total}&tn=${encodeURIComponent(`Order#${order.id}`)}&cu=INR`
    : `Order #${order.id} | Total: Rs.${order.total}`;

  const qrPngBuffer = await QRCode.toBuffer(qrPayload, { width: 400, margin: 2, errorCorrectionLevel: "H", type: "png" });

  const billPng = await generateBillPng({
    restaurantName: restaurant?.name ?? "Restaurant",
    orderId: order.id,
    tableNumber: order.tableNumber ?? null,
    customerName: order.customerName,
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, isVeg: i.isVeg ?? true })),
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
    qrPngBuffer,
  });

  // Persist PNG + metadata; throws on rate limit or cooldown
  let token: string;
  let shortId: string;
  try {
    ({ token, shortId } = await storeBill(billPng, orderId, user.restaurantId!));
  } catch (err) {
    if (err instanceof BillRateLimitError || err instanceof BillCooldownError) {
      res.status(429).json({ error: err.message });
      return;
    }
    throw err;
  }

  const siteUrl = buildSiteUrl();
  // Short URL goes in the WhatsApp message; full token URL used for OG image
  const shortUrl = `${siteUrl}/api/b/${shortId}`;
  const billUrl = `${siteUrl}/api/bills/${token}`;

  req.log.info({ orderId, restaurantId: user.restaurantId, shortId }, "bill_send_attempted");

  const { whatsappUrl, message } = sendPaymentBill({
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    restaurantName: restaurant?.name ?? "Restaurant",
    tableNumber: order.tableNumber ?? null,
    orderId: order.id,
    total: order.total,
    upiId: upiId || null,
    billUrl: shortUrl,
  });

  // Try sending via the connected WhatsApp Bridge first.
  // If the bridge is not connected, not running, or returns an error, we fall
  // back silently to the wa.me deep-link so the UI can open WhatsApp manually.
  const sentViaBridge = await tryBridgeSend(
    user.restaurantId!,
    order.customerPhone,
    message,
  );

  req.log.info(
    { orderId, restaurantId: user.restaurantId, shortId, sentViaBridge },
    "bill_send_success",
  );

  res.json({
    billUrl: shortUrl,
    whatsappUrl,
    message,
    total: order.total,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    restaurantName: restaurant?.name ?? "Restaurant",
    tableNumber: order.tableNumber ?? null,
    imageUrl: `${billUrl}/image`,
    // deliveryMethod tells the portal how the message was dispatched
    deliveryMethod: sentViaBridge ? "bridge" : "deeplink",
    sent: sentViaBridge,
  });
};

// ─── POST /owner/orders/:orderId/verify-payment ───────────────────────────────
// Owner uploads a payment screenshot on behalf of the customer (manual OCR trigger).
const verifyOrderPayment: RequestHandler = async (req, res) => {
  const user = req.user!;
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
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, user.restaurantId!)))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  if (order.paymentStatus === "paid") {
    res.json({ alreadyPaid: true, ocrConfigured: true, matched: true, confidence: 100 });
    return;
  }

  if (!isOcrConfigured()) {
    await db
      .update(orders)
      .set({
        paymentScreenshotUrl: screenshotBase64,
        paymentVerificationStatus: "manual_review",
        paymentStatus: "manual_review",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
    res.json({ ocrConfigured: false, matched: false, confidence: 0 });
    return;
  }

  const ocrResult = await extractPaymentData(screenshotBase64, mimeType);
  const match = matchPayment(ocrResult, order.total);
  const newPaymentStatus = match.matched ? "paid" : "manual_review";
  const newVerificationStatus = match.matched ? "ai_verified" : "manual_review";

  await db
    .update(orders)
    .set({
      paymentScreenshotUrl: screenshotBase64,
      paymentOcrData: JSON.stringify(ocrResult),
      paymentVerificationStatus: newVerificationStatus,
      paymentStatus: newPaymentStatus,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  req.log.info(
    { orderId, matched: match.matched, confidence: ocrResult.confidence },
    "Owner triggered payment verification",
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

// ─── PATCH /owner/orders/:orderId/approve-payment ────────────────────────────
const approvePayment: RequestHandler = async (req, res) => {
  const user = req.user!;
  const orderId = parseInt(String(req.params.orderId));

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, user.restaurantId!)))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const now = new Date();
  await db
    .update(orders)
    .set({
      paymentStatus: "paid",
      paymentVerificationStatus: "approved",
      verificationMethod: "manual_staff",
      verifiedBy: user.id,
      verifiedAt: now,
      paidAt: now,
      updatedAt: now,
    })
    .where(eq(orders.id, orderId));

  req.log.info({ orderId, userId: user.id }, "Payment manually approved");
  res.json({ success: true });
};

// ─── POST /owner/orders/:orderId/confirm-staff-payment ───────────────────────
// Staff confirms customer paid by showing payment confirmation at counter.
// Works for awaiting_verification (Path B) and manual_review (low-confidence OCR).
const confirmStaffPayment: RequestHandler = async (req, res) => {
  const user = req.user!;
  const orderId = parseInt(String(req.params.orderId));
  const { utr, notes } = req.body as { utr?: string; notes?: string };

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, user.restaurantId!)))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  if (order.paymentStatus === "paid") {
    res.json({ success: true, alreadyPaid: true });
    return;
  }

  const now = new Date();
  await db
    .update(orders)
    .set({
      paymentStatus: "paid",
      paymentVerificationStatus: "approved",
      verificationMethod: "manual_staff",
      verifiedBy: user.id,
      verifiedAt: now,
      paidAt: now,
      paymentOcrData: JSON.stringify({ source: "manual_staff", utr: utr ?? null, notes: notes ?? null }),
      updatedAt: now,
    })
    .where(eq(orders.id, orderId));

  req.log.info(
    { event: "manual_payment_verified", orderId, userId: user.id, utr: utr ?? null },
    "manual_payment_verified: staff confirmed payment at counter",
  );
  res.json({ success: true });
};

// ─── PATCH /owner/orders/:orderId/reject-payment ─────────────────────────────
const rejectPayment: RequestHandler = async (req, res) => {
  const user = req.user!;
  const orderId = parseInt(String(req.params.orderId));

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, user.restaurantId!)))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  await db
    .update(orders)
    .set({ paymentStatus: "unpaid", paymentVerificationStatus: "rejected", updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  req.log.info(
    { event: "manual_payment_rejected", orderId, userId: user.id },
    "manual_payment_rejected: staff rejected payment screenshot",
  );
  res.json({ success: true });
};

// ─── Customer Analytics ───────────────────────────────────────────────────────

const HIGH_VALUE_THRESHOLD = 2000;

const getCustomerAnalytics: RequestHandler = async (req, res) => {
  const user = req.user!;
  const rid = user.restaurantId;

  const empty = {
    summary: { totalCustomers: 0, repeatCustomers: 0, repeatRate: 0, avgSpend: 0, newLast7Days: 0, inactiveCount: 0 },
    segments: [
      { label: "New", key: "new", count: 0, revenue: 0 },
      { label: "Repeat", key: "repeat", count: 0, revenue: 0 },
      { label: "Loyal", key: "loyal", count: 0, revenue: 0 },
      { label: "High Value", key: "highValue", count: 0, revenue: 0 },
    ],
    growth: [], spending: [],
    repeatBehavior: { avgOrdersPerCustomer: 0, repeatRate: 0, avgDaysBetween: 0 },
    topCustomers: [], inactiveList: [],
  };
  if (!rid) { res.json(empty); return; }

  const { startDate, endDate, orderType } = req.query as Record<string, string | undefined>;

  const conditions: ReturnType<typeof eq>[] = [eq(orders.restaurantId, rid) as ReturnType<typeof eq>];
  if (startDate) (conditions as Parameters<typeof and>[0][]) .push(gte(orders.createdAt, new Date(startDate)) as ReturnType<typeof eq>);
  if (endDate) (conditions as Parameters<typeof and>[0][]).push(lte(orders.createdAt, new Date(`${endDate}T23:59:59`)) as ReturnType<typeof eq>);

  const allOrders = await db
    .select({
      customerPhone: orders.customerPhone,
      customerName: orders.customerName,
      total: orders.total,
      createdAt: orders.createdAt,
      tableId: orders.tableId,
    })
    .from(orders)
    .where(and(...conditions));

  const filtered = orderType === "dine-in"
    ? allOrders.filter((o) => o.tableId !== null)
    : orderType === "takeaway"
      ? allOrders.filter((o) => o.tableId === null)
      : allOrders;

  type CustEntry = {
    phone: string; name: string;
    totalOrders: number; totalSpent: number;
    firstOrder: Date; lastOrder: Date;
    orderDates: Date[];
  };

  const custMap = new Map<string, CustEntry>();
  for (const o of filtered) {
    const key = o.customerPhone;
    if (!custMap.has(key)) {
      custMap.set(key, { phone: o.customerPhone, name: o.customerName, totalOrders: 0, totalSpent: 0, firstOrder: o.createdAt, lastOrder: o.createdAt, orderDates: [] });
    }
    const c = custMap.get(key)!;
    c.totalOrders++;
    c.totalSpent += o.total;
    if (o.createdAt < c.firstOrder) c.firstOrder = o.createdAt;
    if (o.createdAt > c.lastOrder) c.lastOrder = o.createdAt;
    c.orderDates.push(o.createdAt);
  }

  const customers = [...custMap.values()];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const totalCustomers = customers.length;
  const repeatCustomers = customers.filter((c) => c.totalOrders >= 2).length;
  const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);
  const avgSpend = totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0;
  const newLast7Days = customers.filter((c) => c.firstOrder >= sevenDaysAgo).length;
  const inactiveCount = customers.filter((c) => c.lastOrder < sevenDaysAgo).length;
  const repeatRate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;

  const seg = { new: { count: 0, revenue: 0 }, repeat: { count: 0, revenue: 0 }, loyal: { count: 0, revenue: 0 }, highValue: { count: 0, revenue: 0 } };
  for (const c of customers) {
    if (c.totalOrders === 1) { seg.new.count++; seg.new.revenue += c.totalSpent; }
    else if (c.totalOrders <= 5) { seg.repeat.count++; seg.repeat.revenue += c.totalSpent; }
    else { seg.loyal.count++; seg.loyal.revenue += c.totalSpent; }
    if (c.totalSpent >= HIGH_VALUE_THRESHOLD) { seg.highValue.count++; seg.highValue.revenue += c.totalSpent; }
  }

  const growthMap = new Map<string, number>();
  for (const c of customers) {
    if (c.firstOrder >= thirtyDaysAgo) {
      const dk = c.firstOrder.toISOString().slice(0, 10);
      growthMap.set(dk, (growthMap.get(dk) ?? 0) + 1);
    }
  }
  const growth = [...growthMap.entries()]
    .map(([date, newCustomers]) => ({ date, newCustomers }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const spending = [
    { label: "Low (< ₹500)", count: customers.filter((c) => c.totalSpent < 500).length },
    { label: "Mid (₹500–₹2k)", count: customers.filter((c) => c.totalSpent >= 500 && c.totalSpent <= 2000).length },
    { label: "High (> ₹2k)", count: customers.filter((c) => c.totalSpent > 2000).length },
  ];

  const avgOrdersPerCustomer = totalCustomers > 0
    ? Math.round((customers.reduce((s, c) => s + c.totalOrders, 0) / totalCustomers) * 10) / 10 : 0;

  const multi = customers.filter((c) => c.orderDates.length >= 2);
  let avgDaysBetween = 0;
  if (multi.length > 0) {
    const total = multi.reduce((sum, c) => {
      const sorted = [...c.orderDates].sort((a, b) => a.getTime() - b.getTime());
      return sum + (sorted[sorted.length - 1].getTime() - sorted[0].getTime()) / (86400000 * (sorted.length - 1));
    }, 0);
    avgDaysBetween = Math.round(total / multi.length);
  }

  const topCustomers = [...customers]
    .sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10)
    .map((c) => ({ phone: c.phone, name: c.name, totalOrders: c.totalOrders, totalSpent: c.totalSpent, lastOrderAt: c.lastOrder.toISOString() }));

  const inactiveList = customers
    .filter((c) => c.lastOrder < sevenDaysAgo)
    .sort((a, b) => b.totalOrders - a.totalOrders).slice(0, 20)
    .map((c) => ({ phone: c.phone, name: c.name, totalOrders: c.totalOrders, totalSpent: c.totalSpent, lastOrderAt: c.lastOrder.toISOString() }));

  res.json({
    summary: { totalCustomers, repeatCustomers, repeatRate, avgSpend, newLast7Days, inactiveCount },
    segments: [
      { label: "New", key: "new", ...seg.new },
      { label: "Repeat", key: "repeat", ...seg.repeat },
      { label: "Loyal", key: "loyal", ...seg.loyal },
      { label: "High Value", key: "highValue", ...seg.highValue },
    ],
    growth, spending,
    repeatBehavior: { avgOrdersPerCustomer, repeatRate, avgDaysBetween },
    topCustomers, inactiveList,
  });
};

// ─── Stats ────────────────────────────────────────────────────────────────────

// ─── Sessions: table session summary with embedded orders ─────────────────────

const listSessions: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.json([]); return; }

  const { status } = req.query as { status?: string };

  const sessionRows = await db
    .select()
    .from(tableSessions)
    .where(
      and(
        eq(tableSessions.restaurantId, user.restaurantId),
        status && status !== "all"
          ? eq(tableSessions.status, status as "active" | "awaiting_payment" | "awaiting_verification" | "paid" | "closed")
          : undefined,
      ),
    )
    .orderBy(desc(tableSessions.createdAt));

  if (sessionRows.length === 0) { res.json([]); return; }

  const sessionIds = sessionRows.map((s) => s.id);

  const [sessionOrders, billRows] = await Promise.all([
    db.select().from(orders).where(inArray(orders.sessionId, sessionIds)).orderBy(desc(orders.createdAt)),
    db.select().from(sessionBills).where(
      and(inArray(sessionBills.sessionId, sessionIds), ne(sessionBills.status, "cancelled" as const))
    ).orderBy(desc(sessionBills.createdAt)),
  ]);

  const orderIds = sessionOrders.map((o) => o.id);
  const allItems = orderIds.length > 0
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
    : [];

  const itemsByOrder = new Map<number, typeof allItems>();
  for (const item of allItems) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId)!.push(item);
  }

  const ordersWithItems = sessionOrders.map((o) => ({
    ...o,
    paymentScreenshotUrl: null,
    hasScreenshot: !!o.paymentScreenshotUrl,
    items: itemsByOrder.get(o.id) ?? [],
  }));

  const ordersBySession = new Map<number, typeof ordersWithItems>();
  for (const o of ordersWithItems) {
    if (o.sessionId !== null) {
      if (!ordersBySession.has(o.sessionId)) ordersBySession.set(o.sessionId, []);
      ordersBySession.get(o.sessionId)!.push(o);
    }
  }

  const billBySession = new Map<number, typeof billRows[0]>();
  for (const bill of billRows) {
    if (!billBySession.has(bill.sessionId)) billBySession.set(bill.sessionId, bill);
  }

  res.json(
    sessionRows.map((session) => {
      const sessionOrdersList = ordersBySession.get(session.id) ?? [];
      const itemCount = sessionOrdersList.reduce(
        (sum, o) => sum + o.items.reduce((s, item) => s + item.quantity, 0),
        0,
      );
      const totalAmount = sessionOrdersList.reduce((sum, o) => sum + o.total, 0);
      const bill = billBySession.get(session.id) ?? null;
      return {
        id: session.id,
        tableNumber: session.tableNumber ?? null,
        sessionType: session.sessionType,
        customerPhone: session.customerPhone ?? null,
        status: session.status,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        orderCount: sessionOrdersList.length,
        itemCount,
        totalAmount,
        orders: sessionOrdersList,
        bill: bill ? {
          id: bill.id,
          sessionId: bill.sessionId,
          restaurantId: bill.restaurantId,
          billNumber: bill.billNumber,
          subtotal: bill.subtotal,
          tax: bill.tax,
          total: bill.total,
          status: bill.status,
          customerPhone: bill.customerPhone ?? null,
          sentAt: bill.sentAt?.toISOString() ?? null,
          hasScreenshot: !!bill.screenshotUrl,
          screenshotReceivedAt: bill.screenshotReceivedAt?.toISOString() ?? null,
          senderPhone: bill.senderPhone ?? null,
          phoneMismatch: bill.phoneMismatch,
          verifiedAt: bill.verifiedAt?.toISOString() ?? null,
          verifiedBy: bill.verifiedBy ?? null,
          createdAt: bill.createdAt.toISOString(),
          updatedAt: bill.updatedAt.toISOString(),
        } : null,
      };
    }),
  );
};

const generateBill: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sessionId = parseInt(String(req.params.sessionId));
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  const [session] = await db
    .select()
    .from(tableSessions)
    .where(and(eq(tableSessions.id, sessionId), eq(tableSessions.restaurantId, user.restaurantId)));

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  if (session.status !== "active") {
    res.status(400).json({ error: "Bill can only be generated for active sessions" });
    return;
  }

  const existingBills = await db
    .select()
    .from(sessionBills)
    .where(and(eq(sessionBills.sessionId, sessionId), ne(sessionBills.status, "cancelled" as const)));

  if (existingBills.length > 0) {
    res.status(409).json({ error: "An active bill already exists for this session", bill: existingBills[0] });
    return;
  }

  const sessionOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.sessionId, sessionId));

  const payableOrders = sessionOrders.filter(
    (o) => o.status !== "cancelled" && o.status !== "payment_failed",
  );

  if (payableOrders.length === 0) {
    res.status(400).json({ error: "No payable orders in this session" });
    return;
  }

  const incompleteOrders = payableOrders.filter((o) => o.status !== "completed");
  if (incompleteOrders.length > 0) {
    res.status(409).json({ error: "All orders must be marked Completed before generating a bill." });
    return;
  }

  const subtotal = payableOrders.reduce((sum, o) => sum + o.subtotal, 0);
  const tax = payableOrders.reduce((sum, o) => sum + o.tax, 0);
  const total = payableOrders.reduce((sum, o) => sum + o.total, 0);

  if (total === 0) {
    res.status(400).json({ error: "Cannot generate a ₹0 bill" });
    return;
  }

  const newBill = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(sessionBills)
      .values({
        sessionId,
        restaurantId: user.restaurantId!,
        billNumber: `BILL-PENDING-${Date.now()}`,
        subtotal,
        tax,
        total,
        status: "generated",
      })
      .returning();

    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const billNumber = `BILL-${user.restaurantId}-${dateStr}-${inserted.id}`;

    const [finalBill] = await tx
      .update(sessionBills)
      .set({ billNumber, updatedAt: new Date() })
      .where(eq(sessionBills.id, inserted.id))
      .returning();

    await tx
      .update(tableSessions)
      .set({ status: "awaiting_payment", updatedAt: new Date() })
      .where(eq(tableSessions.id, sessionId));

    return finalBill;
  });

  logger.info({ sessionId, billId: newBill.id, billNumber: newBill.billNumber, total }, "Session bill generated");

  res.status(201).json({
    id: newBill.id,
    sessionId: newBill.sessionId,
    restaurantId: newBill.restaurantId,
    billNumber: newBill.billNumber,
    subtotal: newBill.subtotal,
    tax: newBill.tax,
    total: newBill.total,
    status: newBill.status,
    createdAt: newBill.createdAt.toISOString(),
    updatedAt: newBill.updatedAt.toISOString(),
  });
};

const getSessionBill: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sessionId = parseInt(String(req.params.sessionId));
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  const [session] = await db
    .select()
    .from(tableSessions)
    .where(and(eq(tableSessions.id, sessionId), eq(tableSessions.restaurantId, user.restaurantId)));

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const bills = await db
    .select()
    .from(sessionBills)
    .where(and(eq(sessionBills.sessionId, sessionId), ne(sessionBills.status, "cancelled" as const)))
    .orderBy(desc(sessionBills.createdAt));

  if (bills.length === 0) { res.status(404).json({ error: "No bill found for this session" }); return; }

  const bill = bills[0];
  res.json({
    id: bill.id,
    sessionId: bill.sessionId,
    restaurantId: bill.restaurantId,
    billNumber: bill.billNumber,
    subtotal: bill.subtotal,
    tax: bill.tax,
    total: bill.total,
    status: bill.status,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
  });
};

// ─── Sessions: send bill via WhatsApp ─────────────────────────────────────────

const sendSessionBill: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sessionId = parseInt(String(req.params.sessionId));
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  // Load session + restaurant in parallel
  const [[session], [restaurant]] = await Promise.all([
    db.select().from(tableSessions)
      .where(and(eq(tableSessions.id, sessionId), eq(tableSessions.restaurantId, user.restaurantId))),
    db.select().from(restaurants).where(eq(restaurants.id, user.restaurantId)).limit(1),
  ]);

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (!restaurant) { res.status(404).json({ error: "Restaurant not found" }); return; }

  // Load the active bill
  const [bill] = await db
    .select()
    .from(sessionBills)
    .where(and(
      eq(sessionBills.sessionId, sessionId),
      ne(sessionBills.status, "cancelled" as const),
    ))
    .orderBy(desc(sessionBills.createdAt))
    .limit(1);

  if (!bill) { res.status(404).json({ error: "No bill found for this session" }); return; }

  if (bill.status !== "generated" && bill.status !== "sent") {
    res.status(400).json({ error: `Cannot send bill in status '${bill.status}'` });
    return;
  }

  // Load orders in session to get customer phone + build message
  const sessionOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.sessionId, sessionId))
    .orderBy(desc(orders.createdAt));

  const payableOrders = sessionOrders.filter(
    (o) => o.status !== "cancelled" && o.status !== "payment_failed"
  );

  if (payableOrders.length === 0) {
    res.status(400).json({ error: "No payable orders in this session" });
    return;
  }

  // Use most recent order's phone as the customer phone (deterministic matching)
  const customerPhone = payableOrders[0]!.customerPhone;
  const customerName = payableOrders[0]!.customerName;

  // Build bill message
  const upiId = restaurant.upiId ?? null;
  const restaurantName = restaurant.name;
  const tableLabel = deriveTableLabel(payableOrders, session.tableNumber);
  const tablePrefix = (() => {
    const uniqueTables = [...new Set(payableOrders.map((o) => o.tableNumber).filter(Boolean))];
    return uniqueTables.length > 1 ? "Tables" : "Table";
  })();

  let itemLines = "";
  for (const order of payableOrders) {
    const lineItems = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    for (const item of lineItems) {
      itemLines += `  • ${item.quantity}× ${item.name} — ₹${((item.unitPrice * item.quantity) / 100).toFixed(2)}\n`;
    }
  }

  const totalStr = (bill.total / 100).toFixed(2);
  const subtotalStr = (bill.subtotal / 100).toFixed(2);
  const taxStr = (bill.tax / 100).toFixed(2);

  let message = `🧾 *Bill — ${restaurantName}*\n`;
  message += `${tablePrefix}: *${tableLabel}*\n`;
  message += `Bill No: ${bill.billNumber}\n\n`;
  if (itemLines) {
    message += `*Items:*\n${itemLines}\n`;
  }
  message += `Subtotal: ₹${subtotalStr}\n`;
  if (bill.tax > 0) message += `Tax: ₹${taxStr}\n`;
  message += `*Total: ₹${totalStr}*\n`;
  if (upiId) {
    message += `\n💳 *Pay via UPI:* ${upiId}\n`;
    message += `Amount: ₹${totalStr}\n`;
    message += `Note: ${bill.billNumber}\n`;
  }
  message += `\nPlease send a screenshot of your payment confirmation to this number. Thank you! 🙏`;

  // Try WhatsApp bridge first, fall back to deeplink
  let sentViaBridge = false;
  let whatsappUrl: string | null = null;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const bridgeSecret = process.env.BRIDGE_API_SECRET ?? "";
    if (bridgeSecret) headers["x-bridge-secret"] = bridgeSecret;

    const bridgeUrl = process.env.BRIDGE_URL ?? "http://localhost:3001";

    const statusRes = await fetch(`${bridgeUrl}/api/whatsapp/status/${user.restaurantId}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(3000),
    });
    const statusData = (await statusRes.json()) as { status?: string };

    if (statusData.status === "connected") {
      const sendRes = await fetch(`${bridgeUrl}/api/send-message`, {
        method: "POST",
        headers,
        body: JSON.stringify({ restaurantId: user.restaurantId, phone: customerPhone, message }),
        signal: AbortSignal.timeout(10000),
      });
      const sendData = (await sendRes.json()) as { success?: boolean };
      sentViaBridge = sendData.success === true;
    }
  } catch (err) {
    logger.warn({ error: (err as Error).message }, "[sendSessionBill] bridge exception — using deeplink fallback");
  }

  if (!sentViaBridge) {
    const encodedMessage = encodeURIComponent(message);
    const phone = customerPhone.replace(/\D/g, "");
    whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
  }

  // Store customer_phone and mark bill as sent
  const now = new Date();
  await db
    .update(sessionBills)
    .set({
      status: "sent",
      customerPhone,
      sentAt: now,
      updatedAt: now,
    })
    .where(eq(sessionBills.id, bill.id));

  logger.info(
    {
      sessionId,
      billId: bill.id,
      billNumber: bill.billNumber,
      customerPhone,
      sentViaBridge,
    },
    "[sendSessionBill] bill sent"
  );

  res.json({
    ok: true,
    billNumber: bill.billNumber,
    customerPhone,
    customerName,
    deliveryMethod: sentViaBridge ? "bridge" : "deeplink",
    sent: sentViaBridge,
    whatsappUrl: sentViaBridge ? null : whatsappUrl,
    message,
  });
};

// ─── Sessions: get session bill screenshot (base64 data URL) ──────────────────

const getSessionBillScreenshot: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sessionId = parseInt(String(req.params.sessionId));
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  const [session] = await db
    .select()
    .from(tableSessions)
    .where(and(eq(tableSessions.id, sessionId), eq(tableSessions.restaurantId, user.restaurantId)));

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const [bill] = await db
    .select()
    .from(sessionBills)
    .where(and(eq(sessionBills.sessionId, sessionId), ne(sessionBills.status, "cancelled" as const)))
    .orderBy(desc(sessionBills.createdAt))
    .limit(1);

  if (!bill) { res.status(404).json({ error: "No bill found for this session" }); return; }
  if (!bill.screenshotUrl) { res.status(404).json({ error: "No screenshot available for this bill" }); return; }

  res.json({ screenshotUrl: bill.screenshotUrl });
};

// ─── Sessions: approve payment (bill paid → session closed) ───────────────────

const approveSessionBill: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sessionId = parseInt(String(req.params.sessionId));
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  const [session] = await db
    .select()
    .from(tableSessions)
    .where(and(eq(tableSessions.id, sessionId), eq(tableSessions.restaurantId, user.restaurantId)));

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const [bill] = await db
    .select()
    .from(sessionBills)
    .where(and(eq(sessionBills.sessionId, sessionId), ne(sessionBills.status, "cancelled" as const)))
    .orderBy(desc(sessionBills.createdAt))
    .limit(1);

  if (!bill) { res.status(404).json({ error: "No bill found for this session" }); return; }

  if (bill.status !== "awaiting_verification") {
    res.status(400).json({ error: `Bill must be in 'awaiting_verification' status to approve (current: ${bill.status})` });
    return;
  }

  if (bill.phoneMismatch) {
    res.status(409).json({
      error: "Phone number mismatch — the payment screenshot was sent from a different phone than the one used to place the order. Ask the customer to resend from the original phone.",
      phoneMismatch: true,
      expectedPhone: bill.customerPhone,
      senderPhone: bill.senderPhone,
    });
    return;
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    // Mark bill as paid
    await tx
      .update(sessionBills)
      .set({ status: "paid", verifiedAt: now, verifiedBy: user.id, updatedAt: now })
      .where(eq(sessionBills.id, bill.id));

    // Close the session
    await tx
      .update(tableSessions)
      .set({ status: "closed", updatedAt: now })
      .where(eq(tableSessions.id, sessionId));

    // Mark all orders in the session as paid
    await tx
      .update(orders)
      .set({ paymentStatus: "paid", verifiedBy: user.id, verifiedAt: now, updatedAt: now })
      .where(eq(orders.sessionId, sessionId));
  });

  logger.info(
    { sessionId, billId: bill.id, billNumber: bill.billNumber, verifiedBy: user.id },
    "[approveSessionBill] payment approved — session closed"
  );

  res.json({ ok: true, sessionId, billId: bill.id });
};

// ─── Sessions: reject payment (bill back to 'sent', screenshot preserved) ────

const rejectSessionBill: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sessionId = parseInt(String(req.params.sessionId));
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  const [session] = await db
    .select()
    .from(tableSessions)
    .where(and(eq(tableSessions.id, sessionId), eq(tableSessions.restaurantId, user.restaurantId)));

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const [bill] = await db
    .select()
    .from(sessionBills)
    .where(and(eq(sessionBills.sessionId, sessionId), ne(sessionBills.status, "cancelled" as const)))
    .orderBy(desc(sessionBills.createdAt))
    .limit(1);

  if (!bill) { res.status(404).json({ error: "No bill found for this session" }); return; }

  if (bill.status !== "awaiting_verification") {
    res.status(400).json({ error: `Bill must be in 'awaiting_verification' status to reject (current: ${bill.status})` });
    return;
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    // Roll bill back to 'sent' — screenshot is preserved for reference
    await tx
      .update(sessionBills)
      .set({ status: "sent", verifiedAt: now, verifiedBy: user.id, updatedAt: now })
      .where(eq(sessionBills.id, bill.id));

    // Roll session back to awaiting_payment
    await tx
      .update(tableSessions)
      .set({ status: "awaiting_payment", updatedAt: now })
      .where(eq(tableSessions.id, sessionId));
  });

  logger.info(
    { sessionId, billId: bill.id, billNumber: bill.billNumber, rejectedBy: user.id },
    "[rejectSessionBill] payment rejected — bill rolled back to sent, awaiting new screenshot"
  );

  res.json({ ok: true, sessionId, billId: bill.id });
};

// ─── Sessions: staff manually marks bill paid (cash / no screenshot) ──────────

const markSessionBillPaid: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sessionId = parseInt(String(req.params.sessionId));
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  const [session] = await db
    .select()
    .from(tableSessions)
    .where(and(eq(tableSessions.id, sessionId), eq(tableSessions.restaurantId, user.restaurantId)));

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const [bill] = await db
    .select()
    .from(sessionBills)
    .where(and(eq(sessionBills.sessionId, sessionId), ne(sessionBills.status, "cancelled" as const)))
    .orderBy(desc(sessionBills.createdAt))
    .limit(1);

  if (!bill) { res.status(404).json({ error: "No bill found for this session" }); return; }

  const ALLOWED_STATUSES = ["generated", "sent", "awaiting_verification"];
  if (!ALLOWED_STATUSES.includes(bill.status)) {
    res.status(400).json({
      error: `Bill cannot be manually marked paid from status: ${bill.status}`,
    });
    return;
  }

  const now = new Date();

  const sessionOrders = await db
    .select({ id: orders.id, tableId: orders.tableId })
    .from(orders)
    .where(eq(orders.sessionId, sessionId));

  const tableIds = [
    ...new Set(
      sessionOrders
        .map((o) => o.tableId)
        .filter((id): id is number => id !== null),
    ),
  ];

  await db.transaction(async (tx) => {
    await tx
      .update(sessionBills)
      .set({ status: "paid", verifiedAt: now, verifiedBy: user.id, updatedAt: now })
      .where(eq(sessionBills.id, bill.id));

    await tx
      .update(tableSessions)
      .set({ status: "closed", updatedAt: now })
      .where(eq(tableSessions.id, sessionId));

    await tx
      .update(orders)
      .set({ paymentStatus: "paid", verifiedBy: user.id, verifiedAt: now, updatedAt: now })
      .where(eq(orders.sessionId, sessionId));

    if (tableIds.length > 0) {
      await tx
        .update(restaurantTables)
        .set({ isOccupied: false, updatedAt: now })
        .where(inArray(restaurantTables.id, tableIds));
    }
  });

  logger.info(
    { sessionId, billId: bill.id, billNumber: bill.billNumber, markedBy: user.id, tableIds },
    "[markSessionBillPaid] bill manually marked paid — session closed, tables released",
  );

  res.json({ ok: true, sessionId, billId: bill.id });
};

// ─── Stats ────────────────────────────────────────────────────────────────────

const getStats: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) {
    res.json({
      todayOrders: 0, todayRevenue: 0, activeOrders: 0, pendingOrders: 0,
      totalMenuItems: 0, totalTables: 0,
      subscriptionStatus: "active", customerLimit: 0, customersUsed: 0,
      planId: null, hasPendingUpi: false, upiVerified: false, verifiedAt: null,
    });
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [[todayStats], [activeStats], [pendingStats], [itemCount], [tableCount], [restaurant], pendingUpiTxns] =
    await Promise.all([
      db.select({ count: sql<number>`count(*)::int`, revenue: sql<number>`coalesce(sum(total), 0)::int` })
        .from(orders)
        .where(and(eq(orders.restaurantId, user.restaurantId), gte(orders.createdAt, today))),
      db.select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(eq(orders.restaurantId, user.restaurantId), inArray(orders.status, ["pending", "confirmed", "preparing", "ready"]))),
      db.select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(eq(orders.restaurantId, user.restaurantId), eq(orders.status, "pending"))),
      db.select({ count: sql<number>`count(*)::int` })
        .from(menuItems).where(eq(menuItems.restaurantId, user.restaurantId)),
      db.select({ count: sql<number>`count(*)::int` })
        .from(restaurantTables).where(eq(restaurantTables.restaurantId, user.restaurantId)),
      db.select().from(restaurants).where(eq(restaurants.id, user.restaurantId)).limit(1),
      db.select().from(subscriptionTransactions)
        .where(and(eq(subscriptionTransactions.restaurantId, user.restaurantId), eq(subscriptionTransactions.status, "pending"))),
    ]);

  // Auto-expire: if subscription has passed expiry date and is still 'active', mark as 'expired'
  let effectiveStatus = restaurant?.subscriptionStatus ?? "active";
  if (
    restaurant &&
    effectiveStatus === "active" &&
    restaurant.subscriptionExpiresAt &&
    restaurant.subscriptionExpiresAt < new Date() &&
    restaurant.customerLimit > 0
  ) {
    await db
      .update(restaurants)
      .set({ subscriptionStatus: "expired" })
      .where(eq(restaurants.id, user.restaurantId!));
    effectiveStatus = "expired";
  }

  res.json({
    todayOrders: todayStats?.count ?? 0,
    todayRevenue: todayStats?.revenue ?? 0,
    activeOrders: activeStats?.count ?? 0,
    pendingOrders: pendingStats?.count ?? 0,
    totalMenuItems: itemCount?.count ?? 0,
    totalTables: tableCount?.count ?? 0,
    subscriptionStatus: effectiveStatus,
    customerLimit: restaurant?.customerLimit ?? 0,
    customersUsed: restaurant?.customersUsed ?? 0,
    subscriptionExpiresAt: restaurant?.subscriptionExpiresAt?.toISOString() ?? null,
    subscriptionStartedAt: restaurant?.subscriptionStartedAt?.toISOString() ?? null,
    planId: restaurant?.planId ?? null,
    hasPendingUpi: pendingUpiTxns.length > 0,
    upiVerified: restaurant?.upiVerified ?? false,
    verifiedAt: restaurant?.verifiedAt?.toISOString() ?? null,
  });
};

// ─── Account: change login email / password ───────────────────────────────────

const updateAccount: RequestHandler = async (req, res) => {
  const user = req.user!;
  const { currentPassword, newEmail, newPassword } = req.body as {
    currentPassword: string;
    newEmail?: string;
    newPassword?: string;
  };

  if (!currentPassword) {
    res.status(400).json({ error: "Current password is required" });
    return;
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!dbUser) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, dbUser.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const updates: Record<string, unknown> = {};

  if (newEmail && newEmail !== dbUser.email) {
    const [existing] = await db.select().from(users).where(eq(users.email, newEmail.toLowerCase())).limit(1);
    if (existing) {
      res.status(409).json({ error: "That email is already registered to another account" });
      return;
    }
    updates.email = newEmail.toLowerCase();
  }

  if (newPassword) {
    if (newPassword.length < 6) {
      res.status(400).json({ error: "New password must be at least 6 characters" });
      return;
    }
    updates.passwordHash = await bcrypt.hash(newPassword, 10);
    updates.tempPassword = null;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  await db.update(users).set(updates).where(eq(users.id, user.id));

  // ── Mirror users.email → restaurants.email (sync guardian) ────────────────
  // Whenever the login email changes, immediately propagate it to
  // restaurants.email so the two fields can never drift out of sync.
  if (updates.email && user.restaurantId) {
    await db
      .update(restaurants)
      .set({ email: updates.email as string })
      .where(eq(restaurants.id, user.restaurantId));
    req.log.info(
      { userId: user.id, restaurantId: user.restaurantId, newEmail: updates.email },
      "[EMAIL_SYNC] users.email change mirrored to restaurants.email",
    );
  }

  // ── Post-write assertion ───────────────────────────────────────────────────
  if (user.restaurantId) {
    const [check] = await db
      .select({ rEmail: restaurants.email })
      .from(restaurants)
      .where(eq(restaurants.id, user.restaurantId))
      .limit(1);
    const expectedEmail = (updates.email as string | undefined) ?? user.email;
    if (check && check.rEmail !== expectedEmail) {
      req.log.warn(
        { restaurantEmail: check.rEmail, usersEmail: expectedEmail },
        "[EMAIL_SYNC] Post-write assertion FAILED — restaurants.email still diverges",
      );
    }
  }

  res.json({ ok: true, emailChanged: !!updates.email, passwordChanged: !!updates.passwordHash });
};

// ─── SSE: live order notifications ────────────────────────────────────────────

function streamOrders(req: Request, res: Response) {
  const user = req.user!;
  if (!user.restaurantId) {
    res.status(403).json({ error: "No restaurant" });
    return;
  }
  const restaurantId = user.restaurantId;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  addConnection(restaurantId, res);

  // Keep-alive heartbeat every 25 s (proxy idle timeouts are typically 60 s)
  const heartbeat = setInterval(() => {
    try {
      res.write("event: heartbeat\ndata: {}\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeConnection(restaurantId, res);
  });
}

// ─── History: paginated closed sessions + bills ───────────────────────────────

const getHistory: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.json({ sessions: [], total: 0, page: 1, totalPages: 0 }); return; }

  const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
  const search = (req.query.search as string | undefined)?.trim() ?? "";
  const dateRange = (req.query.dateRange as string | undefined) ?? "";
  const fromParam = req.query.from as string | undefined;
  const toParam = req.query.to as string | undefined;

  const now = new Date();
  let fromDate: Date | null = null;
  let toDate: Date | null = null;

  if (dateRange === "today") {
    fromDate = new Date(now); fromDate.setHours(0, 0, 0, 0);
    toDate = new Date(now); toDate.setHours(23, 59, 59, 999);
  } else if (dateRange === "yesterday") {
    fromDate = new Date(now); fromDate.setDate(fromDate.getDate() - 1); fromDate.setHours(0, 0, 0, 0);
    toDate = new Date(fromDate); toDate.setHours(23, 59, 59, 999);
  } else if (dateRange === "7days") {
    fromDate = new Date(now); fromDate.setDate(fromDate.getDate() - 6); fromDate.setHours(0, 0, 0, 0);
    toDate = new Date(now); toDate.setHours(23, 59, 59, 999);
  } else if (dateRange === "30days") {
    fromDate = new Date(now); fromDate.setDate(fromDate.getDate() - 29); fromDate.setHours(0, 0, 0, 0);
    toDate = new Date(now); toDate.setHours(23, 59, 59, 999);
  } else if (dateRange === "custom" && fromParam && toParam) {
    fromDate = new Date(`${fromParam}T00:00:00`);
    toDate = new Date(`${toParam}T23:59:59`);
  }

  // Build the set of session IDs that match search criteria (bill number, customer, table)
  let searchSessionIds: Set<number> | null = null;
  if (search.length >= 2) {
    const likeSearch = `%${search}%`;
    // Match sessions by table number
    const byTable = await db
      .select({ id: tableSessions.id })
      .from(tableSessions)
      .where(and(
        eq(tableSessions.restaurantId, user.restaurantId),
        sql`${tableSessions.tableNumber} ILIKE ${likeSearch}`,
      ));

    // Match sessions by bill number (exact prefix) or customer phone/name via orders
    const [byBill, byCustomer] = await Promise.all([
      db.select({ sessionId: sessionBills.sessionId })
        .from(sessionBills)
        .where(and(
          eq(sessionBills.restaurantId, user.restaurantId),
          sql`${sessionBills.billNumber} ILIKE ${likeSearch}`,
        )),
      db.select({ sessionId: orders.sessionId })
        .from(orders)
        .where(and(
          eq(orders.restaurantId, user.restaurantId),
          sql`(${orders.customerPhone} ILIKE ${likeSearch} OR ${orders.customerName} ILIKE ${likeSearch})`,
        )),
    ]);

    searchSessionIds = new Set([
      ...byTable.map((r) => r.id),
      ...byBill.map((r) => r.sessionId).filter((id): id is number => id !== null),
      ...byCustomer.map((r) => r.sessionId).filter((id): id is number => id !== null),
    ]);
  }

  // Count total matching sessions
  const baseWhere = and(
    eq(tableSessions.restaurantId, user.restaurantId),
    eq(tableSessions.status, "closed"),
    fromDate ? gte(tableSessions.updatedAt, fromDate) : undefined,
    toDate ? lte(tableSessions.updatedAt, toDate) : undefined,
    searchSessionIds !== null && searchSessionIds.size > 0
      ? inArray(tableSessions.id, [...searchSessionIds])
      : searchSessionIds !== null && searchSessionIds.size === 0
        ? sql`false`
        : undefined,
  );

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tableSessions)
    .where(baseWhere);

  const offset = (page - 1) * limit;

  const sessionRows = await db
    .select()
    .from(tableSessions)
    .where(baseWhere)
    .orderBy(desc(tableSessions.updatedAt))
    .limit(limit)
    .offset(offset);

  if (sessionRows.length === 0) {
    res.json({ sessions: [], total: total ?? 0, page, totalPages: Math.ceil((total ?? 0) / limit) });
    return;
  }

  const sessionIds = sessionRows.map((s) => s.id);

  const [billRows, representativeOrders] = await Promise.all([
    db.select({
      id: sessionBills.id,
      sessionId: sessionBills.sessionId,
      billNumber: sessionBills.billNumber,
      subtotal: sessionBills.subtotal,
      tax: sessionBills.tax,
      total: sessionBills.total,
      status: sessionBills.status,
      customerPhone: sessionBills.customerPhone,
      createdAt: sessionBills.createdAt,
      sentAt: sessionBills.sentAt,
      screenshotReceivedAt: sessionBills.screenshotReceivedAt,
      verifiedAt: sessionBills.verifiedAt,
      verifiedBy: sessionBills.verifiedBy,
      resentAt: sessionBills.resentAt,
      resentCount: sessionBills.resentCount,
      screenshotUrl: sessionBills.screenshotUrl,
    }).from(sessionBills)
      .where(and(
        inArray(sessionBills.sessionId, sessionIds),
        ne(sessionBills.status, "cancelled" as const),
      ))
      .orderBy(desc(sessionBills.createdAt)),
    // One representative order per session for customer name/phone
    db.select({
      sessionId: orders.sessionId,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
    }).from(orders)
      .where(inArray(orders.sessionId, sessionIds))
      .orderBy(desc(orders.createdAt)),
  ]);

  // Resolve verifiedBy user names in one query
  const verifierIds = [...new Set(billRows.map((b) => b.verifiedBy).filter((id): id is number => id !== null))];
  const verifierMap = new Map<number, string>();
  if (verifierIds.length > 0) {
    const verifiers = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, verifierIds));
    for (const v of verifiers) verifierMap.set(v.id, v.name);
  }

  const billBySession = new Map<number, typeof billRows[0]>();
  for (const bill of billRows) {
    if (!billBySession.has(bill.sessionId)) billBySession.set(bill.sessionId, bill);
  }

  const customerBySession = new Map<number, { name: string; phone: string }>();
  for (const o of representativeOrders) {
    if (o.sessionId !== null && !customerBySession.has(o.sessionId)) {
      customerBySession.set(o.sessionId, { name: o.customerName, phone: o.customerPhone });
    }
  }

  const orderCountRows = await db
    .select({ sessionId: orders.sessionId, count: sql<number>`count(*)::int`, items: sql<number>`coalesce(sum(oi.qty),0)::int` })
    .from(orders)
    .leftJoin(
      sql`(SELECT order_id, sum(quantity) as qty FROM order_items GROUP BY order_id) oi`,
      sql`oi.order_id = orders.id`,
    )
    .where(inArray(orders.sessionId, sessionIds))
    .groupBy(orders.sessionId);

  const countBySession = new Map<number, { orderCount: number; itemCount: number }>();
  for (const r of orderCountRows) {
    if (r.sessionId !== null) countBySession.set(r.sessionId, { orderCount: r.count, itemCount: r.items });
  }

  const sessions = sessionRows.map((session) => {
    const bill = billBySession.get(session.id) ?? null;
    const customer = customerBySession.get(session.id) ?? null;
    const counts = countBySession.get(session.id) ?? { orderCount: 0, itemCount: 0 };
    return {
      id: session.id,
      tableNumber: session.tableNumber ?? null,
      sessionType: session.sessionType,
      status: session.status,
      orderCount: counts.orderCount,
      itemCount: counts.itemCount,
      totalAmount: bill?.total ?? 0,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      sessionOpenedAt: session.createdAt.toISOString(),
      sessionClosedAt: session.updatedAt.toISOString(),
      bill: bill ? {
        id: bill.id,
        sessionId: bill.sessionId,
        billNumber: bill.billNumber,
        subtotal: bill.subtotal,
        tax: bill.tax,
        total: bill.total,
        status: bill.status,
        customerPhone: bill.customerPhone ?? null,
        billGeneratedAt: bill.createdAt.toISOString(),
        billSentAt: bill.sentAt?.toISOString() ?? null,
        screenshotReceivedAt: bill.screenshotReceivedAt?.toISOString() ?? null,
        verifiedAt: bill.verifiedAt?.toISOString() ?? null,
        verifiedBy: bill.verifiedBy ?? null,
        verifiedByName: bill.verifiedBy ? (verifierMap.get(bill.verifiedBy) ?? null) : null,
        resentAt: bill.resentAt?.toISOString() ?? null,
        resentCount: bill.resentCount,
        hasScreenshot: !!bill.screenshotUrl,
      } : null,
    };
  });

  res.json({ sessions, total: total ?? 0, page, totalPages: Math.ceil((total ?? 0) / limit) });
};

// ─── History: revenue summary (today / this week / this month from paid bills) ─

const getHistoryRevenue: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.json({ today: 0, thisWeek: 0, thisMonth: 0 }); return; }

  const now = new Date();

  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const revenueRows = await db.select({
    today: sql<number>`coalesce(sum(CASE WHEN ${sessionBills.verifiedAt} >= ${todayStart} THEN ${sessionBills.total} ELSE 0 END), 0)::int`,
    thisWeek: sql<number>`coalesce(sum(CASE WHEN ${sessionBills.verifiedAt} >= ${weekStart} THEN ${sessionBills.total} ELSE 0 END), 0)::int`,
    thisMonth: sql<number>`coalesce(sum(CASE WHEN ${sessionBills.verifiedAt} >= ${monthStart} THEN ${sessionBills.total} ELSE 0 END), 0)::int`,
  })
  .from(sessionBills)
  .where(and(
    eq(sessionBills.restaurantId, user.restaurantId),
    eq(sessionBills.status, "paid"),
  ));

  const row = revenueRows[0];
  res.json({ today: row?.today ?? 0, thisWeek: row?.thisWeek ?? 0, thisMonth: row?.thisMonth ?? 0 });
};

// ─── History: full session detail (orders + items + bill + audit) ─────────────

const getHistorySession: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sessionId = parseInt(String(req.params.sessionId));
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  const [session] = await db
    .select()
    .from(tableSessions)
    .where(and(eq(tableSessions.id, sessionId), eq(tableSessions.restaurantId, user.restaurantId)))
    .limit(1);

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const [bill] = await db
    .select()
    .from(sessionBills)
    .where(and(eq(sessionBills.sessionId, sessionId), ne(sessionBills.status, "cancelled" as const)))
    .orderBy(desc(sessionBills.createdAt))
    .limit(1);

  const sessionOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.sessionId, sessionId))
    .orderBy(desc(orders.createdAt));

  const orderIds = sessionOrders.map((o) => o.id);
  const allItems = orderIds.length > 0
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
    : [];

  const itemsByOrder = new Map<number, typeof allItems>();
  for (const item of allItems) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId)!.push(item);
  }

  let verifiedByName: string | null = null;
  if (bill?.verifiedBy) {
    const [verifier] = await db.select({ name: users.name }).from(users).where(eq(users.id, bill.verifiedBy)).limit(1);
    verifiedByName = verifier?.name ?? null;
  }

  const representativeOrder = sessionOrders[0] ?? null;
  const itemCount = allItems.reduce((sum, item) => sum + item.quantity, 0);

  res.json({
    id: session.id,
    tableNumber: session.tableNumber,
    status: session.status,
    orderCount: sessionOrders.length,
    itemCount,
    totalAmount: bill?.total ?? sessionOrders.reduce((s, o) => s + o.total, 0),
    customerName: representativeOrder?.customerName ?? null,
    customerPhone: representativeOrder?.customerPhone ?? null,
    sessionOpenedAt: session.createdAt.toISOString(),
    sessionClosedAt: session.updatedAt.toISOString(),
    bill: bill ? {
      id: bill.id,
      sessionId: bill.sessionId,
      billNumber: bill.billNumber,
      subtotal: bill.subtotal,
      tax: bill.tax,
      total: bill.total,
      status: bill.status,
      customerPhone: bill.customerPhone ?? null,
      billGeneratedAt: bill.createdAt.toISOString(),
      billSentAt: bill.sentAt?.toISOString() ?? null,
      screenshotReceivedAt: bill.screenshotReceivedAt?.toISOString() ?? null,
      verifiedAt: bill.verifiedAt?.toISOString() ?? null,
      verifiedBy: bill.verifiedBy ?? null,
      verifiedByName,
      resentAt: bill.resentAt?.toISOString() ?? null,
      resentCount: bill.resentCount,
      hasScreenshot: !!bill.screenshotUrl,
    } : null,
    orders: sessionOrders.map((o) => ({
      id: o.id,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      status: o.status,
      subtotal: o.subtotal,
      tax: o.tax,
      total: o.total,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt.toISOString(),
      items: (itemsByOrder.get(o.id) ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        isVeg: item.isVeg,
        notes: item.notes ?? null,
      })),
    })),
  });
};

// ─── History: get screenshot for a historical session bill ────────────────────

const getHistoryScreenshot: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sessionId = parseInt(String(req.params.sessionId));
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  const [session] = await db
    .select({ id: tableSessions.id })
    .from(tableSessions)
    .where(and(eq(tableSessions.id, sessionId), eq(tableSessions.restaurantId, user.restaurantId)))
    .limit(1);

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const [bill] = await db
    .select({ screenshotUrl: sessionBills.screenshotUrl })
    .from(sessionBills)
    .where(and(eq(sessionBills.sessionId, sessionId), ne(sessionBills.status, "cancelled" as const)))
    .orderBy(desc(sessionBills.createdAt))
    .limit(1);

  if (!bill?.screenshotUrl) { res.status(404).json({ error: "No screenshot available" }); return; }

  res.json({ screenshotUrl: bill.screenshotUrl });
};

// ─── History: resend bill for a historical/closed session ─────────────────────

const resendHistoryBill: RequestHandler = async (req, res) => {
  const user = req.user!;
  if (!user.restaurantId) { res.status(403).json({ error: "Forbidden" }); return; }

  const sessionId = parseInt(String(req.params.sessionId));
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid session ID" }); return; }

  const [[session], [restaurant]] = await Promise.all([
    db.select().from(tableSessions)
      .where(and(eq(tableSessions.id, sessionId), eq(tableSessions.restaurantId, user.restaurantId))),
    db.select().from(restaurants).where(eq(restaurants.id, user.restaurantId)).limit(1),
  ]);

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (!restaurant) { res.status(404).json({ error: "Restaurant not found" }); return; }

  const [bill] = await db
    .select()
    .from(sessionBills)
    .where(and(eq(sessionBills.sessionId, sessionId), ne(sessionBills.status, "cancelled" as const)))
    .orderBy(desc(sessionBills.createdAt))
    .limit(1);

  if (!bill) { res.status(404).json({ error: "No bill found for this session" }); return; }

  if (bill.status !== "sent" && bill.status !== "paid") {
    res.status(400).json({ error: `Cannot resend bill in status '${bill.status}'. Only 'sent' or 'paid' bills can be resent.` });
    return;
  }

  const customerPhone = bill.customerPhone;
  if (!customerPhone) { res.status(400).json({ error: "No customer phone recorded on bill — cannot resend" }); return; }

  // Rebuild the bill message
  const sessionOrders = await db
    .select()
    .from(orders)
    .where(and(eq(orders.sessionId, sessionId), ne(orders.status, "cancelled" as const), ne(orders.status, "payment_failed" as const)))
    .orderBy(desc(orders.createdAt));

  const orderIds = sessionOrders.map((o) => o.id);
  const allItems = orderIds.length > 0
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
    : [];

  const itemsByOrder = new Map<number, typeof allItems>();
  for (const item of allItems) {
    if (!itemsByOrder.has(item.orderId)) itemsByOrder.set(item.orderId, []);
    itemsByOrder.get(item.orderId)!.push(item);
  }

  let itemLines = "";
  for (const order of sessionOrders) {
    const lineItems = itemsByOrder.get(order.id) ?? [];
    for (const item of lineItems) {
      itemLines += `  • ${item.quantity}× ${item.name} — ₹${((item.unitPrice * item.quantity) / 100).toFixed(2)}\n`;
    }
  }

  const upiId = restaurant.upiId ?? null;
  const totalStr = (bill.total / 100).toFixed(2);
  const subtotalStr = (bill.subtotal / 100).toFixed(2);
  const taxStr = (bill.tax / 100).toFixed(2);

  const resendTableLabel = deriveTableLabel(sessionOrders, session.tableNumber);
  const resendTablePrefix = (() => {
    const uniqueTables = [...new Set(sessionOrders.map((o) => o.tableNumber).filter(Boolean))];
    return uniqueTables.length > 1 ? "Tables" : "Table";
  })();

  let message = `🧾 *Bill — ${restaurant.name}*\n`;
  message += `${resendTablePrefix}: *${resendTableLabel}*\n`;
  message += `Bill No: ${bill.billNumber}\n\n`;
  if (itemLines) message += `*Items:*\n${itemLines}\n`;
  message += `Subtotal: ₹${subtotalStr}\n`;
  if (bill.tax > 0) message += `Tax: ₹${taxStr}\n`;
  message += `*Total: ₹${totalStr}*\n`;
  if (upiId) {
    message += `\n💳 *Pay via UPI:* ${upiId}\n`;
    message += `Amount: ₹${totalStr}\n`;
    message += `Note: ${bill.billNumber}\n`;
  }
  message += `\nPlease send a screenshot of your payment confirmation to this number. Thank you! 🙏`;

  const sentViaBridge = await tryBridgeSend(user.restaurantId!, customerPhone, message);

  let whatsappUrl: string | null = null;
  if (!sentViaBridge) {
    const phone = customerPhone.replace(/\D/g, "");
    whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  const now = new Date();
  await db.update(sessionBills).set({
    resentAt: now,
    resentCount: bill.resentCount + 1,
    updatedAt: now,
  }).where(eq(sessionBills.id, bill.id));

  logger.info({ sessionId, billId: bill.id, billNumber: bill.billNumber, resentCount: bill.resentCount + 1, sentViaBridge }, "[resendHistoryBill] bill resent");

  res.json({
    ok: true,
    billNumber: bill.billNumber,
    customerPhone,
    deliveryMethod: sentViaBridge ? "bridge" : "deeplink",
    sent: sentViaBridge,
    whatsappUrl: sentViaBridge ? null : whatsappUrl,
    resentCount: bill.resentCount + 1,
  });
};

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/owner/restaurant", requireOwner, getRestaurant);
router.put("/owner/restaurant", requireOwner, updateRestaurant);
router.put("/owner/account", requireOwner, updateAccount);

router.get("/owner/categories", requireOwner, listCategories);
router.post("/owner/categories", requireOwner, createCategory);
router.put("/owner/categories/:categoryId", requireOwner, updateCategory);
router.delete("/owner/categories/:categoryId", requireOwner, deleteCategory);

router.get("/owner/menu-items", requireOwner, listMenuItems);
router.post("/owner/menu-items", requireOwner, createMenuItem);
router.put("/owner/menu-items/:itemId", requireOwner, updateMenuItem);
router.delete("/owner/menu-items/:itemId", requireOwner, deleteMenuItem);

router.get("/owner/tables", requireOwner, listTables);
router.post("/owner/tables", requireOwner, createTable);
router.delete("/owner/tables/:tableId", requireOwner, deleteTable);
router.post("/owner/tables/:tableId/qr", requireOwner, regenerateQr);

router.get("/owner/orders/stream", requireOwner, streamOrders);
router.get("/owner/orders", requireOwner, listOrders);
router.get("/owner/orders/:orderId", requireOwner, getOwnerOrder);
router.put("/owner/orders/:orderId", requireOwner, updateOrder);
router.post("/owner/orders/:orderId/verify-upi", requireOwner, verifyUpiPayment);
router.post("/owner/orders/:orderId/reject-upi", requireOwner, rejectUpiPayment);
router.get("/owner/orders/:orderId/whatsapp", requireOwner, getWhatsappBill);
router.get("/owner/orders/:orderId/bill", requireOwner, getBill);
router.get("/bills/:token/image", serveBillImageRaw); // raw PNG (og:image src)
router.get("/bills/:token", serveBillPage);           // OG HTML page
router.get("/b/:shortId", serveBillShort);            // short URL in WhatsApp messages
router.post("/owner/orders/:orderId/verify-payment", requireOwner, verifyOrderPayment);
router.patch("/owner/orders/:orderId/approve-payment", requireOwner, approvePayment);
router.patch("/owner/orders/:orderId/reject-payment", requireOwner, rejectPayment);
router.post("/owner/orders/:orderId/confirm-staff-payment", requireOwner, confirmStaffPayment);

router.get("/owner/stats", requireOwner, getStats);
router.get("/owner/sessions", requireOwner, listSessions);
router.post("/owner/sessions/:sessionId/bill", requireOwner, generateBill);
router.get("/owner/sessions/:sessionId/bill", requireOwner, getSessionBill);
router.post("/owner/sessions/:sessionId/bill/send", requireOwner, sendSessionBill);
router.get("/owner/sessions/:sessionId/bill/screenshot", requireOwner, getSessionBillScreenshot);
router.patch("/owner/sessions/:sessionId/bill/approve", requireOwner, approveSessionBill);
router.patch("/owner/sessions/:sessionId/bill/reject", requireOwner, rejectSessionBill);
router.patch("/owner/sessions/:sessionId/bill/mark-paid", requireOwner, markSessionBillPaid);
router.get("/owner/customers/analytics", requireOwner, getCustomerAnalytics);

router.get("/owner/history", requireOwner, getHistory);
router.get("/owner/history/revenue", requireOwner, getHistoryRevenue);
router.get("/owner/history/:sessionId", requireOwner, getHistorySession);
router.get("/owner/history/:sessionId/bill/screenshot", requireOwner, getHistoryScreenshot);
router.post("/owner/history/:sessionId/bill/resend", requireOwner, resendHistoryBill);

// ─── Image Upload ─────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — checked by multer before sharp

/** Max dimension (px) — images wider/taller are resized down, preserving aspect ratio */
const MAX_IMAGE_DIMENSION = 1200;

/** WebP quality (0–100). Targets roughly 100–300 KB for food photos */
const WEBP_QUALITY = 80;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error("Only JPG, PNG, and WEBP images are allowed"));
      return;
    }
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      cb(new Error("Only JPG, PNG, and WEBP images are allowed"));
      return;
    }
    cb(null, true);
  },
});

const uploadImage: RequestHandler = async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image file provided" });
    return;
  }
  if (req.file.size === 0) {
    res.status(400).json({ error: "The uploaded file is empty or corrupted" });
    return;
  }
  try {
    // Resize to max 1200 px (width or height) and convert to WebP
    const processed = await sharp(req.file.buffer)
      .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const id = randomUUID();
    await db.insert(imageBlobs).values({
      id,
      data: processed.toString("base64"),
      contentType: "image/webp",
    });

    req.log.info(
      { id, originalBytes: req.file.size, processedBytes: processed.length },
      "Image uploaded and compressed",
    );

    res.json({ imageUrl: `/api/images/${id}` });
  } catch (err) {
    req.log.error({ err }, "Image upload — processing or DB write failed");
    res.status(500).json({ error: "Upload failed. Please try again." });
  }
};

router.post(
  "/owner/upload-image",
  requireOwner,
  (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (!err) { next(); return; }
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ error: `Image must be smaller than 5 MB` });
        } else {
          res.status(400).json({ error: `Upload error: ${err.message}` });
        }
      } else {
        res.status(400).json({ error: (err as Error).message ?? "Invalid image file" });
      }
    });
  },
  uploadImage,
);

export default router;
