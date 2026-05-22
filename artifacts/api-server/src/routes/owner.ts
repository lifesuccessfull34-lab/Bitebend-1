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
} from "@workspace/db";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { requireOwner } from "../middlewares/auth";
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
    upiId, upiName, personalUpiEnabled, whatsappNumber, taxPercent, seatingLabel, razorpayKeyId, razorpayKeySecret, razorpayWebhookSecret,
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
  if (email !== undefined) updates.email = email;
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
  if (razorpayKeyId !== undefined) updates.razorpayKeyId = razorpayKeyId;
  if (razorpayKeySecret !== undefined) updates.razorpayKeySecret = razorpayKeySecret;
  if (razorpayWebhookSecret !== undefined) updates.razorpayWebhookSecret = razorpayWebhookSecret;

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

  res.json(allOrders.map((o) => ({ ...o, items: itemsByOrder.get(o.id) ?? [] })));
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

  req.log.info({ orderId, restaurantId: user.restaurantId, shortId }, "bill_send_success");

  res.json({
    billUrl: shortUrl,
    whatsappUrl,
    message,
    total: order.total,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    restaurantName: restaurant?.name ?? "Restaurant",
    tableNumber: order.tableNumber ?? null,
    // full token URL for direct image access if needed
    imageUrl: `${billUrl}/image`,
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

  await db
    .update(orders)
    .set({ paymentStatus: "paid", paymentVerificationStatus: "approved", updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  req.log.info({ orderId }, "Payment manually approved");
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

  req.log.info({ orderId }, "Payment rejected");
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

router.get("/owner/stats", requireOwner, getStats);
router.get("/owner/customers/analytics", requireOwner, getCustomerAnalytics);

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
