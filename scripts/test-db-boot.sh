#!/usr/bin/env bash
# Integration test: verify that the API server startup aborts with exit code 1
# when a required database table is missing.
#
# Test procedure:
#   1. Rename 'sessions' to 'sessions_bak' (simulates missing table)
#   2. Build the server and attempt startup
#   3. Assert exit code is 1 and [MIGRATION_ERROR] is logged
#   4. Rename table back and re-run pnpm migrate to restore
#
# Run from workspace root:
#   bash scripts/test-db-boot.sh

set -euo pipefail

PGCONN="PGPASSWORD=password psql -h helium -U postgres -d heliumdb -q"
PASS=0
FAIL=0
RESTORE_NEEDED=false

RESET="\033[0m"
GREEN="\033[32m"
RED="\033[31m"
BOLD="\033[1m"

pass() { echo -e "  ${GREEN}✓ PASS${RESET}: $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}✗ FAIL${RESET}: $1"; FAIL=$((FAIL + 1)); }
header() { echo -e "\n${BOLD}$1${RESET}"; }

cleanup() {
  if [ "$RESTORE_NEEDED" = true ]; then
    echo ""
    echo "Cleanup: restoring sessions table..."
    $PGCONN -c "ALTER TABLE IF EXISTS sessions_bak RENAME TO sessions;" 2>/dev/null || true
    pnpm migrate --silent 2>/dev/null || true
    echo "  Done."
  fi
}
trap cleanup EXIT

header "=== DB Boot Abort Integration Test ==="

# ── Step 1: Verify DB is accessible ──────────────────────────────────────────
header "Step 1: Verify DB connection"
if $PGCONN -c "SELECT 1;" > /dev/null 2>&1; then
  pass "DB accessible"
else
  fail "Cannot connect to database — aborting test"
  exit 1
fi

# ── Step 2: Verify sessions table currently exists ────────────────────────────
header "Step 2: Verify baseline schema"
ROW=$($PGCONN -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='sessions';")
COUNT=$(echo "$ROW" | tr -d '[:space:]')
if [ "$COUNT" -eq 1 ]; then
  pass "sessions table exists"
else
  fail "sessions table not found — run pnpm migrate first"
  exit 1
fi

# ── Step 3: Build the server ──────────────────────────────────────────────────
header "Step 3: Build server"
pnpm --filter @workspace/api-server run build > /dev/null 2>&1
pass "Build successful"

# ── Step 4: Rename sessions table to simulate missing ─────────────────────────
header "Step 4: Simulate missing required table"
$PGCONN -c "ALTER TABLE sessions RENAME TO sessions_bak;" 2>/dev/null
RESTORE_NEEDED=true
pass "Renamed sessions → sessions_bak"

# ── Step 5: Attempt startup — expect exit 1 ───────────────────────────────────
header "Step 5: Run startup check (expecting exit code 1)"
TMPLOG=$(mktemp)

set +e
timeout 15 node artifacts/api-server/dist/index.mjs > "$TMPLOG" 2>&1
EXIT_CODE=$?
set -e

# timeout returns 124 if the process was killed; 1 if it self-exited
if [ "$EXIT_CODE" -eq 1 ]; then
  pass "Server exited with code 1 (correct — migration error)"
elif [ "$EXIT_CODE" -eq 124 ]; then
  fail "Process timed out (15s) without exiting — startup check may not be running"
else
  fail "Expected exit code 1, got $EXIT_CODE"
fi

# ── Step 6: Verify [MIGRATION_ERROR] was logged ───────────────────────────────
header "Step 6: Verify [MIGRATION_ERROR] in logs"
if grep -q "MIGRATION_ERROR" "$TMPLOG" 2>/dev/null; then
  pass "[MIGRATION_ERROR] found in output"
else
  fail "[MIGRATION_ERROR] not found in output"
  echo "  Captured output:"
  cat "$TMPLOG" | head -20
fi

# ── Step 7: Verify recovery command was logged ────────────────────────────────
header "Step 7: Verify recovery command hint in logs"
if grep -q "pnpm migrate" "$TMPLOG" 2>/dev/null; then
  pass "Recovery command 'pnpm migrate' found in output"
else
  fail "Recovery command 'pnpm migrate' not found in output"
fi

rm -f "$TMPLOG"

# ── Step 8: Restore ───────────────────────────────────────────────────────────
header "Step 8: Restore sessions table"
$PGCONN -c "ALTER TABLE sessions_bak RENAME TO sessions;" 2>/dev/null
RESTORE_NEEDED=false
pass "Renamed sessions_bak → sessions"

pnpm migrate > /dev/null 2>&1
pass "pnpm migrate completed"

pnpm validate:db > /dev/null 2>&1
pass "pnpm validate:db passed"

# ── Results ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}=== Results ===${RESET}"
echo -e "  ${GREEN}Passed: $PASS${RESET}"
if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}Failed: $FAIL${RESET}"
  exit 1
else
  echo -e "  Failed: $FAIL"
  echo -e "\n${GREEN}${BOLD}All tests passed.${RESET}"
fi
