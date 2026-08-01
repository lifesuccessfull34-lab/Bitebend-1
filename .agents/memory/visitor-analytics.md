---
name: Visitor Analytics System
description: Migration 0029; visitor_sessions + page_views tables; POST /platform/analytics/visit (public); GET /platform/analytics/* (requireAdmin); useVisitorTracking hook on RestaurantAuth login page.
---

# Visitor Analytics System

**Why:** Platform admin module to track visitors to bitebend.in/login and future pages.

## Database (migration 0029)
- `visitor_sessions` — one row per unique visitor (`visitor_id` UUID from localStorage); upserted on each visit (last_visit, visit_count, is_new=false after first)
- `page_views` — one row per page load; linked to visitor_sessions; stores referrer, UTM params, screen size, user_agent

## API Route: `artifacts/api-server/src/routes/platformAnalytics.ts`
- `POST /platform/analytics/visit` — **intentionally unauthenticated** (called from public /login page); respects DNT header; hashes IP with SHA-256
- `GET /platform/analytics/dashboard|chart|traffic|campaigns|pages|online` — all behind `requireAdmin`
- Registered in `artifacts/api-server/src/routes/index.ts`

## Frontend
- Hook: `artifacts/portal/src/hooks/useVisitorTracking.ts` — fire-and-forget, DNT-aware, localStorage visitor UUID, sessionStorage session UUID
- Dashboard component: `artifacts/portal/src/pages/VisitorAnalytics.tsx` — `VisitorAnalyticsDashboard` export
- `RestaurantAuth.tsx` calls `useVisitorTracking("/login")` on mount
- `AdminShell.tsx`: `"analytics"` added to `AdminSection` union + `ADMIN_NAV_ITEMS` (LineChart icon)
- `Admin.tsx`: `analytics` in `PAGE_TITLES` + `{tab === "analytics" && <VisitorAnalyticsDashboard />}` render block

## Traffic source classification (in platformAnalytics.ts)
WhatsApp / Facebook / Instagram / Google / Direct / Referral / Unknown — based on referrer + utm_source.

## Key constraints
- `geo` fields (country/state/city) are NULL — no lookup implemented yet (proposed as follow-up)
- `POST /visit` must remain unauthenticated — login page visitors are not logged in
- DNT respected server-side (early return 204, no DB write)
