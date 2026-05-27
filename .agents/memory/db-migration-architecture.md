---
name: DB migration architecture
description: How Bitebend's database bootstrap works — which tables are migration-backed vs. runtime-ensured, the stamp mechanism, and fresh deployment requirements.
---

## Rule
All application tables MUST be in `lib/db/drizzle/*.sql` migration files.
The only justified runtime-DDL table is `sessions` (managed by connect-pg-simple).

## Why
A previous session had `resources` and `owner_password_reset_tokens` created via
runtime `ensure*Table()` functions in migrate.ts. When the DB was wiped (heliumdb
restart), the server couldn't start and required manual psql execution to recover.
Moving these to proper migration files makes `pnpm migrate` the single source of truth.

## Current migration inventory (as of migration 0012)
- 0000: core tables (users, restaurants, menu_*, orders, etc.)
- 0001–0010: incremental column additions
- 0011: owner_password_reset_tokens (user_id, token, expires_at, used_at)
- 0012: resources (full CMS schema with visible_to, approval_status, etc.)
- sessions: runtime-only via ensureSessionsTable() in migrate.ts

## How to apply
```
pnpm migrate        # build + run dist/migrate.mjs
pnpm validate:db    # build + run dist/validate-db.mjs
```

## Push-initialised DB detection
If drizzle.__drizzle_migrations is empty but tables exist (push-init scenario),
migrate() fails with 42P07, triggering stampPushInitialisedDb() which stamps all
journal entries, then retries. The migration SQL files use IF NOT EXISTS for safety.

## Startup safety
index.ts runs a synchronous check for 6 critical tables on every boot.
Missing tables → [MIGRATION_ERROR] logs → process.exit(1). Server never starts degraded.

## Log prefixes
- [DB_BOOT] — bootstrap steps
- [DB_MIGRATIONS_OK] — all migrations applied
- [DB_SCHEMA_VALIDATED] — validation passed
- [MIGRATION_ERROR] — missing table/column or failure
