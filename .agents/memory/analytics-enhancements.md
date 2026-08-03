---
name: Analytics Enhancements (migration 0030)
description: What was added in migration 0030 on top of the Phase 1 analytics system (0029).
---

## What was added

**Migration 0030** (`lib/db/drizzle/0030_analytics_enhancements.sql`):
- `visitor_sessions.is_bot boolean NOT NULL DEFAULT false`
- `page_views.is_bot boolean NOT NULL DEFAULT false`
- `page_views.duration_seconds integer` (nullable — NULL means beacon never fired)
- `page_views.referrer_domain text` (pre-computed from referrer URL at insert time)
- `page_views.traffic_source text` (pre-computed at insert time — eliminates O(N) in-memory classification)
- New table: `analytics_events` (event_name, session_id, visitor_session_id, page, properties JSONB, is_bot, created_at)

## Bot detection rule
`detectBot(ua)` in platformAnalytics.ts: UA < 10 chars = bot; large BOT_PATTERN regex. Bots are stored (`is_bot=true`) but excluded from all reporting queries via `WHERE is_bot = false`.

## Duration tracking
- Client: `sendBeacon('/api/platform/analytics/duration', ...)` fires in `beforeunload` via `useVisitorTracking` hook.
- Server: `POST /platform/analytics/duration` (public, rate-limited) updates the most recent `page_views` row WHERE `visitor_id = $id AND page = $page AND duration_seconds IS NULL ORDER BY created_at DESC LIMIT 1`.
- Duration rows only exist after the user leaves the page; NULL means tab closed too fast or beacon failed.

## Generic event tracking
- `trackEvent(name, properties?)` exported from `useVisitorTracking.ts` — fire-and-forget, DNT-aware.
- `POST /platform/analytics/event` (public, rate-limited) inserts into `analytics_events`.
- Used for conversion funnel: `register_tab_clicked`, `register_submitted`, `plan_selected`, `subscription_completed`.

## Traffic source classification
Full 14-source list: WhatsApp, Facebook, Instagram, Twitter, LinkedIn, YouTube, Google Organic, Google Ads, Bing, DuckDuckGo, Email, SMS, Direct, Referral. Classification is stored at INSERT time (traffic_source column) so read queries GROUP BY traffic_source, not in-memory.

## Date range support
All GET admin endpoints accept `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Dashboard additionally always returns fixed-window today/yesterday/week/month/total. Bounce rate and avg duration are computed over the selected range (default 30 days).

## Why: Pre-computed traffic_source
Old `getTraffic` loaded ALL page_views rows into JS, then classified in memory — O(N). At scale this breaks. New approach stores the value at write time and uses GROUP BY in SQL.

## Rate limiting
Public endpoints (`/visit`, `/duration`, `/event`) use `createRateLimiter({ maxRequests: 60, windowMs: 60000, label: "analytics:public" })` — same PostgreSQL-backed limiter used by auth routes.
