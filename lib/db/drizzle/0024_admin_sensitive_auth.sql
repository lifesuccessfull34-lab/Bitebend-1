-- Migration 0024: admin_sensitive_auth
-- Stores the Sensitive Action Password hash for each super_admin.
-- Completely separate from the login password (users.password_hash).
-- One row per super_admin user; ON DELETE CASCADE keeps data tidy.

CREATE TABLE IF NOT EXISTS admin_sensitive_auth (
  id            SERIAL                   PRIMARY KEY,
  user_id       INTEGER                  NOT NULL UNIQUE
                  REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT                     NOT NULL,
  created_at    TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);
