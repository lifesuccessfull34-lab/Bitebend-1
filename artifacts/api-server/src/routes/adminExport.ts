import { Router } from "express";
import XLSX from "xlsx";
import { db } from "@workspace/db";
import {
  orders,
  restaurants,
  users,
  subscriptionPlans,
} from "@workspace/db";
import { eq, sql, inArray } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { requireSensitiveAuth } from "../middlewares/auth";
import type { RequestHandler } from "express";

const router = Router();

// ── Shared helpers ─────────────────────────────────────────────────────────

function buildCsvString(rows: Record<string, string | number>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      Object.values(r)
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];
  return "\uFEFF" + lines.join("\n");
}

function buildXlsxBuffer(
  rows: Record<string, string | number>[],
  sheetName: string,
  colWidths: { wch: number }[]
) {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function datePart() {
  return new Date().toISOString().slice(0, 10);
}

function locPart(state: string | undefined, district: string | undefined) {
  if (district && district !== "all") return `-${district.toLowerCase().replace(/\s+/g, "-")}`;
  if (state && state !== "all") return `-${state.toLowerCase().replace(/\s+/g, "-")}`;
  return "";
}

// ── Customer data query ────────────────────────────────────────────────────

async function fetchCustomerRows(params: {
  state?: string;
  district?: string;
  city?: string;
  search?: string;
}) {
  const rows = await db
    .select({
      customerPhone: orders.customerPhone,
      customerName: orders.customerName,
      orderCount: sql<number>`count(*)::int`,
      spent: sql<number>`coalesce(sum(${orders.total}), 0)::float8`,
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
    customerPhone: string;
    customerName: string;
    totalOrders: number;
    totalSpent: number;
    lastOrderAt: string;
    restaurants: Set<string>;
    stateCounts: Map<string, number>;
    districtCounts: Map<string, number>;
    cityCounts: Map<string, number>;
  };

  const grouped = new Map<string, Entry>();
  for (const row of rows) {
    const key = row.customerPhone;
    if (!grouped.has(key)) {
      grouped.set(key, {
        customerPhone: row.customerPhone,
        customerName: row.customerName,
        totalOrders: 0,
        totalSpent: 0,
        lastOrderAt: row.lastOrderAt,
        restaurants: new Set(),
        stateCounts: new Map(),
        districtCounts: new Map(),
        cityCounts: new Map(),
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

  const { state: fs, district: fd, city: fc, search } = params;
  if (fs && fs !== "all") result = result.filter((c) => c.state === fs);
  if (fd && fd !== "all") result = result.filter((c) => c.district === fd);
  if (fc && fc !== "all") result = result.filter((c) => c.city === fc);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((c) => c.customerPhone.includes(q) || c.customerName.toLowerCase().includes(q));
  }

  result.sort((a, b) => b.totalOrders - a.totalOrders);
  return result;
}

function buildCustomerExportRows(data: Awaited<ReturnType<typeof fetchCustomerRows>>) {
  return data.map((c) => ({
    "Customer Name": c.customerName,
    "Phone Number": c.customerPhone,
    "City": c.city ?? "",
    "State": c.state ?? "",
    "Total Orders": c.totalOrders,
    "Total Spent (₹)": Number(c.totalSpent).toFixed(2),
    "Last Order Date": new Date(c.lastOrderAt).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    }),
    "Restaurants": c.restaurants.join("; "),
  }));
}

// ── Restaurant data query ──────────────────────────────────────────────────

async function fetchRestaurantRows(params: {
  state?: string;
  district?: string;
  search?: string;
}) {
  const allRestaurants = await db.select().from(restaurants).orderBy(restaurants.createdAt);

  const ownerIds = allRestaurants.map((r) => r.ownerId).filter(Boolean) as number[];
  const owners = ownerIds.length > 0
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, ownerIds))
    : [];
  const ownerMap = new Map(owners.map((o) => [o.id, o]));

  const planIds = allRestaurants.map((r) => r.planId).filter(Boolean) as number[];
  const plans = planIds.length > 0
    ? await db
        .select({ id: subscriptionPlans.id, name: subscriptionPlans.name })
        .from(subscriptionPlans)
        .where(inArray(subscriptionPlans.id, planIds))
    : [];
  const planMap = new Map(plans.map((p) => [p.id, p.name]));

  const stats = await db
    .select({
      restaurantId: orders.restaurantId,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(total), 0)::float8`,
    })
    .from(orders)
    .groupBy(orders.restaurantId);
  const statsMap = new Map(stats.map((s) => [s.restaurantId, s]));

  let result = allRestaurants.map((r) => ({
    ...r,
    ownerName: r.ownerId ? (ownerMap.get(r.ownerId)?.name ?? null) : null,
    ownerEmail: r.ownerId ? (ownerMap.get(r.ownerId)?.email ?? null) : null,
    totalOrders: statsMap.get(r.id)?.count ?? 0,
    totalRevenue: statsMap.get(r.id)?.revenue ?? 0,
    planName: r.planId ? (planMap.get(r.planId) ?? null) : null,
  }));

  const { state: fs, district: fd, search } = params;
  if (fs && fs !== "all") result = result.filter((r) => r.state === fs);
  if (fd && fd !== "all") result = result.filter((r) => r.district === fd);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((r) => r.name.toLowerCase().includes(q) || (r.ownerEmail ?? "").toLowerCase().includes(q));
  }

  return result;
}

function buildRestaurantExportRows(data: Awaited<ReturnType<typeof fetchRestaurantRows>>) {
  return data.map((r) => ({
    "Restaurant Name": r.name,
    "Owner Email": r.ownerEmail ?? "",
    "Owner Phone": r.phone ?? "",
    "City": r.city,
    "District": r.district ?? "",
    "State": r.state ?? "",
    "Cuisine": r.cuisineType.replace(/_/g, " "),
    "Plan": r.planName ?? "",
    "Customers Used": r.customersUsed,
    "Customer Limit": (r.customerLimit ?? 0) >= 999999 ? "Unlimited" : (r.customerLimit ?? 0),
    "Total Orders": r.totalOrders,
    "Total Revenue (₹)": Number(r.totalRevenue).toFixed(2),
    "Status": r.subscriptionStatus ?? "",
    "Joined": new Date(r.createdAt).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    }),
  }));
}

// ── Export route handlers ──────────────────────────────────────────────────

const exportCustomersCSV: RequestHandler = async (req, res) => {
  const { state, district, city, search } = req.query as Record<string, string | undefined>;
  const data = await fetchCustomerRows({ state, district, city, search });
  const rows = buildCustomerExportRows(data);
  const loc = locPart(state, district);
  const filename = `customers${loc}-${datePart()}.csv`;

  req.log.info({
    event: "sensitive_export_downloaded",
    portal: "admin",
    userId: req.user!.id,
    ip: req.ip,
    exportType: "customers_csv",
    rowCount: rows.length,
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buildCsvString(rows));
};

const exportCustomersXLSX: RequestHandler = async (req, res) => {
  const { state, district, city, search } = req.query as Record<string, string | undefined>;
  const data = await fetchCustomerRows({ state, district, city, search });
  const rows = buildCustomerExportRows(data);
  const loc = locPart(state, district);
  const filename = `customers${loc}-${datePart()}.xlsx`;
  const buf = buildXlsxBuffer(rows, "Customers", [
    { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 18 },
    { wch: 13 }, { wch: 16 }, { wch: 18 }, { wch: 36 },
  ]);

  req.log.info({
    event: "sensitive_export_downloaded",
    portal: "admin",
    userId: req.user!.id,
    ip: req.ip,
    exportType: "customers_xlsx",
    rowCount: rows.length,
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
};

const exportRestaurantsCSV: RequestHandler = async (req, res) => {
  const { state, district, search } = req.query as Record<string, string | undefined>;
  const data = await fetchRestaurantRows({ state, district, search });
  const rows = buildRestaurantExportRows(data);
  const loc = locPart(state, district);
  const filename = `restaurants${loc}-${datePart()}.csv`;

  req.log.info({
    event: "sensitive_export_downloaded",
    portal: "admin",
    userId: req.user!.id,
    ip: req.ip,
    exportType: "restaurants_csv",
    rowCount: rows.length,
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buildCsvString(rows));
};

const exportRestaurantsXLSX: RequestHandler = async (req, res) => {
  const { state, district, search } = req.query as Record<string, string | undefined>;
  const data = await fetchRestaurantRows({ state, district, search });
  const rows = buildRestaurantExportRows(data);
  const loc = locPart(state, district);
  const filename = `restaurants${loc}-${datePart()}.xlsx`;
  const buf = buildXlsxBuffer(rows, "Restaurants", [
    { wch: 24 }, { wch: 26 }, { wch: 16 }, { wch: 16 },
    { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 16 },
    { wch: 12 }, { wch: 16 },
  ]);

  req.log.info({
    event: "sensitive_export_downloaded",
    portal: "admin",
    userId: req.user!.id,
    ip: req.ip,
    exportType: "restaurants_xlsx",
    rowCount: rows.length,
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
};

router.get("/admin/export/customers.csv", requireAdmin, requireSensitiveAuth, exportCustomersCSV);
router.get("/admin/export/customers.xlsx", requireAdmin, requireSensitiveAuth, exportCustomersXLSX);
router.get("/admin/export/restaurants.csv", requireAdmin, requireSensitiveAuth, exportRestaurantsCSV);
router.get("/admin/export/restaurants.xlsx", requireAdmin, requireSensitiveAuth, exportRestaurantsXLSX);

export default router;
