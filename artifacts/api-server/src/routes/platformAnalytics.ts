/**
 * Platform Analytics Routes
 *
 * Public endpoints (rate-limited, unauthenticated):
 *   POST /platform/analytics/visit    — fire-and-forget page-view tracking
 *   POST /platform/analytics/duration — update page-view duration on page unload
 *   POST /platform/analytics/event    — generic named-event tracking
 *
 * Admin-only endpoints (requireAdmin):
 *   GET  /platform/analytics/dashboard — summary stats: visitors, bounce rate, avg duration
 *   GET  /platform/analytics/chart     — visitors + page-views over time
 *   GET  /platform/analytics/traffic   — traffic source breakdown (pre-computed)
 *   GET  /platform/analytics/campaigns — UTM campaign performance table
 *   GET  /platform/analytics/pages     — top pages with bounce rate + avg duration
 *   GET  /platform/analytics/online    — currently-active visitor count
 *   GET  /platform/analytics/funnel    — conversion funnel step counts
 *   GET  /platform/analytics/export    — CSV download (type=visitors|pageviews|campaigns|pages)
 *
 * Privacy guarantees:
 *   - DNT: 1 header → silently dropped (no DB write)
 *   - Known bots/crawlers → stored with is_bot = true, excluded from all reports
 *   - IP address SHA-256 hashed; raw IP is never persisted
 *   - No PII (no names, emails, phone numbers)
 */

import { Router, type RequestHandler } from "express";
import { createHash } from "crypto";
import { db, visitorSessions, pageViews, analyticsEvents } from "@workspace/db";
import { eq, sql, gte, and, lt, count } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { createRateLimiter } from "../lib/rateLimiter";

const router = Router();

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Generous enough for legitimate rapid tab-navigation; restrictive enough to
// prevent simple bot floods from hitting the DB at full speed.

const publicLimiter = createRateLimiter({
  maxRequests: 60,
  windowMs: 60_000,
  label: "analytics:public",
  message: "Too many analytics requests.",
});

// ── Bot detection ─────────────────────────────────────────────────────────────

const BOT_PATTERN =
  /bot|crawl|spider|slurp|facebookexternalhit|facebookbot|twitterbot|linkedinbot|lighthouse|pingdom|uptimerobot|datadog|semrushbot|ahrefsbot|mj12bot|dotbot|baiduspider|yandexbot|duckduckbot|ia_archiver|python-requests|python\/|curl\/|wget\/|go-http-client|node-fetch|axios\/|java\/|okhttp|headlesschrome|phantomjs|selenium|webdriver|puppeteer|playwright|cypress|chrome-lighthouse|googlebot|bingbot|yandex|baidu|sogou|exabot|scrapbot|scrapy|httpclient|libwww|lwp-|Jakarta|feedparser|feedfetcher/i;

function detectBot(ua: string): boolean {
  if (!ua || ua.trim().length < 10) return true;
  return BOT_PATTERN.test(ua);
}

// ── Traffic source classification ─────────────────────────────────────────────
// Stored at INSERT time so read queries GROUP BY traffic_source directly
// instead of loading all rows into application memory.

export type TrafficSource =
  | "WhatsApp"
  | "Facebook"
  | "Instagram"
  | "Twitter"
  | "LinkedIn"
  | "YouTube"
  | "Google Organic"
  | "Google Ads"
  | "Bing"
  | "DuckDuckGo"
  | "Email"
  | "SMS"
  | "Direct"
  | "Referral"
  | "Unknown";

