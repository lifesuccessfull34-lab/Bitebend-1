-- Migration 0029: visitor_analytics
--
-- Creates two tables for platform-level visitor analytics.
-- Initially tracks visitors to the /login page only.
-- Architecture is page-agnostic so any future page can be tracked
-- by inserting a page_views row without schema changes.
--
-- Privacy
-- ───────
-- • No raw IP addresses are stored; only a SHA-256 hex digest.
-- • No names, emails, or other PII are stored.
-- • Visitors are identified by a random UUID stored in localStorage
--   (visitor_id) and a per-session UUID (session_id).
-- • The DNT (Do Not Track) header is respected by the API handler:
--   if DNT=1 the POST /visit call is silently ignored server-side.
--
-- Design
-- ──────
-- • visitor_sessions holds one row per unique visitor (visitor_id).
--   On each new visit the row is upserted: last_visit and visit_count
--   are updated, is_new is set to false after the first visit.
-- • page_views holds one row per page load event, linked to the
--   visitor_session row. UTM parameters, referrer, and screen size
--   are stored here (not in visitor_sessions) so multiple visits with
--   different campaigns are tracked independently.

CREATE TABLE IF NOT EXISTS "visitor_sessions" (
  "id"          serial     PRIMARY KEY NOT NULL,
  "visitor_id"  text       NOT NULL,
  "session_id"  text       NOT NULL,
  "first_visit" timestamp  NOT NULL DEFAULT now(),
  "last_visit"  timestamp  NOT NULL DEFAULT now(),
  "visit_count" integer    NOT NULL DEFAULT 1,
  "is_new"      boolean    NOT NULL DEFAULT true,
  "country"     text,
  "state"       text,
  "city"        text,
  "browser"     text,
  "os"          text,
  "device"      text,
  "language"    text,
  "timezone"    text,
  "hashed_ip"   text,
  "created_at"  timestamp  NOT NULL DEFAULT now(),
  "updated_at"  timestamp  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "page_views" (
  "id"                  serial     PRIMARY KEY NOT NULL,
  "visitor_session_id"  integer    NOT NULL,
  "page"                text       NOT NULL,
  "referrer"            text,
  "utm_source"          text,
  "utm_medium"          text,
  "utm_campaign"        text,
  "utm_content"         text,
  "screen_width"        integer,
  "screen_height"       integer,
  "user_agent"          text,
  "created_at"          timestamp  NOT NULL DEFAULT now(),
  CONSTRAINT "page_views_visitor_session_fk"
    FOREIGN KEY ("visitor_session_id") REFERENCES "visitor_sessions"("id") ON DELETE CASCADE
);

-- visitor_sessions indexes
CREATE UNIQUE INDEX IF NOT EXISTS "idx_vs_visitor_id"
  ON "visitor_sessions" ("visitor_id");

CREATE INDEX IF NOT EXISTS "idx_vs_last_visit"
  ON "visitor_sessions" ("last_visit" DESC);

CREATE INDEX IF NOT EXISTS "idx_vs_is_new"
  ON "visitor_sessions" ("is_new");

CREATE INDEX IF NOT EXISTS "idx_vs_hashed_ip"
  ON "visitor_sessions" ("hashed_ip")
  WHERE "hashed_ip" IS NOT NULL;

-- page_views indexes
CREATE INDEX IF NOT EXISTS "idx_pv_visitor_session_id"
  ON "page_views" ("visitor_session_id");

CREATE INDEX IF NOT EXISTS "idx_pv_created_at"
  ON "page_views" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_pv_utm_source"
  ON "page_views" ("utm_source")
  WHERE "utm_source" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_pv_utm_campaign"
  ON "page_views" ("utm_campaign")
  WHERE "utm_campaign" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_pv_page"
  ON "page_views" ("page");
