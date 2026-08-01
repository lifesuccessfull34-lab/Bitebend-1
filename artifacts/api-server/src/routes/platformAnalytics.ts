/**
 * Platform Analytics Routes
 *
 * POST /platform/analytics/visit      — public; called fire-and-forget from /login
 * GET  /platform/analytics/dashboard  — admin only
 * GET  /platform/analytics/traffic    — admin only
 * GET  /platform/analytics/campaigns  — admin only
 * GET  /platform/analytics/pages      — admin only
 * GET  /platform/analytics/chart      — admin only
 * GET  /platform/analytics/online     — admin only
 *
 * Privacy guarantees:
 *  - DNT: 1 header → silently ignored (no DB write)
 *  - IP hashed with SHA-256; raw IP never persisted
 *  - No PII stored (no names, emails, etc.)
 */

import { Router, type RequestHandler } from "express";
import { createHash } from "crypto";
import { db, visitorSessions, pageViews } from "@workspace/db";
import { eq, sql, gte, and, lt, count } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function getClientIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

function parseUserAgent(ua: string): { browser: string; os: string; device: string } {
  let browser = "Unknown";
  let os = "Unknown";
  let device = "Desktop";

  // Device
  if (/mobile|android|iphone|ipod/i.test(ua)) device = "Mobile";
  else if (/ipad|tablet/i.test(ua)) device = "Tablet";

  // Browser
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = "Opera";
  else if (/chrome\/[0-9]/i.test(ua) && !/chromium/i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/msie|trident/i.test(ua)) browser = "IE";

  // OS
  if (/windows nt/i.test(ua)) os = "Windows";
  else if (/mac os x/i.test(ua) && !/iphone|ipad|ipod/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua) && !/android/i.test(ua)) os = "Linux";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/cros/i.test(ua)) os = "ChromeOS";

  return { browser, os, device };
}

type TrafficSource =
  | "WhatsApp"
  | "Facebook"
  | "Instagram"
  | "Google"
  | "Direct"
  | "Referral"
  | "Unknown";

function classifySource(
  referrer: string | null | undefined,
  utmSource: string | null | undefined,
): TrafficSource {
  const src = (utmSource ?? "").toLowerCase();
  const ref = (referrer ?? "").toLowerCase();

  if (src === "whatsapp" || ref.includes("whatsapp")) return "WhatsApp";
  if (src === "facebook" || ref.includes("facebook.com") || ref.includes("fb.com")) return "Facebook";
  if (src === "instagram" || ref.includes("instagram.com")) return "Instagram";
  if (src === "google" || src === "organic" || ref.includes("google.com")) return "Google";
  if (!referrer && !utmSource) return "Direct";
  if (referrer) return "Referral";
  return "Unknown";
}