function classifySource(
  referrer: string | null | undefined,
  utmSource: string | null | undefined,
  utmMedium: string | null | undefined,
): TrafficSource {
  const src = (utmSource ?? "").toLowerCase().trim();
  const med = (utmMedium ?? "").toLowerCase().trim();
  const ref = (referrer ?? "").toLowerCase();

  // utm_medium has the highest priority (explicitly set by campaign creator)
  if (med === "email" || med === "newsletter" || med === "mail") return "Email";
  if (med === "sms" || med === "mms") return "SMS";
  if ((med === "cpc" || med === "ppc" || med === "paid") && src.includes("google")) return "Google Ads";
  if ((med === "cpc" || med === "ppc" || med === "paid") && src.includes("bing")) return "Bing";

  // utm_source explicit values
  if (src === "whatsapp" || src === "wa") return "WhatsApp";
  if (src === "facebook" || src === "fb") return "Facebook";
  if (src === "instagram" || src === "ig") return "Instagram";
  if (src === "twitter" || src === "x" || src === "t.co") return "Twitter";
  if (src === "linkedin") return "LinkedIn";
  if (src === "youtube" || src === "yt") return "YouTube";
  if (src === "google" || src === "organic") return "Google Organic";
  if (src === "bing") return "Bing";
  if (src === "duckduckgo" || src === "ddg") return "DuckDuckGo";
  if (src.includes("email") || src.includes("newsletter") || src.includes("mailchimp") || src.includes("sendgrid")) return "Email";
  if (src === "sms") return "SMS";

  // Referrer domain fallback
  if (ref.includes("whatsapp.com") || ref.includes("wa.me")) return "WhatsApp";
  if (ref.includes("facebook.com") || ref.includes("fb.com") || ref.includes("m.facebook.")) return "Facebook";
  if (ref.includes("instagram.com")) return "Instagram";
  if (ref.includes("twitter.com") || ref.includes("t.co/") || ref.includes("x.com")) return "Twitter";
  if (ref.includes("linkedin.com")) return "LinkedIn";
  if (ref.includes("youtube.com") || ref.includes("youtu.be")) return "YouTube";
  if (ref.includes("google.")) return "Google Organic";
  if (ref.includes("bing.com")) return "Bing";
  if (ref.includes("duckduckgo.com") || ref.includes("ddg.gg")) return "DuckDuckGo";

  if (!referrer && !utmSource) return "Direct";
  if (referrer) return "Referral";
  return "Unknown";
}

// ── Other helpers ─────────────────────────────────────────────────────────────

function extractDomain(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

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

  if (/mobile|android|iphone|ipod/i.test(ua)) device = "Mobile";
  else if (/ipad|tablet/i.test(ua)) device = "Tablet";

  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\/|opera/i.test(ua)) browser = "Opera";
  else if (/chrome\/[0-9]/i.test(ua) && !/chromium/i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/msie|trident/i.test(ua)) browser = "IE";

  if (/windows nt/i.test(ua)) os = "Windows";
  else if (/mac os x/i.test(ua) && !/iphone|ipad|ipod/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua) && !/android/i.test(ua)) os = "Linux";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/cros/i.test(ua)) os = "ChromeOS";

  return { browser, os, device };
}

/**
 * Parse optional ?from=YYYY-MM-DD&to=YYYY-MM-DD query params.
 * Returns null for each side if not provided or invalid.
 */
function parseDateRange(q: Record<string, unknown>): { from: Date | null; to: Date | null } {
  const fromStr = typeof q.from === "string" ? q.from : null;
  const toStr   = typeof q.to   === "string" ? q.to   : null;

  const from = fromStr ? new Date(`${fromStr}T00:00:00.000Z`) : null;
  const to   = toStr   ? new Date(`${toStr}T23:59:59.999Z`)   : null;

  if (from && isNaN(from.getTime())) return { from: null, to: null };
  if (to   && isNaN(to.getTime()))   return { from: null, to: null };
  return { from, to };
}

/** Build a WHERE clause fragment for a date range, or a default window. */
function dateRangeWhere(
  column: string,
  from: Date | null,
  to: Date | null,
  defaultDays = 30,
): string {
  if (from && to) {
    return `AND ${column} >= '${from.toISOString()}' AND ${column} <= '${to.toISOString()}'`;
  }
  if (from) {
    return `AND ${column} >= '${from.toISOString()}'`;
  }
  return `AND ${column} >= NOW() - INTERVAL '${defaultDays} days'`;
}

// ── CSV helper ────────────────────────────────────────────────────────────────

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (v: string | number | null): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ].join("\n");
}

// ── POST /platform/analytics/visit ───────────────────────────────────────────

