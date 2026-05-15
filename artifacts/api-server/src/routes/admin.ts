import { Router } from "express";
import bcrypt from "bcrypt";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WORKSPACE_ROOT } from "../lib/workspace";
import { db } from "@workspace/db";
import {
  restaurants,
  users,
  orders,
  subscriptionPlans,
  subscriptionTransactions,
  notifications,
  menuCategories,
  menuItems,
  restaurantTables,
  platformSettings,
} from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import type { RequestHandler } from "express";

const router = Router();

// ── Restaurants ────────────────────────────────────────────────────────────

const listRestaurants: RequestHandler = async (_req, res) => {
  const allRestaurants = await db.select().from(restaurants).orderBy(restaurants.createdAt);

  const ownerIds = allRestaurants.map((r) => r.ownerId).filter(Boolean) as number[];
  const owners = ownerIds.length > 0
    ? await db.select({ id: users.id, name: users.name, email: users.email, tempPassword: users.tempPassword }).from(users)
    : [];
  const ownerMap = new Map(owners.map((o) => [o.id, o]));

  const planIds = allRestaurants.map((r) => r.planId).filter(Boolean) as number[];
  const plans = planIds.length > 0
    ? await db.select({ id: subscriptionPlans.id, name: subscriptionPlans.name }).from(subscriptionPlans).where(inArray(subscriptionPlans.id, planIds))
    : [];
  const planMap = new Map(plans.map((p) => [p.id, p.name]));

  const stats = await db
    .select({
      restaurantId: orders.restaurantId,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(total), 0)::int`,
    })
    .from(orders)
    .groupBy(orders.restaurantId);
  const statsMap = new Map(stats.map((s) => [s.restaurantId, s]));

  const result = allRestaurants.map((r) => ({
    ...r,
    ownerName: r.ownerId ? ownerMap.get(r.ownerId)?.name ?? null : null,
    ownerEmail: r.ownerId ? ownerMap.get(r.ownerId)?.email ?? null : null,
    ownerTempPassword: r.ownerId ? ownerMap.get(r.ownerId)?.tempPassword ?? null : null,
    ownerPhone: r.phone ?? null,
    totalOrders: statsMap.get(r.id)?.count ?? 0,
    totalRevenue: statsMap.get(r.id)?.revenue ?? 0,
    planName: r.planId ? planMap.get(r.planId) ?? null : null,
  }));

  res.json(result);
};

const toggleRestaurant: RequestHandler = async (req, res) => {
  const restaurantId = parseInt(String(req.params.restaurantId));
  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  if (!restaurant) { res.status(404).json({ error: "Restaurant not found" }); return; }
  const [updated] = await db
    .update(restaurants)
    .set({ isActive: !restaurant.isActive })
    .where(eq(restaurants.id, restaurantId))
    .returning();
  res.json(updated);
};

const suspendRestaurant: RequestHandler = async (req, res) => {
  const restaurantId = parseInt(String(req.params.restaurantId));
  const { reason } = req.body as { reason?: string };
  const [updated] = await db
    .update(restaurants)
    .set({ isActive: false, subscriptionStatus: "suspended", approvalNote: reason ?? null })
    .where(eq(restaurants.id, restaurantId))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  await db.insert(notifications).values({
    restaurantId,
    title: "Account Suspended",
    message: reason ?? "Your account has been suspended by the admin. Please contact support.",
    type: "error",
  });
  res.json(updated);
};

const activateRestaurant: RequestHandler = async (req, res) => {
  const restaurantId = parseInt(String(req.params.restaurantId));

  // Fetch restaurant to look up current plan's validity
  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }

  let expiry: Date;
  if (restaurant.planId) {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, restaurant.planId)).limit(1);
    expiry = computeExpiry(plan?.validityType ?? "days", plan?.validityValue ?? 30);
  } else {
    expiry = computeExpiry("days", 30);
  }
  const now = new Date();

  const [updated] = await db
    .update(restaurants)
    .set({
      isActive: true,
      subscriptionStatus: "active",
      approvalNote: null,
      subscriptionExpiresAt: expiry,
      subscriptionStartedAt: now,
    })
    .where(eq(restaurants.id, restaurantId))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  await db.insert(notifications).values({
    restaurantId,
    title: "Account Activated",
    message: "Your account has been activated. You can now accept orders.",
    type: "success",
  });
  res.json(updated);
};

const deleteRestaurant: RequestHandler = async (req, res) => {
  const restaurantId = parseInt(String(req.params.restaurantId));
  await db.delete(restaurants).where(eq(restaurants.id, restaurantId));
  res.status(204).send();
};

// ── Subscription Plans (admin CRUD) ────────────────────────────────────────

function computeExpiry(validityType: string, validityValue: number): Date {
  const d = new Date();
  if (validityType === "months") {
    d.setMonth(d.getMonth() + validityValue);
  } else {
    d.setDate(d.getDate() + validityValue);
  }
  return d;
}

const listPlansAdmin: RequestHandler = async (_req, res) => {
  const plans = await db.select().from(subscriptionPlans).orderBy(subscriptionPlans.displayOrder);
  res.json(plans);
};

const createPlan: RequestHandler = async (req, res) => {
  const { name, price, customerLimit, description, displayOrder, validityType, validityValue } = req.body as {
    name: string; price: number; customerLimit: number; description?: string; displayOrder?: number;
    validityType?: "days" | "months"; validityValue?: number;
  };
  const [plan] = await db.insert(subscriptionPlans).values({
    name, price, customerLimit, description: description ?? null,
    displayOrder: displayOrder ?? 0, isActive: true,
    ...(validityType !== undefined && { validityType }),
    ...(validityValue !== undefined && { validityValue }),
  }).returning();
  res.status(201).json(plan);
};

const updatePlan: RequestHandler = async (req, res) => {
  const planId = parseInt(String(req.params.planId));
  const { name, price, customerLimit, description, isActive, displayOrder, validityType, validityValue } = req.body as {
    name?: string; price?: number; customerLimit?: number; description?: string; isActive?: boolean; displayOrder?: number;
    validityType?: "days" | "months"; validityValue?: number;
  };
  const [plan] = await db
    .update(subscriptionPlans)
    .set({
      ...(name !== undefined && { name }),
      ...(price !== undefined && { price }),
      ...(customerLimit !== undefined && { customerLimit }),
      ...(description !== undefined && { description }),
      ...(isActive !== undefined && { isActive }),
      ...(displayOrder !== undefined && { displayOrder }),
      ...(validityType !== undefined && { validityType }),
      ...(validityValue !== undefined && { validityValue }),
    })
    .where(eq(subscriptionPlans.id, planId))
    .returning();
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(plan);
};

const deletePlan: RequestHandler = async (req, res) => {
  const planId = parseInt(String(req.params.planId));
  await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
  res.status(204).send();
};

// ── Subscription Transactions ──────────────────────────────────────────────

const listTransactions: RequestHandler = async (_req, res) => {
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
      restaurantName: restaurants.name,
      restaurantState: restaurants.state,
      restaurantDistrict: restaurants.district,
    })
    .from(subscriptionTransactions)
    .leftJoin(subscriptionPlans, eq(subscriptionTransactions.planId, subscriptionPlans.id))
    .leftJoin(restaurants, eq(subscriptionTransactions.restaurantId, restaurants.id))
    .orderBy(sql`${subscriptionTransactions.createdAt} DESC`)
    .limit(200);
  res.json(rows);
};

const markTransactionPaid: RequestHandler = async (req, res) => {
  const txnId = parseInt(String(req.params.txnId));
  const [txn] = await db
    .select()
    .from(subscriptionTransactions)
    .where(eq(subscriptionTransactions.id, txnId))
    .limit(1);
  if (!txn) { res.status(404).json({ error: "Transaction not found" }); return; }

  // Fetch plan first to compute validity-based expiry
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, txn.planId)).limit(1);
  const now = new Date();
  const expiry = computeExpiry(plan?.validityType ?? "days", plan?.validityValue ?? 30);

  await db.update(subscriptionTransactions).set({ status: "paid" }).where(eq(subscriptionTransactions.id, txnId));
  await db
    .update(restaurants)
    .set({
      planId: txn.planId,
      customerLimit: sql`customer_limit + ${txn.customersAdded}`,
      customersUsed: 0,
      subscriptionStatus: "active",
      subscriptionExpiresAt: expiry,
      subscriptionStartedAt: now,
      isActive: true,
    })
    .where(eq(restaurants.id, txn.restaurantId));

  const expiryLabel = expiry.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  await db.insert(notifications).values({
    restaurantId: txn.restaurantId,
    title: "Payment Confirmed",
    message: `Your payment for ${plan?.name ?? "plan"} has been confirmed. ${txn.customersAdded.toLocaleString()} customers added. Valid till ${expiryLabel}.`,
    type: "success",
  });

  res.json({ ok: true });
};

const rejectTransaction: RequestHandler = async (req, res) => {
  const txnId = parseInt(String(req.params.txnId));
  const [txn] = await db
    .select()
    .from(subscriptionTransactions)
    .where(eq(subscriptionTransactions.id, txnId))
    .limit(1);
  if (!txn) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (txn.status !== "pending") {
    res.status(409).json({ error: "Only pending transactions can be rejected." });
    return;
  }

  await db.update(subscriptionTransactions).set({ status: "failed" }).where(eq(subscriptionTransactions.id, txnId));

  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, txn.planId)).limit(1);
  await db.insert(notifications).values({
    restaurantId: txn.restaurantId,
    title: "Payment Not Verified",
    message: `Your UPI payment for ${plan?.name ?? "plan"} could not be verified. Please contact support or try again with a valid UTR reference.`,
    type: "error",
  });

  res.json({ ok: true });
};

// ── Platform Stats ─────────────────────────────────────────────────────────

const getAdminStats: RequestHandler = async (_req, res) => {
  const [totalRest] = await db.select({ count: sql<number>`count(*)::int` }).from(restaurants);
  const [activeRest] = await db.select({ count: sql<number>`count(*)::int` }).from(restaurants).where(eq(restaurants.isActive, true));
  const [suspendedRest] = await db.select({ count: sql<number>`count(*)::int` }).from(restaurants).where(eq(restaurants.subscriptionStatus, "suspended"));
  const [exhaustedRest] = await db.select({ count: sql<number>`count(*)::int` }).from(restaurants).where(eq(restaurants.subscriptionStatus, "exhausted"));
  const [orderStats] = await db.select({ count: sql<number>`count(*)::int`, revenue: sql<number>`coalesce(sum(total), 0)::int` }).from(orders);
  const [customerStats] = await db.select({ count: sql<number>`count(distinct customer_phone)::int` }).from(orders);
  const [subRev] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)::int` }).from(subscriptionTransactions).where(eq(subscriptionTransactions.status, "paid"));

  res.json({
    totalRestaurants: totalRest?.count ?? 0,
    activeRestaurants: activeRest?.count ?? 0,
    suspendedRestaurants: suspendedRest?.count ?? 0,
    exhaustedRestaurants: exhaustedRest?.count ?? 0,
    totalOrders: orderStats?.count ?? 0,
    totalRevenue: orderStats?.revenue ?? 0,
    totalCustomers: customerStats?.count ?? 0,
    subscriptionRevenue: subRev?.total ?? 0,
  });
};

