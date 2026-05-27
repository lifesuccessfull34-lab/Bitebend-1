---
name: DB operational layer
description: Health endpoints, structured log prefixes, warning thresholds, backup service interface, admin DB status card, and boot integration test — all added in the DB hardening pass.
---

## Health Endpoints

| Endpoint | Auth | Returns |
|---|---|---|
| GET /api/health/db | Public | table presence, migration count, missing tables |
| GET /api/health/db/details | requireAdmin | row counts, DB size, uptime, warnings, missing tables |

## Structured Log Prefixes (index.ts + migrate.ts)

- `[DB_BOOT_START]` — startup schema check beginning (index.ts)
- `[DB_BOOT_COMPLETE]` — startup schema check done, includes `durationMs` (index.ts)
- `[DB_SCHEMA_VALIDATED]` — validation passed (both files)
- `[MIGRATION_START]` — Drizzle migrate() call starting (migrate.ts)
- `[MIGRATION_COMPLETE]` — Drizzle migrate() call done, includes `durationMs` (migrate.ts)
- `[DB_MIGRATIONS_OK]` — all migration files applied (migrate.ts)
- `[MIGRATION_ERROR]` — failure; always includes recovery command hint (both files)
- `[DB_BOOT]` — general bootstrap step (migrate.ts)
- `[DB_BOOT_COMPLETE]` — full bootstrap complete with `durationMs` (migrate.ts main())

## Warning Thresholds (health/db/details endpoint)

- `resources` > 100,000 rows → warning in response
- `orders` > 1,000,000 rows → warning in response

## Backup Service (backupService.ts)

Interface-only. Factory: `createBackupService(provider?)`. Providers: `local | s3 | supabase | r2`.
Configure via `BACKUP_PROVIDER` env var. All stubs return `{ success: false, error: "...not yet implemented" }`.

**Why:** Provides a stable interface now so future provider implementations don't need to change call sites.

## Admin DB Status Card (Admin.tsx overview tab)

Fetched via `apiFetch<DbHealthDetails>("/health/db/details").catch(() => null)` in the existing `fetchData` Promise.all.
Renders after the pending-payments alert, before the restaurant status tabs.
Shows: healthy/degraded badge, migration count, table count, DB size, uptime, per-table row counts, missing tables with fix command, warnings.

## Integration Test

`scripts/test-db-boot.sh` — renames `sessions` to `sessions_bak`, runs compiled server, asserts exit 1 + `[MIGRATION_ERROR]` in output, renames back and runs `pnpm migrate` to restore. Has `trap cleanup EXIT` so the table is always restored even on test failure.

## Docs

- `docs/database-backup.md` — pg_dump commands, all formats, restore flow, pre-deploy checklist, emergency scenarios
- `docs/database-lifecycle.md` — fresh install → migrate → validate → deploy → monitor → backup → restore