const recordVisit: RequestHandler = async (req, res) => {
  if (req.headers["dnt"] === "1") { res.status(204).end(); return; }

  const body = req.body as Record<string, unknown>;
  const { visitorId, sessionId, page } = body;

  if (typeof visitorId !== "string" || typeof sessionId !== "string" || typeof page !== "string") {
    res.status(400).json({ error: "visitorId, sessionId, and page are required strings" });
    return;
  }

  const ua       = typeof body.userAgent === "string" ? body.userAgent : (req.headers["user-agent"] ?? "");
  const bot      = detectBot(ua);
  const { browser, os, device } = parseUserAgent(ua);
  const hashedIp = hashIp(getClientIp(req));

  const referrer   = typeof body.referrer   === "string" ? body.referrer   || null : null;
  const utmSource  = typeof body.utmSource  === "string" ? body.utmSource  || null : null;
  const utmMedium  = typeof body.utmMedium  === "string" ? body.utmMedium  || null : null;
  const utmCampaign= typeof body.utmCampaign=== "string" ? body.utmCampaign|| null : null;
  const utmContent = typeof body.utmContent === "string" ? body.utmContent || null : null;
  const language   = typeof body.language   === "string" ? body.language        : undefined;
  const timezone   = typeof body.timezone   === "string" ? body.timezone        : undefined;
  const screenWidth  = typeof body.screenWidth  === "number" ? body.screenWidth  : null;
  const screenHeight = typeof body.screenHeight === "number" ? body.screenHeight : null;

  const trafficSource  = classifySource(referrer, utmSource, utmMedium);
  const referrerDomain = extractDomain(referrer);

  // Upsert visitor_sessions: one row per unique visitor UUID
  const existing = await db
    .select({ id: visitorSessions.id })
    .from(visitorSessions)
    .where(eq(visitorSessions.visitorId, visitorId))
    .limit(1);

  let sessionRowId: number;

  if (existing.length > 0) {
    sessionRowId = existing[0].id;
    await db.update(visitorSessions).set({
      sessionId,
      lastVisit:  new Date(),
      visitCount: sql`${visitorSessions.visitCount} + 1`,
      isNew:      false,
      language,
      timezone,
      hashedIp,
      updatedAt:  new Date(),
    }).where(eq(visitorSessions.visitorId, visitorId));
  } else {
    const [ins] = await db.insert(visitorSessions).values({
      visitorId,
      sessionId,
      isNew:  true,
      isBot:  bot,
      browser,
      os,
      device,
      language,
      timezone,
      hashedIp,
    }).returning({ id: visitorSessions.id });
    sessionRowId = ins.id;
  }

  await db.insert(pageViews).values({
    visitorSessionId: sessionRowId,
    page,
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    screenWidth,
    screenHeight,
    userAgent: ua || null,
    isBot: bot,
    trafficSource,
    referrerDomain,
  });

  res.status(204).end();
};

// ── POST /platform/analytics/duration ────────────────────────────────────────
// Called via navigator.sendBeacon on page unload. Updates the most recent
// page_view row for this visitor+page that still has duration_seconds = NULL.

const recordDuration: RequestHandler = async (req, res) => {
  if (req.headers["dnt"] === "1") { res.status(204).end(); return; }

  const { visitorId, page, durationSeconds } = req.body as Record<string, unknown>;

  if (
    typeof visitorId !== "string" ||
    typeof page !== "string" ||
    typeof durationSeconds !== "number"
  ) {
    res.status(400).json({ error: "visitorId, page, and durationSeconds are required" });
    return;
  }

  // Sanity-bound: ignore anything that looks like a bug or a lie
  if (durationSeconds < 0 || durationSeconds > 86_400) {
    res.status(204).end();
    return;
  }

  await db.execute(sql`
    UPDATE page_views
    SET duration_seconds = ${Math.round(durationSeconds)}
    WHERE id = (
      SELECT pv.id
      FROM page_views pv
      JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
      WHERE vs.visitor_id      = ${visitorId}
        AND pv.page            = ${page}
        AND pv.duration_seconds IS NULL
      ORDER BY pv.created_at DESC
      LIMIT 1
    )
  `);

  res.status(204).end();
};

// ── POST /platform/analytics/event ───────────────────────────────────────────
// Generic named-event tracking. Powers the conversion funnel.

const recordEvent: RequestHandler = async (req, res) => {
  if (req.headers["dnt"] === "1") { res.status(204).end(); return; }

  const body = req.body as Record<string, unknown>;
  const { visitorId, sessionId, eventName, page, properties } = body;

  if (typeof eventName !== "string" || typeof sessionId !== "string") {
    res.status(400).json({ error: "eventName and sessionId are required strings" });
    return;
  }

  const ua  = req.headers["user-agent"] ?? "";
  const bot = detectBot(ua);

  let visitorSessionId: number | null = null;
  if (typeof visitorId === "string") {
    const row = await db
      .select({ id: visitorSessions.id })
      .from(visitorSessions)
      .where(eq(visitorSessions.visitorId, visitorId))
      .limit(1);
    if (row.length > 0) visitorSessionId = row[0].id;
  }

  await db.insert(analyticsEvents).values({
    visitorSessionId,
    sessionId,
    eventName,
    page: typeof page === "string" ? page : null,
    properties: (properties !== undefined && properties !== null)
      ? (properties as object)
      : null,
    isBot: bot,
  });

  res.status(204).end();
};

