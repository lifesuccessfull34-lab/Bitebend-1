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
    upiId, whatsappNumber, taxPercent, seatingLabel, razorpayKeyId, razorpayKeySecret,
  } = req.body as Record<string, unknown>;

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
  if (whatsappNumber !== undefined) updates.whatsappNumber = whatsappNumber;
  if (taxPercent !== undefined) updates.taxPercent = taxPercent;
  if (seatingLabel !== undefined) updates.seatingLabel = seatingLabel;
  if (razorpayKeyId !== undefined) updates.razorpayKeyId = razorpayKeyId;
  if (razorpayKeySecret !== undefined) updates.razorpayKeySecret = razorpayKeySecret;

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
    res.json(updated);
  } catch (err) {
    req.log.error(err, "updateRestaurant failed");
    res.status(500).json({ error: "Failed to save restaurant" });
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
  msg += `Order #${order.id} | Table: ${order.tableNumber ?? "Takeaway"}\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  for (const item of items) {
    msg += `${item.quantity}x ${item.name} — ₹${item.unitPrice * item.quantity}\n`;
  }
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `Subtotal: ₹${order.subtotal}\n`;
  if (order.tax > 0) msg += `Tax (${restaurant?.taxPercent ?? 5}%): ₹${order.tax}\n`;
  msg += `*Total: ₹${order.total}*\n`;
  if (restaurant?.upiId) {
    msg += `\nPay via UPI: ${restaurant.upiId}`;
  }
  msg += `\n\nThank you for dining with us! 🙏`;

  // Always send to the customer's phone — strip non-digits then ensure IN country code
  const rawPhone = order.customerPhone.replace(/\D/g, "");
  const phone = rawPhone.startsWith("91") && rawPhone.length === 12
    ? rawPhone
    : rawPhone.length === 10
      ? `91${rawPhone}`
      : rawPhone;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

  res.json({ url, message: msg });
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
      planId: null, hasPendingUpi: false,
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
router.get("/owner/orders/:orderId/whatsapp", requireOwner, getWhatsappBill);

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
