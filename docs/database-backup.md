# Database Backup Guide

Complete reference for backing up, restoring, and maintaining the Bitebend PostgreSQL database.

---

## Quick Reference

```bash
# Full backup (plain SQL)
PGPASSWORD=password pg_dump -h helium -U postgres -d heliumdb > backup_$(date +%Y%m%d_%H%M%S).sql

# Full backup (compressed, recommended for production)
PGPASSWORD=password pg_dump -h helium -U postgres -d heliumdb -Fc -Z 9 > backup_$(date +%Y%m%d_%H%M%S).dump

# Restore from SQL backup
PGPASSWORD=password psql -h helium -U postgres -d heliumdb < backup_20250101_120000.sql

# Restore from compressed backup
PGPASSWORD=password pg_restore -h helium -U postgres -d heliumdb -Fc backup_20250101_120000.dump
```

---

## Backup Formats

| Format | Flag | Extension | Pros | Cons |
|---|---|---|---|---|
| Plain SQL | _(default)_ | `.sql` | Human-readable, portable | Large file, no parallelism |
| Custom compressed | `-Fc` | `.dump` | Smaller, parallel restore | Binary only |
| Directory | `-Fd` | `/dir/` | Parallel dump and restore | Multiple files |
| Tar | `-Ft` | `.tar` | Single file, selectable tables | No parallel |

For production deployments, **custom compressed** (`-Fc`) is recommended.

---

## pg_dump Commands

### Full database backup (production-safe)
```bash
PGPASSWORD=password pg_dump \
  -h helium \
  -U postgres \
  -d heliumdb \
  -Fc \
  -Z 9 \
  --no-owner \
  --no-acl \
  -f backup_$(date +%Y%m%d_%H%M%S).dump
```

### Schema-only backup (DDL without data)
```bash
PGPASSWORD=password pg_dump \
  -h helium -U postgres -d heliumdb \
  --schema-only \
  -f schema_$(date +%Y%m%d_%H%M%S).sql
```

### Data-only backup (rows without DDL)
```bash
PGPASSWORD=password pg_dump \
  -h helium -U postgres -d heliumdb \
  --data-only \
  -Fc \
  -f data_$(date +%Y%m%d_%H%M%S).dump
```

### Single table backup
```bash
PGPASSWORD=password pg_dump \
  -h helium -U postgres -d heliumdb \
  -t orders \
  -Fc \
  -f orders_$(date +%Y%m%d_%H%M%S).dump
```

### Exclude large tables (e.g. image_blobs)
```bash
PGPASSWORD=password pg_dump \
  -h helium -U postgres -d heliumdb \
  -Fc \
  --exclude-table=image_blobs \
  -f backup_no_blobs_$(date +%Y%m%d_%H%M%S).dump
```

---

## Restore Flow

### Standard restore from compressed backup

```bash
# Step 1: Verify the backup file is valid
PGPASSWORD=password pg_restore \
  -h helium -U postgres -d heliumdb \
  -Fc \
  --list backup_20250101_120000.dump | head -20

# Step 2: Restore (will error if tables already exist — use --clean to drop first)
PGPASSWORD=password pg_restore \
  -h helium -U postgres -d heliumdb \
  -Fc \
  --no-owner \
  --no-acl \
  backup_20250101_120000.dump

# Step 3: Clean restore (drops existing objects first — use with caution)
PGPASSWORD=password pg_restore \
  -h helium -U postgres -d heliumdb \
  -Fc \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  backup_20250101_120000.dump
```

### Post-restore verification

```bash
# Verify migrations are stamped
pnpm migrate

# Validate schema integrity
pnpm validate:db

# Check row counts on key tables
PGPASSWORD=password psql -h helium -U postgres -d heliumdb -c "
  SELECT
    'users'       AS table_name, COUNT(*) FROM users
  UNION ALL SELECT 'restaurants', COUNT(*) FROM restaurants
  UNION ALL SELECT 'orders',      COUNT(*) FROM orders
  UNION ALL SELECT 'resources',   COUNT(*) FROM resources;
"
```