// ── GET /platform/analytics/dashboard ────────────────────────────────────────
// Always returns fixed-window counters (Today/Yesterday/Week/Month/Total)
// plus bounce rate and avg session duration for a configurable date range
// (default: last 30 days). All counts exclude known bots.

const getDashboard: RequestHandler = async (req, res) => {
  const now           = new Date();
  const todayStart    = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterdayStart= new Date(todayStart.getTime() - 86_400_000);
  const weekStart     = new Date(todayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay()); // Sunday
  const monthStart    = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const onlineCutoff  = new Date(now.getTime() - 5 * 60_000);

  const { from, to } = parseDateRange(req.query as Record<string, unknown>);
  const rangeFrom = from ?? new Date(now.getTime() - 30 * 86_400_000);
  const rangeTo   = to   ?? now;

  const NOT_BOT = eq(visitorSessions.isBot, false);

  const [
    todayRows, yesterdayRows, weekRows, monthRows,
    totalVisitors, totalPvRows, onlineRows, newRows, returningRows,
    rangedStats,
  ] = await Promise.all([
    db.select({ c: count() }).from(visitorSessions).where(and(gte(visitorSessions.lastVisit, todayStart), NOT_BOT)),
    db.select({ c: count() }).from(visitorSessions).where(and(gte(visitorSessions.lastVisit, yesterdayStart), lt(visitorSessions.lastVisit, todayStart), NOT_BOT)),
    db.select({ c: count() }).from(visitorSessions).where(and(gte(visitorSessions.lastVisit, weekStart), NOT_BOT)),
    db.select({ c: count() }).from(visitorSessions).where(and(gte(visitorSessions.lastVisit, monthStart), NOT_BOT)),
    db.select({ c: count() }).from(visitorSessions).where(NOT_BOT),
    db.select({ c: count() }).from(pageViews).where(eq(pageViews.isBot, false)),
    db.select({ c: count() }).from(visitorSessions).where(and(gte(visitorSessions.lastVisit, onlineCutoff), NOT_BOT)),
    db.select({ c: count() }).from(visitorSessions).where(and(eq(visitorSessions.isNew, true), NOT_BOT)),
    db.select({ c: count() }).from(visitorSessions).where(and(eq(visitorSessions.isNew, false), NOT_BOT)),
    // Bounce rate + avg duration for the selected date window
    db.execute(sql`
      SELECT
        COUNT(DISTINCT sub.session_id)                                          AS total_sessions,
        COUNT(DISTINCT CASE WHEN sub.pv_count = 1 THEN sub.session_id END)      AS bounce_sessions,
        ROUND(AVG(pv2.duration_seconds))::int                                   AS avg_duration
      FROM (
        SELECT pv.visitor_session_id AS session_id, COUNT(*) AS pv_count
        FROM page_views pv
        JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
        WHERE pv.is_bot = false
          AND vs.is_bot = false
          AND pv.created_at >= ${rangeFrom}
          AND pv.created_at <= ${rangeTo}
        GROUP BY pv.visitor_session_id
      ) sub
      JOIN page_views pv2 ON pv2.visitor_session_id = sub.session_id
      WHERE pv2.is_bot = false
        AND pv2.created_at >= ${rangeFrom}
        AND pv2.created_at <= ${rangeTo}
    `),
  ]);

  const rs = rangedStats.rows[0] as {
    total_sessions:  string;
    bounce_sessions: string;
    avg_duration:    string | null;
  };
  const totalSessions  = Number(rs?.total_sessions  ?? 0);
  const bounceSessions = Number(rs?.bounce_sessions ?? 0);

  res.json({
    today:          Number(todayRows[0].c),
    yesterday:      Number(yesterdayRows[0].c),
    thisWeek:       Number(weekRows[0].c),
    thisMonth:      Number(monthRows[0].c),
    total:          Number(totalVisitors[0].c),
    totalPageViews: Number(totalPvRows[0].c),
    online:         Number(onlineRows[0].c),
    newVisitors:    Number(newRows[0].c),
    returning:      Number(returningRows[0].c),
    bounceRate:     totalSessions > 0 ? Math.round((bounceSessions / totalSessions) * 100) : 0,
    avgDuration:    Number(rs?.avg_duration ?? 0),
  });
};

