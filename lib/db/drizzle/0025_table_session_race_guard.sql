-- Migration 0025: race-condition guard for dine-in table sessions
--
-- Two customers scanning the same table's QR at the same instant could both
-- pass the "does an active session already exist for this table?" check
-- before either INSERT completed, creating two concurrent active sessions
-- for the same table (owned by two different phone numbers).
--
-- This partial unique index makes that scenario impossible at the database
-- level: only one active dine-in session per (restaurant, table) can exist.
-- The application catches the resulting unique-violation (23505) and
-- returns the same TABLE_SESSION_CONFLICT response as the existing
-- application-level check.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_table_sessions_active_table_unique"
  ON "table_sessions" ("restaurant_id", "table_number")
  WHERE "session_type" = 'dine_in' AND "status" = 'active';