---

## Pre-Deploy Backup Checklist

Run this checklist before every production deployment:

```bash
# 1. Take a timestamped backup
BACKUP_FILE="pre_deploy_$(date +%Y%m%d_%H%M%S).dump"
PGPASSWORD=password pg_dump -h helium -U postgres -d heliumdb -Fc -Z 9 -f "$BACKUP_FILE"
echo "Backup: $BACKUP_FILE ($(du -sh "$BACKUP_FILE" | cut -f1))"

# 2. Verify backup is readable
PGPASSWORD=password pg_restore -Fc --list "$BACKUP_FILE" | wc -l
echo "Backup objects listed above"

# 3. Run migrations
pnpm migrate

# 4. Validate schema
pnpm validate:db

# 5. Check DB health endpoint
curl -s http://localhost:${PORT}/api/health/db | jq .status

# 6. Record backup filename in deployment log
echo "PRE_DEPLOY_BACKUP=$BACKUP_FILE" >> deployment.log
```

---

## Emergency Recovery Procedures

### Scenario 1: Missing tables after deployment

**Symptom:** Server exits on startup with `[MIGRATION_ERROR] missing table: <name>`

```bash
# Step 1: Run migrations immediately
pnpm migrate

# Step 2: Verify
pnpm validate:db

# Step 3: Restart server
# (server will start normally once all tables exist)
```

### Scenario 2: Corrupted migrations journal

**Symptom:** `migrate()` fails with "hash mismatch" or "already applied" errors

```bash
# Step 1: Check current journal state
PGPASSWORD=password psql -h helium -U postgres -d heliumdb \
  -c "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;"

# Step 2: Clear the journal (will re-stamp from SQL files)
PGPASSWORD=password psql -h helium -U postgres -d heliumdb \
  -c "TRUNCATE drizzle.__drizzle_migrations;"

# Step 3: Re-run migrate (will stamp all entries as push-initialised)
pnpm migrate
```

### Scenario 3: Full database loss

**Symptom:** Cannot connect, or database is empty

```bash
# Step 1: Find most recent backup
ls -lt *.dump | head -5

# Step 2: Create a fresh database if needed
PGPASSWORD=password psql -h helium -U postgres \
  -c "CREATE DATABASE heliumdb;"

# Step 3: Restore from most recent backup
PGPASSWORD=password pg_restore \
  -h helium -U postgres -d heliumdb \
  -Fc \
  --no-owner \
  --no-acl \
  pre_deploy_20250101_120000.dump

# Step 4: Re-run migrations to ensure journal is current
pnpm migrate

# Step 5: Validate
pnpm validate:db
```

### Scenario 4: Data corruption (not schema)

```bash
# Restore data for a single table from backup
PGPASSWORD=password pg_restore \
  -h helium -U postgres -d heliumdb \
  -Fc \
  --data-only \
  -t orders \
  --disable-triggers \
  backup_20250101_120000.dump
```

---

## Retention Policy (Recommended)

| Backup type | Frequency | Keep for |
|---|---|---|
| Pre-deploy snapshot | Every deployment | 30 days |
| Daily backup | Nightly | 14 days |
| Weekly backup | Sunday | 90 days |
| Monthly backup | 1st of month | 1 year |

---

## Environment Variables for Backup Provider

When the `backupService.ts` providers are implemented, configure via environment variables:

```bash
# Provider selection (local | s3 | supabase | r2)
BACKUP_PROVIDER=s3

# AWS S3
AWS_S3_BACKUP_BUCKET=bitebend-db-backups
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-south-1

# Cloudflare R2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BACKUP_BUCKET=bitebend-db-backups

# Supabase Storage
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_KEY=...
SUPABASE_BACKUP_BUCKET=db-backups
```

See `artifacts/api-server/src/lib/backupService.ts` for the provider interface.