// ── GET /platform/analytics/chart?range=30d|12w|12m&from=&to= ────────────────

const getChart: RequestHandler = async (req, res) => {
  const { from, to } = parseDateRange(req.query as Record<string, unknown>);
  const range  = (req.query.range as string) ?? "30d";
  const botFil = "AND pv.is_bot = false AND vs.is_bot = false";

  type RawRow = { label: string; visitors: string; page_views: string };

  let result: { rows: RawRow[] };

  if (from && to) {
    // Custom range — daily buckets
    result = await db.execute(sql`
      SELECT
        to_char(pv.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS label,
        COUNT(DISTINCT vs.visitor_id)                            AS visitors,
        COUNT(*)                                                 AS page_views
      FROM page_views pv
      JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
      WHERE pv.is_bot = false AND vs.is_bot = false
        AND pv.created_at >= ${from} AND pv.created_at <= ${to}
      GROUP BY label ORDER BY label ASC
    `) as { rows: RawRow[] };
  } else if (range === "12w") {
    result = await db.execute(sql`
      SELECT
        to_char(date_trunc('week', pv.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS label,
        COUNT(DISTINCT vs.visitor_id) AS visitors,
        COUNT(*)                      AS page_views
      FROM page_views pv
      JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
      WHERE pv.is_bot = false AND vs.is_bot = false
        AND pv.created_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY label ORDER BY label ASC
    `) as { rows: RawRow[] };
  } else if (range === "12m") {
    result = await db.execute(sql`
      SELECT
        to_char(date_trunc('month', pv.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS label,
        COUNT(DISTINCT vs.visitor_id) AS visitors,
        COUNT(*)                      AS page_views
      FROM page_views pv
      JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
      WHERE pv.is_bot = false AND vs.is_bot = false
        AND pv.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY label ORDER BY label ASC
    `) as { rows: RawRow[] };
  } else {
    // default: 30d daily
    result = await db.execute(sql`
      SELECT
        to_char(pv.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS label,
        COUNT(DISTINCT vs.visitor_id) AS visitors,
        COUNT(*)                      AS page_views
      FROM page_views pv
      JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
      WHERE pv.is_bot = false AND vs.is_bot = false
        AND pv.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY label ORDER BY label ASC
    `) as { rows: RawRow[] };
  }

  void botFil; // referenced in comment above; keep lint happy

  res.json(result.rows.map((r) => ({
    label:     r.label,
    visitors:  Number(r.visitors),
    pageViews: Number(r.page_views),
  })));
};

// ── GET /platform/analytics/traffic?from=&to= ────────────────────────────────
// Uses the pre-computed traffic_source column — O(sources) not O(rows).

const getTraffic: RequestHandler = async (req, res) => {
  const { from, to } = parseDateRange(req.query as Record<string, unknown>);
  const rangeFrom = from ?? new Date(Date.now() - 30 * 86_400_000);
  const rangeTo   = to   ?? new Date();

  const [sourcesResult, nvrResult] = await Promise.all([
    db.execute(sql`
      SELECT
        COALESCE(pv.traffic_source, 'Unknown') AS source,
        COUNT(DISTINCT vs.visitor_id)          AS visitors
      FROM page_views pv
      JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
      WHERE pv.is_bot = false
        AND vs.is_bot = false
        AND pv.created_at >= ${rangeFrom}
        AND pv.created_at <= ${rangeTo}
      GROUP BY source
      ORDER BY visitors DESC
    `),
    db.execute(sql`
      SELECT
        SUM(CASE WHEN vs.is_new = true  THEN 1 ELSE 0 END)::bigint AS new_visitors,
        SUM(CASE WHEN vs.is_new = false THEN 1 ELSE 0 END)::bigint AS returning_visitors
      FROM visitor_sessions vs
      WHERE vs.is_bot = false
        AND vs.last_visit >= ${rangeFrom}
        AND vs.last_visit <= ${rangeTo}
    `),
  ]);

  const nvr = nvrResult.rows[0] as { new_visitors: string; returning_visitors: string };

  res.json({
    sources: (sourcesResult.rows as { source: string; visitors: string }[])
      .filter((r) => Number(r.visitors) > 0)
      .map((r) => ({ source: r.source, visitors: Number(r.visitors) })),
    newVsReturning: {
      new:       Number(nvr?.new_visitors       ?? 0),
      returning: Number(nvr?.returning_visitors ?? 0),
    },
  });
};