/** Midnight UTC for a date offset by `offsetDays` from today. */
function utcMidnight(offsetDays = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

// ── POST /platform/analytics/visit ───────────────────────────────────────────

const recordVisit: RequestHandler = async (req, res) => {
  // Respect Do Not Track
  if (req.headers["dnt"] === "1") {
    res.status(204).end();
    return;
  }

  const {
    visitorId,
    sessionId,
    page,
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    screenWidth,
    screenHeight,
    language,
    timezone,
    userAgent: clientUa,
  } = req.body as {
    visitorId?: string;
    sessionId?: string;
    page?: string;
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    screenWidth?: number;
    screenHeight?: number;
    language?: string;
    timezone?: string;
    userAgent?: string;
  };

  if (!visitorId || !sessionId || !page) {
    res.status(400).json({ error: "visitorId, sessionId and page are required" });
    return;
  }

  const ua = clientUa ?? req.headers["user-agent"] ?? "";
  const { browser, os, device } = parseUserAgent(ua);
  const ip = getClientIp(req);
  const hashedIp = hashIp(ip);

  // Upsert visitor_sessions: one row per visitor_id
  const existing = await db
    .select({ id: visitorSessions.id, isNew: visitorSessions.isNew })
    .from(visitorSessions)
    .where(eq(visitorSessions.visitorId, visitorId))
    .limit(1);

  let sessionRowId: number;

  if (existing.length > 0) {
    const row = existing[0];
    await db
      .update(visitorSessions)
      .set({
        sessionId,
        lastVisit: new Date(),
        visitCount: sql`${visitorSessions.visitCount} + 1`,
        isNew: false,
        language: language ?? undefined,
        timezone: timezone ?? undefined,
        hashedIp,
        updatedAt: new Date(),
      })
      .where(eq(visitorSessions.visitorId, visitorId));
    sessionRowId = row.id;
  } else {
    const [inserted] = await db
      .insert(visitorSessions)
      .values({
        visitorId,
        sessionId,
        isNew: true,
        browser,
        os,
        device,
        language,
        timezone,
        hashedIp,
      })
      .returning({ id: visitorSessions.id });
    sessionRowId = inserted.id;
  }

  // Insert page_views row
  await db.insert(pageViews).values({
    visitorSessionId: sessionRowId,
    page,
    referrer: referrer || null,
    utmSource: utmSource || null,
    utmMedium: utmMedium || null,
    utmCampaign: utmCampaign || null,
    utmContent: utmContent || null,
    screenWidth: screenWidth ?? null,
    screenHeight: screenHeight ?? null,
    userAgent: ua || null,
  });

  res.status(204).end();
};

// ── GET /platform/analytics/dashboard ────────────────────────────────────────

const getDashboard: RequestHandler = async (_req, res) => {
  const now = new Date();
  const todayStart = utcMidnight(0);
  const yesterdayStart = utcMidnight(-1);
  const weekStart = new Date(todayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay()); // Sunday
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const onlineThreshold = new Date(now.getTime() - 5 * 60 * 1000);

  const [
    todayRows,
    yesterdayRows,
    weekRows,
    monthRows,
    totalRows,
    onlineRows,
    newRows,
    returningRows,
  ] = await Promise.all([
    db.select({ c: count() }).from(visitorSessions).where(gte(visitorSessions.lastVisit, todayStart)),
    db.select({ c: count() }).from(visitorSessions).where(
      and(gte(visitorSessions.lastVisit, yesterdayStart), lt(visitorSessions.lastVisit, todayStart)),
    ),
    db.select({ c: count() }).from(visitorSessions).where(gte(visitorSessions.lastVisit, weekStart)),
    db.select({ c: count() }).from(visitorSessions).where(gte(visitorSessions.lastVisit, monthStart)),
    db.select({ c: count() }).from(visitorSessions),
    db.select({ c: count() }).from(visitorSessions).where(gte(visitorSessions.lastVisit, onlineThreshold)),
    db.select({ c: count() }).from(visitorSessions).where(eq(visitorSessions.isNew, true)),
    db.select({ c: count() }).from(visitorSessions).where(eq(visitorSessions.isNew, false)),
  ]);

  res.json({
    today:      todayRows[0].c,
    yesterday:  yesterdayRows[0].c,
    thisWeek:   weekRows[0].c,
    thisMonth:  monthRows[0].c,
    total:      totalRows[0].c,
    online:     onlineRows[0].c,
    newVisitors: newRows[0].c,
    returning:  returningRows[0].c,
  });
};

// ── GET /platform/analytics/chart?range=30d|12w|12m ──────────────────────────

const getChart: RequestHandler = async (req, res) => {
  const range = (req.query.range as string) ?? "30d";

  let rows: { label: string; visitors: number; pageViews: number }[] = [];

  if (range === "30d") {
    // Daily for last 30 days
    const result = await db.execute(sql`
      SELECT
        to_char(pv.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS label,
        COUNT(DISTINCT vs.visitor_id) AS visitors,
        COUNT(*) AS page_views
      FROM page_views pv
      JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
      WHERE pv.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY label
      ORDER BY label ASC
    `);
    rows = (result.rows as { label: string; visitors: string; page_views: string }[]).map((r) => ({
      label: r.label,
      visitors: Number(r.visitors),
      pageViews: Number(r.page_views),
    }));
  } else if (range === "12w") {
    // Weekly for last 12 weeks
    const result = await db.execute(sql`
      SELECT
        to_char(date_trunc('week', pv.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS label,
        COUNT(DISTINCT vs.visitor_id) AS visitors,
        COUNT(*) AS page_views
      FROM page_views pv
      JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
      WHERE pv.created_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY label
      ORDER BY label ASC
    `);
    rows = (result.rows as { label: string; visitors: string; page_views: string }[]).map((r) => ({
      label: r.label,
      visitors: Number(r.visitors),
      pageViews: Number(r.page_views),
    }));
  } else {
    // Monthly for last 12 months
    const result = await db.execute(sql`
      SELECT
        to_char(date_trunc('month', pv.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS label,
        COUNT(DISTINCT vs.visitor_id) AS visitors,
        COUNT(*) AS page_views
      FROM page_views pv
      JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
      WHERE pv.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY label
      ORDER BY label ASC
    `);
    rows = (result.rows as { label: string; visitors: string; page_views: string }[]).map((r) => ({
      label: r.label,
      visitors: Number(r.visitors),
      pageViews: Number(r.page_views),
    }));
  }

  res.json(rows);
};

// ── GET /platform/analytics/traffic ──────────────────────────────────────────

const getTraffic: RequestHandler = async (_req, res) => {
  const result = await db
    .select({
      referrer: pageViews.referrer,
      utmSource: pageViews.utmSource,
      c: count(),
    })
    .from(pageViews)
    .groupBy(pageViews.referrer, pageViews.utmSource);

  const tally: Record<TrafficSource, number> = {
    WhatsApp: 0,
    Facebook: 0,
    Instagram: 0,
    Google: 0,
    Direct: 0,
    Referral: 0,
    Unknown: 0,
  };

  for (const row of result) {
    const source = classifySource(row.referrer, row.utmSource);
    tally[source] += Number(row.c);
  }

  const sources = (Object.entries(tally) as [TrafficSource, number][])
    .filter(([, v]) => v > 0)
    .map(([source, visitors]) => ({ source, visitors }))
    .sort((a, b) => b.visitors - a.visitors);

  // New vs Returning breakdown
  const [newVsRet] = await Promise.all([
    db.execute(sql`
      SELECT
        SUM(CASE WHEN is_new = true THEN 1 ELSE 0 END) AS new_visitors,
        SUM(CASE WHEN is_new = false THEN 1 ELSE 0 END) AS returning_visitors
      FROM visitor_sessions
    `),
  ]);

  const nvr = newVsRet.rows[0] as { new_visitors: string; returning_visitors: string };

  res.json({
    sources,
    newVsReturning: {
      new: Number(nvr.new_visitors ?? 0),
      returning: Number(nvr.returning_visitors ?? 0),
    },
  });
};

// ── GET /platform/analytics/campaigns ────────────────────────────────────────

const getCampaigns: RequestHandler = async (_req, res) => {
  const result = await db.execute(sql`
    SELECT
      pv.utm_campaign                                  AS campaign,
      pv.utm_source                                    AS source,
      pv.utm_medium                                    AS medium,
      COUNT(DISTINCT vs.visitor_id)                    AS visitors,
      COUNT(DISTINCT CASE WHEN vs.is_new = true  THEN vs.visitor_id END) AS new_visitors,
      COUNT(DISTINCT CASE WHEN vs.is_new = false THEN vs.visitor_id END) AS returning_visitors
    FROM page_views pv
    JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
    WHERE pv.utm_campaign IS NOT NULL
    GROUP BY pv.utm_campaign, pv.utm_source, pv.utm_medium
    ORDER BY visitors DESC
    LIMIT 50
  `);

  res.json(
    (result.rows as {
      campaign: string;
      source: string;
      medium: string;
      visitors: string;
      new_visitors: string;
      returning_visitors: string;
    }[]).map((r) => ({
      campaign:          r.campaign,
      source:            r.source,
      medium:            r.medium,
      visitors:          Number(r.visitors),
      newVisitors:       Number(r.new_visitors),
      returningVisitors: Number(r.returning_visitors),
    })),
  );
};

// ── GET /platform/analytics/pages ────────────────────────────────────────────

const getPages: RequestHandler = async (_req, res) => {
  const result = await db.execute(sql`
    SELECT
      pv.page                          AS page,
      COUNT(*)                         AS views,
      COUNT(DISTINCT vs.visitor_id)    AS visitors
    FROM page_views pv
    JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
    GROUP BY pv.page
    ORDER BY views DESC
    LIMIT 20
  `);

  res.json(
    (result.rows as { page: string; views: string; visitors: string }[]).map((r) => ({
      page:     r.page,
      views:    Number(r.views),
      visitors: Number(r.visitors),
    })),
  );
};

// ── GET /platform/analytics/online ───────────────────────────────────────────

const getOnline: RequestHandler = async (_req, res) => {
  const threshold = new Date(Date.now() - 5 * 60 * 1000);
  const [row] = await db
    .select({ c: count() })
    .from(visitorSessions)
    .where(gte(visitorSessions.lastVisit, threshold));

  // Recent pages for online visitors
  const recent = await db.execute(sql`
    SELECT pv.page, COUNT(*) AS c
    FROM page_views pv
    JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
    WHERE vs.last_visit >= ${threshold}
    GROUP BY pv.page
    ORDER BY c DESC
  `);

  res.json({
    count: Number(row.c),
    pages: (recent.rows as { page: string; c: string }[]).map((r) => ({
      page: r.page,
      count: Number(r.c),
    })),
  });
};

// ── Route registration ────────────────────────────────────────────────────────

// POST is intentionally unauthenticated — called from the public /login page
router.post("/platform/analytics/visit", recordVisit);

// All read endpoints are admin-only
router.get("/platform/analytics/dashboard", requireAdmin, getDashboard);
router.get("/platform/analytics/chart", requireAdmin, getChart);
router.get("/platform/analytics/traffic", requireAdmin, getTraffic);
router.get("/platform/analytics/campaigns", requireAdmin, getCampaigns);
router.get("/platform/analytics/pages", requireAdmin, getPages);
router.get("/platform/analytics/online", requireAdmin, getOnline);

export default router;
