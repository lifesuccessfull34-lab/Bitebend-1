# Database Lifecycle Guide

End-to-end reference for the Bitebend PostgreSQL database from initial setup through production operation, backup, and disaster recovery.

---

## Lifecycle Overview

```
Fresh Install → Migrate → Validate → Develop → Test → Pre-Deploy Backup
                                                            ↓
                                               Deploy → Health Check
                                                            ↓
                                               Production → Monitor → Backup → Restore (if needed)
```

---

## Stage 1: Fresh Install

Starting from a blank database on a new environment.

### Prerequisites
- PostgreSQL running and accessible
- `pnpm` installed
- Environment configured: `DATABASE_URL` (or default `postgresql://postgres:password@helium/heliumdb`)

### Steps

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Run all migrations (creates all 17 tables + Drizzle journal)
pnpm migrate

# 3. Validate schema
pnpm validate:db

# 4. Start the server
pnpm --filter @workspace/api-server run dev
```

### What pnpm migrate does

1. Ensures the `sessions` table exists (connect-pg-simple DDL, only runtime-managed table)
2. Detects if the DB was initialised via `drizzle-kit push` (no journal) — if so, stamps it
3. Runs all `.sql` migration files in `lib/db/drizzle/` in order (0000 → 0012)
4. Calls `validateSchema()` — checks all 17 tables and 6 critical columns
5. Exits 0 on success, 1 on any failure

### Expected log output on success

```
[DB_BOOT] Starting database bootstrap
[DB_BOOT_START] ...
[DB_BOOT] migrations folder: .../migrations
[DB_BOOT] sessions table ready
[MIGRATION_START] Running 13 migrations...
[MIGRATION_COMPLETE] All migrations applied in <N>ms
[DB_MIGRATIONS_OK] All migrations applied
[DB_SCHEMA_VALIDATED] All required tables present
[DB_SCHEMA_VALIDATED] All required columns present
[DB_SCHEMA_VALIDATED] Schema validation passed
```

---

## Stage 2: Development Workflow

### Adding a new migration

1. Edit the schema in `lib/db/src/schema/schema.ts`
2. Generate a migration file:
   ```bash
   pnpm --filter @workspace/db generate
   ```
3. Review the generated `.sql` in `lib/db/drizzle/`
4. Run it:
   ```bash
   pnpm migrate
   ```
5. If you added a column critical for startup, add it to `REQUIRED_COLUMNS` in `migrate.ts`

### Modifying an existing migration

**Never edit a migration file that has already been applied to any environment.**
Create a new migration instead. Drizzle validates hashes — modifying an applied migration will cause a hash mismatch error.

### Schema validation

```bash
pnpm validate:db
```

Reports:
- Tables found vs. required
- Column presence for critical fields
- Index presence
- Migration journal entry count

---

## Stage 3: Testing

### DB health integration test

```bash
# Run the boot-abort test (renames a table, checks exit code 1, restores)
bash scripts/test-db-boot.sh
```

The test verifies:
- Server exits with code 1 when a required table is missing
- The `[MIGRATION_ERROR]` message includes the recovery command
- Schema is restored cleanly after the test

### Manual health check

```bash
# During development (server must be running)
curl -s http://localhost:${PORT}/api/health/db | jq .

# Admin-authenticated details endpoint
curl -s -b "session=..." http://localhost:${PORT}/api/health/db/details | jq .
```

---

## Stage 4: Pre-Deploy Backup

Always take a backup before deploying to production.

```bash
# Full compressed backup
BACKUP_FILE="pre_deploy_$(date +%Y%m%d_%H%M%S).dump"
PGPASSWORD=password pg_dump -h helium -U postgres -d heliumdb -Fc -Z 9 -f "$BACKUP_FILE"

# Verify it's readable
PGPASSWORD=password pg_restore -Fc --list "$BACKUP_FILE" | wc -l
```

See `docs/database-backup.md` for the full checklist.

---

## Stage 5: Deploy

### Server startup sequence

On every boot, `index.ts` runs a startup safety check before accepting any requests:

```
1. [DB_BOOT_START]  Record start time
2. Query information_schema.tables for all tables in 'public' schema
3. Check all 6 STARTUP_REQUIRED_TABLES are present
4. If any missing → [MIGRATION_ERROR] + process.exit(1)
5. [DB_BOOT_COMPLETE] with durationMs
6. [DB_SCHEMA_VALIDATED] Startup schema check passed
7. Server begins listening for requests
```

If step 4 fires, the fix is always:
```bash
pnpm migrate
```

### Post-deploy verification

```bash
# 1. Check server health
curl -s https://<domain>/api/healthz | jq .status