// ── GET /platform/analytics/campaigns?from=&to= ──────────────────────────────

const getCampaigns: RequestHandler = async (req, res) => {
  const { from, to } = parseDateRange(req.query as Record<string, unknown>);
  const rangeFrom = from ?? new Date(Date.now() - 90 * 86_400_000);
  const rangeTo   = to   ?? new Date();

  const result = await db.execute(sql`
    SELECT
      pv.utm_campaign                                                      AS campaign,
      COALESCE(pv.traffic_source, pv.utm_source, 'Unknown')               AS source,
      pv.utm_medium                                                        AS medium,
      COUNT(DISTINCT vs.visitor_id)                                        AS visitors,
      COUNT(DISTINCT CASE WHEN vs.is_new = true  THEN vs.visitor_id END)  AS new_visitors,
      COUNT(DISTINCT CASE WHEN vs.is_new = false THEN vs.visitor_id END)  AS returning_visitors
    FROM page_views pv
    JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
    WHERE pv.utm_campaign IS NOT NULL
      AND pv.is_bot = false
      AND vs.is_bot = false
      AND pv.created_at >= ${rangeFrom}
      AND pv.created_at <= ${rangeTo}
    GROUP BY pv.utm_campaign, source, pv.utm_medium
    ORDER BY visitors DESC
    LIMIT 50
  `);

  res.json(
    (result.rows as {
      campaign: string; source: string; medium: string;
      visitors: string; new_visitors: string; returning_visitors: string;
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

// ── GET /platform/analytics/pages?from=&to= ──────────────────────────────────

const getPages: RequestHandler = async (req, res) => {
  const { from, to } = parseDateRange(req.query as Record<string, unknown>);
  const rangeFrom = from ?? new Date(Date.now() - 30 * 86_400_000);
  const rangeTo   = to   ?? new Date();

  const result = await db.execute(sql`
    SELECT
      pv.page                                                         AS page,
      COUNT(*)                                                        AS views,
      COUNT(DISTINCT vs.visitor_id)                                   AS visitors,
      -- bounce: sessions that only ever viewed THIS page
      SUM(CASE WHEN sess_pv.total_pvs = 1 THEN 1 ELSE 0 END)         AS bounce_views,
      ROUND(AVG(pv.duration_seconds))::int                            AS avg_duration
    FROM page_views pv
    JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
    -- total page-views per session (for bounce calc)
    JOIN (
      SELECT visitor_session_id, COUNT(*) AS total_pvs
      FROM page_views
      WHERE is_bot = false
        AND created_at >= ${rangeFrom} AND created_at <= ${rangeTo}
      GROUP BY visitor_session_id
    ) sess_pv ON sess_pv.visitor_session_id = pv.visitor_session_id
    WHERE pv.is_bot = false
      AND vs.is_bot = false
      AND pv.created_at >= ${rangeFrom}
      AND pv.created_at <= ${rangeTo}
    GROUP BY pv.page
    ORDER BY views DESC
    LIMIT 25
  `);

  res.json(
    (result.rows as {
      page: string; views: string; visitors: string;
      bounce_views: string; avg_duration: string | null;
    }[]).map((r) => {
      const views  = Number(r.views);
      const bounce = Number(r.bounce_views);
      return {
        page:        r.page,
        views,
        visitors:    Number(r.visitors),
        bounceRate:  views > 0 ? Math.round((bounce / views) * 100) : 0,
        avgDuration: Number(r.avg_duration ?? 0),
      };
    }),
  );
};

// ── GET /platform/analytics/online ───────────────────────────────────────────

const getOnline: RequestHandler = async (_req, res) => {
  const threshold = new Date(Date.now() - 5 * 60_000);

  const [row, recent] = await Promise.all([
    db.select({ c: count() }).from(visitorSessions)
      .where(and(gte(visitorSessions.lastVisit, threshold), eq(visitorSessions.isBot, false))),
    db.execute(sql`
      SELECT pv.page, COUNT(*) AS c
      FROM page_views pv
      JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
      WHERE vs.last_visit >= ${threshold}
        AND vs.is_bot = false
        AND pv.is_bot = false
      GROUP BY pv.page
      ORDER BY c DESC
    `),
  ]);

  res.json({
    count: Number(row[0].c),
    pages: (recent.rows as { page: string; c: string }[]).map((r) => ({
      page:  r.page,
      count: Number(r.c),
    })),
  });
};

// ── GET /platform/analytics/funnel?from=&to= ─────────────────────────────────
// Bitebend SaaS conversion funnel: visit → register tab → submit → plan → subscribe.
// Step counts are unique visitor sessions, not raw event counts.

const FUNNEL_STEPS = [
  { id: "login_visit",       label: "Visited Login Page",   kind: "pageview" as const, value: "/login"                  },
  { id: "register_tab",      label: "Opened Register Tab",  kind: "event"    as const, value: "register_tab_clicked"    },
  { id: "register_submit",   label: "Submitted Registration",kind: "event"   as const, value: "register_submitted"      },
  { id: "plan_selected",     label: "Selected a Plan",      kind: "event"    as const, value: "plan_selected"           },
  { id: "subscription_done", label: "Subscribed",           kind: "event"    as const, value: "subscription_completed"  },
];

const getFunnel: RequestHandler = async (req, res) => {
  const { from, to } = parseDateRange(req.query as Record<string, unknown>);
  const rangeFrom = from ?? new Date(Date.now() - 30 * 86_400_000);
  const rangeTo   = to   ?? new Date();

  const counts = await Promise.all(
    FUNNEL_STEPS.map(async (step) => {
      let result: { rows: { c: string }[] };
      if (step.kind === "pageview") {
        result = await db.execute(sql`
          SELECT COUNT(DISTINCT vs.visitor_id) AS c
          FROM page_views pv
          JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
          WHERE pv.page = ${step.value}
            AND pv.is_bot = false
            AND vs.is_bot = false
            AND pv.created_at >= ${rangeFrom}
            AND pv.created_at <= ${rangeTo}
        `) as { rows: { c: string }[] };
      } else {
        result = await db.execute(sql`
          SELECT COUNT(DISTINCT ae.session_id) AS c
          FROM analytics_events ae
          WHERE ae.event_name = ${step.value}
            AND ae.is_bot = false
            AND ae.created_at >= ${rangeFrom}
            AND ae.created_at <= ${rangeTo}
        `) as { rows: { c: string }[] };
      }
      return Number(result.rows[0]?.c ?? 0);
    }),
  );

  const steps = FUNNEL_STEPS.map((step, i) => ({
    id:             step.id,
    label:          step.label,
    count:          counts[i],
    conversionRate: i === 0
      ? 100
      : counts[0] > 0
        ? Math.round((counts[i] / counts[0]) * 100)
        : 0,
    dropOffRate: i === 0
      ? 0
      : counts[i - 1] > 0
        ? Math.round(((counts[i - 1] - counts[i]) / counts[i - 1]) * 100)
        : 0,
  }));

  res.json({ steps, rangeFrom, rangeTo });
};

// ── GET /platform/analytics/export?type=visitors|pageviews|campaigns|pages&from=&to= ──

const exportCsv: RequestHandler = async (req, res) => {
  const type = (req.query.type as string) ?? "visitors";
  const { from, to } = parseDateRange(req.query as Record<string, unknown>);
  const rangeFrom = from ?? new Date(Date.now() - 30 * 86_400_000);
  const rangeTo   = to   ?? new Date();

  let csv = "";
  let filename = "analytics";

  if (type === "pageviews") {
    filename = "page-views";
    const result = await db.execute(sql`
      SELECT
        pv.created_at, pv.page, pv.traffic_source, pv.referrer_domain,
        pv.utm_campaign, pv.utm_source, pv.utm_medium,
        pv.duration_seconds, vs.browser, vs.os, vs.device, vs.country
      FROM page_views pv
      JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
      WHERE pv.is_bot = false AND vs.is_bot = false
        AND pv.created_at >= ${rangeFrom} AND pv.created_at <= ${rangeTo}
      ORDER BY pv.created_at DESC
      LIMIT 10000
    `);
    csv = toCsv(
      ["Date", "Page", "Traffic Source", "Referrer Domain", "Campaign", "UTM Source", "UTM Medium", "Duration (s)", "Browser", "OS", "Device", "Country"],
      (result.rows as Record<string, unknown>[]).map((r) => [
        String(r.created_at ?? ""), String(r.page ?? ""), String(r.traffic_source ?? ""),
        String(r.referrer_domain ?? ""), String(r.utm_campaign ?? ""), String(r.utm_source ?? ""),
        String(r.utm_medium ?? ""), r.duration_seconds as number ?? null,
        String(r.browser ?? ""), String(r.os ?? ""), String(r.device ?? ""), String(r.country ?? ""),
      ]),
    );
  } else if (type === "campaigns") {
    filename = "campaigns";
    const result = await db.execute(sql`
      SELECT
        pv.utm_campaign, COALESCE(pv.traffic_source, pv.utm_source) AS source,
        pv.utm_medium,
        COUNT(DISTINCT vs.visitor_id)                                       AS visitors,
        COUNT(DISTINCT CASE WHEN vs.is_new THEN vs.visitor_id END)          AS new_visitors
      FROM page_views pv
      JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
      WHERE pv.utm_campaign IS NOT NULL AND pv.is_bot = false AND vs.is_bot = false
        AND pv.created_at >= ${rangeFrom} AND pv.created_at <= ${rangeTo}
      GROUP BY pv.utm_campaign, source, pv.utm_medium
      ORDER BY visitors DESC
    `);
    csv = toCsv(
      ["Campaign", "Source", "Medium", "Visitors", "New Visitors"],
      (result.rows as Record<string, unknown>[]).map((r) => [
        String(r.utm_campaign ?? ""), String(r.source ?? ""), String(r.utm_medium ?? ""),
        Number(r.visitors), Number(r.new_visitors),
      ]),
    );
  } else if (type === "pages") {
    filename = "pages";
    const result = await db.execute(sql`
      SELECT
        pv.page, COUNT(*) AS views, COUNT(DISTINCT vs.visitor_id) AS visitors,
        ROUND(AVG(pv.duration_seconds))::int AS avg_duration
      FROM page_views pv
      JOIN visitor_sessions vs ON vs.id = pv.visitor_session_id
      WHERE pv.is_bot = false AND vs.is_bot = false
        AND pv.created_at >= ${rangeFrom} AND pv.created_at <= ${rangeTo}
      GROUP BY pv.page ORDER BY views DESC
    `);
    csv = toCsv(
      ["Page", "Views", "Visitors", "Avg Duration (s)"],
      (result.rows as Record<string, unknown>[]).map((r) => [
        String(r.page ?? ""), Number(r.views), Number(r.visitors), r.avg_duration as number ?? null,
      ]),
    );
  } else {
    // visitors (default)
    filename = "visitors";
    const result = await db.execute(sql`
      SELECT
        vs.first_visit, vs.last_visit, vs.visit_count,
        CASE WHEN vs.is_new THEN 'New' ELSE 'Returning' END AS visitor_type,
        vs.browser, vs.os, vs.device, vs.language, vs.timezone, vs.country
      FROM visitor_sessions vs
      WHERE vs.is_bot = false
        AND vs.last_visit >= ${rangeFrom} AND vs.last_visit <= ${rangeTo}
      ORDER BY vs.last_visit DESC
      LIMIT 10000
    `);
    csv = toCsv(
      ["First Visit", "Last Visit", "Visit Count", "Type", "Browser", "OS", "Device", "Language", "Timezone", "Country"],
      (result.rows as Record<string, unknown>[]).map((r) => [
        String(r.first_visit ?? ""), String(r.last_visit ?? ""), Number(r.visit_count),
        String(r.visitor_type ?? ""), String(r.browser ?? ""), String(r.os ?? ""),
        String(r.device ?? ""), String(r.language ?? ""), String(r.timezone ?? ""), String(r.country ?? ""),
      ]),
    );
  }

  const dateStr = new Date().toISOString().split("T")[0];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}-${dateStr}.csv"`);
  res.send(csv);
};

// ── Route registration ────────────────────────────────────────────────────────

// Public — rate-limited, no auth (called from the public /login page)
router.post("/platform/analytics/visit",    publicLimiter, recordVisit);
router.post("/platform/analytics/duration", publicLimiter, recordDuration);
router.post("/platform/analytics/event",    publicLimiter, recordEvent);

// Admin-only
router.get("/platform/analytics/dashboard", requireAdmin, getDashboard);
router.get("/platform/analytics/chart",     requireAdmin, getChart);
router.get("/platform/analytics/traffic",   requireAdmin, getTraffic);
router.get("/platform/analytics/campaigns", requireAdmin, getCampaigns);
router.get("/platform/analytics/pages",     requireAdmin, getPages);
router.get("/platform/analytics/online",    requireAdmin, getOnline);
router.get("/platform/analytics/funnel",    requireAdmin, getFunnel);
router.get("/platform/analytics/export",    requireAdmin, exportCsv);

export default router;
