# Database Setup — Bitebend

## Overview

Bitebend uses a PostgreSQL database managed through Drizzle ORM. The schema is
fully defined in `lib/db/src/schema/schema.ts` and applied via migration files
in `lib/db/drizzle/`. All 19 application tables are created exclusively through
migrations — no runtime DDL runs in the API server process.

The only exception is the `sessions` table (managed by `connect-pg-simple`),
which is created via `ensureSessionsTable()` in the migrate script because it
falls outside Drizzle's schema management.

---

## Table inventory

| Table | Migration | Notes |
|---|---|---|
| `admin_password_reset_tokens` | 0000 | Admin password reset flow |
| `image_blobs` | 0000 | Uploaded image storage |
| `menu_categories` | 0000 | Per-restaurant menu categories |
| `menu_items` | 0000 | Per-restaurant menu items |
| `notifications` | 0000 | In-app notification store |
| `order_items` | 0000 | Line items on each order |
| `orders` | 0000 | Customer orders |
| `platform_settings` | 0000 | Key-value platform config |
| `restaurant_tables` | 0000 | Physical tables / QR targets |
| `restaurants` | 0000 | Restaurant profiles |
| `subscription_plans` | 0000 | Available subscription tiers |
| `subscription_transactions` | 0000 | Payment records |
| `users` | 0000 | Admin + owner accounts |
| `bill_links` | 0009 | Shareable bill URLs |
| `owner_password_reset_tokens` | 0011 | Owner password reset flow |
| `resources` | 0012 | CMS content (public portal + admin) |
| `sessions` | runtime | connect-pg-simple (ensureSessionsTable) |

---

## Fresh deployment — step by step

```bash
# 1. Provision the database (DATABASE_URL must be set)
#    Ensure DATABASE_URL is configured in your environment / secrets.

# 2. Apply all migrations (creates every table from scratch)
pnpm migrate

# 3. Validate the schema
pnpm validate:db

# 4. (Optional) seed an admin account
pnpm --filter @workspace/api-server run seed:dev

# 5. Start the API server
pnpm --filter @workspace/api-server run start
```

`pnpm migrate` is idempotent — it is safe to run multiple times. On a fresh
database it creates all tables. On an existing database it applies only the
migrations that have not yet been stamped in `drizzle.__drizzle_migrations`.

---

## Adding a new migration

1. Edit `lib/db/src/schema/schema.ts` to reflect the change.
2. Run `pnpm --filter @workspace/db run generate` (or create the SQL file manually).
3. The new `.sql` file appears in `lib/db/drizzle/`. Add its entry to
   `lib/db/drizzle/meta/_journal.json` (increment `idx`, set a unique `when`
   timestamp in milliseconds, set `tag` to the filename without `.sql`).
4. Run `pnpm migrate` to apply the migration locally.
5. Run `pnpm validate:db` to confirm the schema is correct.

---

## Migration flow (existing database)

```
pnpm migrate
  │
  ├─ ensureSessionsTable()         ← always idempotent (IF NOT EXISTS)
  │
  ├─ drizzle migrate()
  │    ├─ reads drizzle.__drizzle_migrations for already-applied entries
  │    ├─ runs each un-stamped SQL file in journal order
  │    └─ stamps applied entries in __drizzle_migrations
  │
  └─ validateSchema()              ← checks all required tables + columns
       ├─ [DB_SCHEMA_VALIDATED]    on success
       └─ [MIGRATION_ERROR]        on failure (lists missing objects)
```

### Push-initialised DB detection

If the database was bootstrapped via `drizzle-kit push` (no migration journal),
`drizzle migrate()` fails with "table already exists" (PG error 42P07). The
migration script detects this, stamps all journal entries, and retries — making
`migrate()` a no-op on the already-correct schema.

---

## Startup safety

On every boot, the API server runs a quick check for the 6 most critical tables
(`users`, `restaurants`, `sessions`, `resources`, `orders`, `owner_password_reset_tokens`).
If any are missing the server logs `[MIGRATION_ERROR]` with the missing table
names and exits with code 1 — it does **not** silently start in a broken state.

```
[MIGRATION_ERROR] DB startup check failed — missing tables: resources, sessions
[MIGRATION_ERROR] Run: pnpm migrate
```

---

## Validation command

```bash
pnpm validate:db
```

Checks:
- All 17 required tables exist
- All required columns exist (including post-migration additions like `visible_to`,
  `razorpay_webhook_secret`, `short_id`, etc.)
- Critical indexes exist (`IDX_sessions_expire`, `bill_links_short_id_idx`)
- Drizzle journal is accessible and reports its stamped migration count

Exit codes: `0` = pass, `1` = fail.

Log prefixes:
- `[DB_BOOT]` — startup / bootstrap steps
- `[DB_MIGRATIONS_OK]` — all migrations applied successfully
- `[DB_SCHEMA_VALIDATED]` — individual checks passed
- `[MIGRATION_ERROR]` — any missing table, column, or migration failure

---

## Health endpoint

```
GET /api/health/db
```

Returns a JSON payload with:

```json
{
  "status": "ok",
  "tablesFound": ["admin_password_reset_tokens", "..."],
  "missingTables": [],
  "requiredTableCount": 17,
  "migrationState": {
    "stampedCount": 13,
    "status": "ok"
  }
}
```

HTTP 200 when all required tables are present, HTTP 503 when any are missing.

---

## Recovery process

### Symptom: API returns 500 on all data routes

1. Check `GET /api/health/db` — look at `missingTables`.
2. Run `pnpm validate:db` to get the full picture.
3. Run `pnpm migrate` to apply any missing migrations.
4. Restart the API server.

### Symptom: `[MIGRATION_ERROR]` on startup

The server exited because required tables are missing. Run `pnpm migrate` before
restarting.

### Symptom: `drizzle.__drizzle_migrations` is empty but tables exist

This happens when the DB was bootstrapped via `drizzle-kit push` rather than
`pnpm migrate`. Running `pnpm migrate` will detect this automatically (via the
"push-initialised DB" code path), stamp all journal entries, and exit cleanly.

---

## Production checklist

- [ ] `DATABASE_URL` is set as a secret / environment variable
- [ ] `pnpm migrate` has been run and exited 0
- [ ] `pnpm validate:db` passes with 0 errors
- [ ] `GET /api/health/db` returns HTTP 200
- [ ] API server logs show `[DB_MIGRATIONS_OK]` and `[DB_SCHEMA_VALIDATED]`
- [ ] API server logs show `Server listening` (not `[MIGRATION_ERROR]`)

---

## Integration test — fresh DB to visible resource

```bash
# 1. Wipe the DB (dev only!)
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 2. Apply all migrations
pnpm migrate
# Expected: [DB_MIGRATIONS_OK] ... [DB_SCHEMA_VALIDATED] Schema validation passed

# 3. Validate
pnpm validate:db
# Expected: exit 0, [DB_SCHEMA_VALIDATED] Validation PASSED

# 4. Start the API server
pnpm --filter @workspace/api-server run start

# 5. Create a resource (as super_admin)
curl -X POST /api/resources \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","type":"faq","status":"active","approvalStatus":"approved","visibleTo":"public"}'

# 6. Confirm it appears on the public endpoint
curl /api/resources
# Expected: [{...resource...}]
```