# 2. Check DB health
curl -s https://<domain>/api/health/db | jq '{status, missingTables}'

# 3. Check detailed metrics (requires admin session)
curl -s -b "session=..." https://<domain>/api/health/db/details | jq '{status, migrationCount, rowCounts}'
```

---

## Stage 6: Production Operation

### Health monitoring

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/healthz` | Public | Build version, commit match |
| `GET /api/health/db` | Public | Table presence, migration count |
| `GET /api/health/db/details` | Admin | Row counts, DB size, uptime, warnings |

### Row count warning thresholds

The `/api/health/db/details` endpoint emits warnings when:
- `resources` table exceeds **100,000 rows** → consider archiving old resources
- `orders` table exceeds **1,000,000 rows** → consider table partitioning

### Log prefix reference

| Prefix | Source | Meaning |
|---|---|---|
| `[DB_BOOT]` | migrate.ts, index.ts | Bootstrap step in progress |
| `[DB_BOOT_START]` | index.ts | Startup schema check beginning |
| `[DB_BOOT_COMPLETE]` | index.ts | Startup schema check finished (includes durationMs) |
| `[DB_MIGRATIONS_OK]` | migrate.ts | All migration SQL files applied |
| `[DB_SCHEMA_VALIDATED]` | migrate.ts, index.ts | Schema validation passed |
| `[MIGRATION_START]` | migrate.ts | Drizzle migrate() call starting |
| `[MIGRATION_COMPLETE]` | migrate.ts | Drizzle migrate() call finished (includes durationMs) |
| `[MIGRATION_ERROR]` | migrate.ts, index.ts | Missing table/column or migration failure |

---

## Stage 7: Backup (Scheduled)

### Recommended backup schedule

```bash
# Daily backup cron (runs at 2:00 AM)
0 2 * * * PGPASSWORD=password pg_dump -h helium -U postgres -d heliumdb -Fc -Z 9 \
  -f /backups/daily_$(date +\%Y\%m\%d).dump

# Pre-deploy backup (run manually before every deployment)
bash scripts/pre-deploy-backup.sh
```

### Backup service interface

`artifacts/api-server/src/lib/backupService.ts` provides a provider-agnostic interface:
- `createBackup(label?)` — full pg_dump
- `restoreBackup(id)` — pg_restore from stored backup
- `listBackups()` — list available snapshots

Supported future providers: `local`, `s3`, `supabase`, `r2`.
Configure via `BACKUP_PROVIDER` environment variable.

---

## Stage 8: Restore

For restore procedures, see `docs/database-backup.md` → Emergency Recovery Procedures.

Quick reference:
```bash
# From most recent backup
PGPASSWORD=password pg_restore -h helium -U postgres -d heliumdb -Fc \
  --no-owner --no-acl pre_deploy_20250101_120000.dump

# Always re-run migrations after restore
pnpm migrate && pnpm validate:db
```

---

## Migration File Inventory

| File | Tables/Changes |
|---|---|
| `0000_...sql` | users, restaurants, menu_categories, menu_items, orders, order_items, notifications, restaurant_tables, platform_settings, subscription_plans, subscription_transactions, admin_password_reset_tokens, image_blobs, bill_links |
| `0001–0010` | Incremental column additions |
| `0011_...sql` | owner_password_reset_tokens |
| `0012_...sql` | resources (full CMS schema) |
| _(runtime)_ | sessions (connect-pg-simple, not in migration files) |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `[MIGRATION_ERROR] missing table` | Migrations not run | `pnpm migrate` |
| `42P07 already exists` | Push-initialised DB (no journal) | `pnpm migrate` (auto-stamps) |
| Hash mismatch error | Migration file was modified after applying | Restore file from git, or truncate journal and re-stamp |
| `sessions` table missing | Server never ran since DB wipe | `pnpm migrate` (ensureSessionsTable runs first) |
| Cannot connect to DB | Wrong DATABASE_URL or DB not running | Check `DATABASE_URL` env var |
| Server exits immediately | Missing required table at startup | Check logs for `[MIGRATION_ERROR]`, run `pnpm migrate` |
