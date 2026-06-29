-- Migration 0023: PostgreSQL-backed rate limiter table
--
-- Replaces the previous in-memory sliding-window rate limiter with a
-- persistent, multi-instance-safe implementation. Uses a single atomic
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING count to increment
-- and read the counter in one round-trip — no separate SELECT needed.
--
-- Design:
--   key         — composite label:ip:window_bucket (fixed-window per 15 min)
--   expires_at  — when this window expires; used to ignore stale rows and
--                 as the cleanup predicate
--   count       — number of requests seen in this window from this IP
--
-- Cleanup:
--   DELETE FROM rate_limit_windows WHERE expires_at < NOW()
--   Runs on a 5-minute timer in the API server process.
--   The expires_at index makes this O(log n) rather than a full table scan.
--
-- REVERSIBLE: DROP TABLE rate_limit_windows;

CREATE TABLE IF NOT EXISTS "rate_limit_windows" (
  "key"        TEXT                     PRIMARY KEY,
  "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
  "count"      INTEGER                  NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS "idx_rate_limit_windows_expires"
  ON "rate_limit_windows" ("expires_at");