// ── All Orders (cross-platform) ────────────────────────────────────────────

const listAllOrders: RequestHandler = async (_req, res) => {
  const rows = await db
    .select({
      id: orders.id,
      restaurantId: orders.restaurantId,
      restaurantName: restaurants.name,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      status: orders.status,
      total: orders.total,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .leftJoin(restaurants, eq(orders.restaurantId, restaurants.id))
    .orderBy(sql`${orders.createdAt} DESC`)
    .limit(500);
  res.json(rows);
};

// ── Customers ──────────────────────────────────────────────────────────────

const listCustomers: RequestHandler = async (req, res) => {
  const { state: fs, district: fd, city: fc, search } = req.query as Record<string, string | undefined>;

  const rows = await db
    .select({
      customerPhone: orders.customerPhone,
      customerName: orders.customerName,
      orderCount: sql<number>`count(*)::int`,
      spent: sql<number>`coalesce(sum(${orders.total}), 0)::int`,
      lastOrderAt: sql<string>`max(${orders.createdAt})::text`,
      restaurantName: restaurants.name,
      state: restaurants.state,
      district: restaurants.district,
      city: restaurants.city,
    })
    .from(orders)
    .leftJoin(restaurants, eq(orders.restaurantId, restaurants.id))
    .groupBy(
      orders.customerPhone,
      orders.customerName,
      restaurants.id,
      restaurants.name,
      restaurants.state,
      restaurants.district,
      restaurants.city,
    );

  type Entry = {
    customerPhone: string; customerName: string;
    totalOrders: number; totalSpent: number; lastOrderAt: string;
    restaurants: Set<string>;
    stateCounts: Map<string, number>; districtCounts: Map<string, number>; cityCounts: Map<string, number>;
  };

  const grouped = new Map<string, Entry>();
  for (const row of rows) {
    const key = row.customerPhone;
    if (!grouped.has(key)) {
      grouped.set(key, {
        customerPhone: row.customerPhone, customerName: row.customerName,
        totalOrders: 0, totalSpent: 0, lastOrderAt: row.lastOrderAt,
        restaurants: new Set(),
        stateCounts: new Map(), districtCounts: new Map(), cityCounts: new Map(),
      });
    }
    const e = grouped.get(key)!;
    e.totalOrders += row.orderCount;
    e.totalSpent += row.spent;
    if (row.lastOrderAt > e.lastOrderAt) e.lastOrderAt = row.lastOrderAt;
    if (row.restaurantName) e.restaurants.add(row.restaurantName);
    const cnt = row.orderCount;
    if (row.state) e.stateCounts.set(row.state, (e.stateCounts.get(row.state) ?? 0) + cnt);
    if (row.district) e.districtCounts.set(row.district, (e.districtCounts.get(row.district) ?? 0) + cnt);
    if (row.city) e.cityCounts.set(row.city, (e.cityCounts.get(row.city) ?? 0) + cnt);
  }

  const mode = (map: Map<string, number>): string | null => {
    let best: string | null = null, bestN = 0;
    for (const [k, v] of map) if (v > bestN) { best = k; bestN = v; }
    return best;
  };

  let result = [...grouped.values()].map((c) => ({
    customerPhone: c.customerPhone,
    customerName: c.customerName,
    totalOrders: c.totalOrders,
    totalSpent: c.totalSpent,
    lastOrderAt: c.lastOrderAt,
    restaurants: [...c.restaurants],
    state: mode(c.stateCounts),
    district: mode(c.districtCounts),
    city: mode(c.cityCounts),
  }));

  if (fs && fs !== "all") result = result.filter((c) => c.state === fs);
  if (fd && fd !== "all") result = result.filter((c) => c.district === fd);
  if (fc && fc !== "all") result = result.filter((c) => c.city === fc);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((c) => c.customerPhone.includes(q) || c.customerName.toLowerCase().includes(q));
  }

  result.sort((a, b) => b.totalOrders - a.totalOrders);
  res.json(result);
};

// ── Payment Settings ───────────────────────────────────────────────────────

const SETTINGS_KEYS = ["platform_upi_id", "razorpay_key_id", "razorpay_key_secret"] as const;

async function getPlatformSettings() {
  const rows = await db.select().from(platformSettings)
    .where(inArray(platformSettings.key, [...SETTINGS_KEYS]));
  return new Map(rows.map((r) => [r.key, r.value]));
}

async function upsertSetting(key: string, value: string) {
  await db
    .insert(platformSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
}

const getPaymentSettings: RequestHandler = async (_req, res) => {
  const settings = await getPlatformSettings();
  const upiId = settings.get("platform_upi_id") ?? process.env.PLATFORM_UPI_ID ?? "bitebend@upi";
  const dbKeyId = settings.get("razorpay_key_id");
  const dbKeySecret = settings.get("razorpay_key_secret");
  const keyId = dbKeyId ?? process.env.RAZORPAY_KEY_ID ?? null;
  const keySecret = dbKeySecret ?? process.env.RAZORPAY_KEY_SECRET ?? null;
  const razorpayConfigured = !!(keyId && keySecret);

  const [pendingRow] = await db
    .select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(amount),0)::int` })
    .from(subscriptionTransactions)
    .where(eq(subscriptionTransactions.status, "pending"));
  const [paidRow] = await db
    .select({ total: sql<number>`coalesce(sum(amount),0)::int` })
    .from(subscriptionTransactions)
    .where(eq(subscriptionTransactions.status, "paid"));

  res.json({
    upiId,
    razorpayConfigured,
    razorpayKeyId: keyId ? keyId.slice(0, 12) + "…" : null,
    pendingCount: pendingRow?.count ?? 0,
    pendingAmount: pendingRow?.total ?? 0,
    collectedAmount: paidRow?.total ?? 0,
  });
};

const updatePaymentSettings: RequestHandler = async (req, res) => {
  const { upiId, razorpayKeyId, razorpayKeySecret, clearRazorpay } = req.body as {
    upiId?: string;
    razorpayKeyId?: string;
    razorpayKeySecret?: string;
    clearRazorpay?: boolean;
  };

  if (upiId !== undefined) {
    await upsertSetting("platform_upi_id", upiId.trim());
  }

  if (clearRazorpay) {
    await db.delete(platformSettings)
      .where(inArray(platformSettings.key, ["razorpay_key_id", "razorpay_key_secret"]));
  } else {
    if (razorpayKeyId !== undefined && razorpayKeyId.trim()) {
      await upsertSetting("razorpay_key_id", razorpayKeyId.trim());
    }
    if (razorpayKeySecret !== undefined && razorpayKeySecret.trim()) {
      await upsertSetting("razorpay_key_secret", razorpayKeySecret.trim());
    }
  }

  res.json({ ok: true });
};

// ── Notifications (send to restaurant) ────────────────────────────────────

const sendNotification: RequestHandler = async (req, res) => {
  const { restaurantId, restaurantIds, title, message, type } = req.body as {
    restaurantId?: number | null;
    restaurantIds?: number[];
    title: string;
    message: string;
    type?: string;
  };

  const notifType = (type as "info" | "warning" | "success" | "error") ?? "info";

  if (Array.isArray(restaurantIds) && restaurantIds.length > 0) {
    const inserted = await db.insert(notifications).values(
      restaurantIds.map((id) => ({ restaurantId: id, title, message, type: notifType }))
    ).returning();
    res.status(201).json(inserted);
    return;
  }

  const [notif] = await db.insert(notifications).values({
    restaurantId: restaurantId ?? null,
    title,
    message,
    type: notifType,
  }).returning();
  res.status(201).json(notif);
};

// ── Admin manage restaurant menu ───────────────────────────────────────────

const getRestaurantMenu: RequestHandler = async (req, res) => {
  const restaurantId = parseInt(String(req.params.restaurantId));
  const cats = await db.select().from(menuCategories).where(eq(menuCategories.restaurantId, restaurantId)).orderBy(menuCategories.displayOrder);
  const items = cats.length > 0
    ? await db.select().from(menuItems).where(eq(menuItems.restaurantId, restaurantId)).orderBy(menuItems.displayOrder)
    : [];
  res.json({ categories: cats, items });
};

const getRestaurantTables: RequestHandler = async (req, res) => {
  const restaurantId = parseInt(String(req.params.restaurantId));
  const tables = await db.select().from(restaurantTables).where(eq(restaurantTables.restaurantId, restaurantId));
  res.json(tables);
};

const resetOwnerPassword: RequestHandler = async (req, res) => {
  const restaurantId = parseInt(String(req.params.restaurantId));
  const [owner] = await db
    .select()
    .from(users)
    .where(eq(users.restaurantId, restaurantId))
    .limit(1);
  if (!owner) {
    res.status(404).json({ error: "Owner not found for this restaurant" });
    return;
  }
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const rand = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const newPassword = rand(4) + "-" + rand(4) + "-" + rand(4);
  const hash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash: hash, tempPassword: newPassword }).where(eq(users.id, owner.id));
  res.json({ email: owner.email, password: newPassword });
};

router.get("/admin/restaurants", requireAdmin, listRestaurants);
router.post("/admin/restaurants/:restaurantId/toggle", requireAdmin, toggleRestaurant);
router.post("/admin/restaurants/:restaurantId/suspend", requireAdmin, suspendRestaurant);
router.post("/admin/restaurants/:restaurantId/activate", requireAdmin, activateRestaurant);
router.delete("/admin/restaurants/:restaurantId", requireAdmin, deleteRestaurant);
router.get("/admin/restaurants/:restaurantId/menu", requireAdmin, getRestaurantMenu);
router.get("/admin/restaurants/:restaurantId/tables", requireAdmin, getRestaurantTables);
router.post("/admin/restaurants/:restaurantId/reset-password", requireAdmin, resetOwnerPassword);

router.get("/admin/plans", requireAdmin, listPlansAdmin);
router.post("/admin/plans", requireAdmin, createPlan);
router.put("/admin/plans/:planId", requireAdmin, updatePlan);
router.delete("/admin/plans/:planId", requireAdmin, deletePlan);

router.get("/admin/transactions", requireAdmin, listTransactions);
router.post("/admin/transactions/:txnId/mark-paid", requireAdmin, markTransactionPaid);
router.post("/admin/transactions/:txnId/reject", requireAdmin, rejectTransaction);

router.get("/admin/stats", requireAdmin, getAdminStats);
router.get("/admin/orders", requireAdmin, listAllOrders);
router.get("/admin/customers", requireAdmin, listCustomers);
router.post("/admin/notifications", requireAdmin, sendNotification);

router.get("/admin/payment-settings", requireAdmin, getPaymentSettings);
router.put("/admin/payment-settings", requireAdmin, updatePaymentSettings);

// ── Build info (admin diagnostics) ────────────────────────────────────────────
//
// Returns backend and frontend build metadata so deployment mismatches are
// immediately detectable from the admin panel or a curl call.
//
// Requires admin session — exposes internal commit hashes and paths.

const getBuildInfo: RequestHandler = (_req, res) => {
  const backend = {
    commit: __BUILD_COMMIT__,
    timestamp: __BUILD_TIME__,
    version: __BUILD_VERSION__,
    env: process.env["NODE_ENV"] ?? "unknown",
  };

  let frontend: unknown = null;
  let manifestEntries = 0;
  let manifestExists = false;

  const buildInfoPath = join(
    WORKSPACE_ROOT,
    "artifacts/menu/dist/public/build-info.json",
  );
  const manifestPath = join(
    WORKSPACE_ROOT,
    "artifacts/menu/dist/public/.vite/manifest.json",
  );

  if (existsSync(buildInfoPath)) {
    try {
      frontend = JSON.parse(readFileSync(buildInfoPath, "utf-8"));
    } catch {
      frontend = { error: "parse failed" };
    }
  }

  if (existsSync(manifestPath)) {
    manifestExists = true;
    try {
      const m = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
      manifestEntries = Object.keys(m).length;
    } catch {}
  }

  const commitMatch =
    frontend !== null &&
    typeof frontend === "object" &&
    "commit" in frontend &&
    (frontend as { commit: string }).commit === backend.commit;

  res.json({
    backend,
    frontend,
    commitMatch,
    manifestExists,
    manifestEntries,
    checkedAt: new Date().toISOString(),
  });
};

router.get("/admin/build-info", requireAdmin, getBuildInfo);

export default router;
