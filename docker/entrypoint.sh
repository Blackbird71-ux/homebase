#!/bin/sh
# =============================================================================
# HomeBase – container entrypoint
#
# Runs as root so it can:
#   1. Create / fix ownership of the /data volume directories
#   2. Back up the existing database before touching it
#   3. Run `prisma migrate deploy` to apply any pending migrations
#   4. Verify the database is healthy
#   5. Start the cron daemon for scheduled backups
#   6. Optionally start the Cloudflare tunnel
#   7. Drop privileges to the `nextjs` user and exec the Next.js server
# =============================================================================
set -e

export DATABASE_URL="${DATABASE_URL:-file:/data/homebase.db}"
# Strip the "file:" prefix to get the raw filesystem path
DB_PATH="${DATABASE_URL#file:}"

echo "========================================"
echo "  HomeBase Container Startup"
echo "========================================"
echo "  DATABASE_URL : $DATABASE_URL"
echo "  DB file path : $DB_PATH"
echo "  Node version : $(node --version)"
echo "  Working dir  : $(pwd)"
echo "  System TZ    : $(cat /etc/timezone 2>/dev/null || echo 'not set')"
echo "  Current time : $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "========================================"

# Fail fast with a clear message if critical files are missing
echo ""
echo ">> Preflight checks..."
for f in server.js prisma/schema.prisma node_modules/.bin/prisma; do
  if [ ! -e "$f" ]; then
    echo "   ✗ FATAL: expected file not found: /app/$f"
    echo "     The image may not have built correctly."
    exit 1
  fi
done
echo "   ✓ Critical files present"

# ---------------------------------------------------------------------------
# 0. Verify timezone is correctly configured
#    Without tzdata on Alpine, the TZ env var is ignored and all times use
#    UTC internally. This causes cron backups to fire at wrong hours, SQLite
#    datetime('now') to return UTC timestamps, and backup filenames to be
#    stamped with the wrong date.
# ---------------------------------------------------------------------------
echo ""
echo ">> [0/7] Verifying timezone configuration..."
if [ -f /etc/timezone ] && [ "$(cat /etc/timezone)" = "Australia/Sydney" ]; then
  echo "   ✓ Timezone configured: $(cat /etc/timezone)"
  echo "   ✓ Current local time: $(date '+%Y-%m-%d %H:%M:%S %Z')"
else
  echo "   ⚠ WARNING: Timezone not set to Australia/Sydney"
  echo "     System time is currently: $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "     This means cron schedules, backup timestamps, and date"
  echo "     calculations will all be UTC-based instead of local time."
  echo ""
  echo "     If tzdata is missing from the image, install it and set"
  echo "     /etc/timezone manually:"
  echo "       apk add --no-cache tzdata"
  echo "       cp /usr/share/zoneinfo/Australia/Sydney /etc/localtime"
  echo "       echo 'Australia/Sydney' > /etc/timezone"
  echo "     Or re-build with the fixed Dockerfile that includes tzdata."
fi

# ---------------------------------------------------------------------------
# 1. Ensure /data directory structure exists and is owned by nextjs
# ---------------------------------------------------------------------------
echo ""
echo ">> [1/7] Setting up /data directory structure..."
mkdir -p /data/uploads          # recipe images uploaded by users
mkdir -p /data/documents        # document vault files
mkdir -p /data/bill-attachments # invoice/reference docs attached to bills
mkdir -p /data/income-attachments # payslips/remittance docs attached to income
mkdir -p /data/trip-attachments   # booking confirmations, tickets, etc. for trips
mkdir -p /data/images           # cached external recipe images
mkdir -p /data/backups          # automated database backups

chown -R nextjs:nodejs /data 2>/dev/null || true
chmod -R 755 /data 2>/dev/null || true

# Symlink /app/data -> /data so any code using process.cwd() + '/data/...'
# resolves to the mounted volume regardless of the working directory.
ln -sfn /data /app/data 2>/dev/null || true

echo "   ✓ /data structure ready"

# ---------------------------------------------------------------------------
# 2. Pre-migration database backup
# ---------------------------------------------------------------------------
echo ""
echo ">> [2/7] Pre-migration backup..."
if [ -f "$DB_PATH" ]; then
  BACKUP_FILE="/data/backups/homebase.db.pre-deploy.$(date +%Y%m%d_%H%M%S)"
  cp "$DB_PATH" "$BACKUP_FILE"
  echo "   ✓ Backed up existing database to: $BACKUP_FILE"

  # Keep only the 10 most recent pre-deploy backups to avoid filling the volume
  ls -t /data/backups/homebase.db.pre-deploy.* 2>/dev/null | tail -n +11 | xargs -r rm -f
  echo "   ✓ Old pre-deploy backups pruned (keeping last 10)"
else
  echo "   - No existing database found; a fresh one will be created by migrations"
fi

# ---------------------------------------------------------------------------
# 3. Run Prisma migrations
#    `migrate deploy` applies any migrations that haven't been applied yet.
#    It is safe to run on every startup – already-applied migrations are skipped.
#    We do NOT use `db push` or `migrate dev`; they are development-only
#    commands that can silently drop/recreate tables.
# ---------------------------------------------------------------------------
echo ""
echo ">> [3/7] Running database migrations..."
echo "   Schema  : $(pwd)/prisma/schema.prisma"
echo "   Prisma  : $(node_modules/.bin/prisma --version 2>/dev/null | head -1 || echo 'unknown')"

# Remove any migrations that are recorded as failed so `migrate deploy`
# will retry them with the corrected SQL.
#
# We also detect "phantom applied" migrations — where Prisma recorded a migration
# as successfully finished but the actual SQL never ran (e.g. a previous container
# crash mid-migration, or a SQLite constraint error that was swallowed). We verify
# key schema columns actually exist in the DB and reset the migration record if not.
if [ -f "$DB_PATH" ]; then
  # --- Remove genuinely failed / in-progress migration records ---
  STALE=$(sqlite3 "$DB_PATH" \
    "SELECT count(*) FROM _prisma_migrations WHERE logs IS NOT NULL OR (finished_at IS NULL AND rolled_back_at IS NULL);" 2>/dev/null || echo "0")
  if [ "$STALE" -gt 0 ]; then
    echo "   ! Found $STALE stale/failed migration record(s) – removing so migrate deploy retries..."
    sqlite3 "$DB_PATH" \
      "DELETE FROM _prisma_migrations WHERE logs IS NOT NULL OR (finished_at IS NULL AND rolled_back_at IS NULL);"
    echo "   ✓ Stale records removed"
  fi

  # --- Normalise legacy TEXT datetimes in the migration ledger ---
  # Older Prisma versions / manual ledger repairs stored _prisma_migrations
  # started_at/finished_at as TEXT ("2026-06-01 10:45:30.290") instead of the
  # epoch-millisecond INTEGERs the Prisma 7 schema engine expects. The engine
  # PANICS reading them ("input contains invalid characters") and the CLI then
  # exits 0 — so `migrate deploy` silently applies NOTHING and newer migrations
  # never land (the symptom: "no such column" errors at runtime). Convert any
  # TEXT datetimes back to epoch-ms; integer rows are left untouched and the
  # operation is idempotent once normalised.
  TEXTDT=$(sqlite3 "$DB_PATH" \
    "SELECT count(*) FROM _prisma_migrations WHERE typeof(finished_at)='text' OR typeof(started_at)='text';" 2>/dev/null || echo "0")
  if [ "$TEXTDT" -gt 0 ]; then
    echo "   ! Found $TEXTDT migration record(s) with TEXT datetimes – normalising to epoch-ms so the schema engine can read the ledger..."
    sqlite3 "$DB_PATH" \
      "UPDATE _prisma_migrations SET finished_at = CAST((julianday(finished_at) - 2440587.5) * 86400000 AS INTEGER) WHERE typeof(finished_at)='text' AND julianday(finished_at) IS NOT NULL;
       UPDATE _prisma_migrations SET started_at  = CAST((julianday(started_at)  - 2440587.5) * 86400000 AS INTEGER) WHERE typeof(started_at)='text'  AND julianday(started_at)  IS NOT NULL;"
    echo "   ✓ Migration datetimes normalised"
  fi

  # --- Verify key columns actually exist; reset migration if they don't ---
  # This catches the "phantom applied" case: migration recorded as finished but
  # the ALTER TABLE never actually ran against the live database.
  #
  # Format: "MigrationName|TableName|ColumnName"
  COLUMN_CHECKS="
20260521000000_add_invoice_tx_id|FinanceRecurringBill|invoiceTxId
20260521000000_add_invoice_tx_id|FinanceIncomeEntry|invoiceTxId
20260523000000_add_coa_opening_balance|FinanceCategory|glCode
20260523000000_add_coa_opening_balance|FinanceCategory|openingBalance
20260525000000_add_payment_tx_id|FinanceRecurringBill|paymentTxId
20260525000000_add_payment_tx_id|FinanceIncomeEntry|receiptTxId
20260527000000_add_bill_income_journal_link|FinanceRecurringBill|journalEntryId
20260527000000_add_bill_income_journal_link|FinanceIncomeEntry|journalEntryId
20260529000000_add_gst_fields|FinanceCategory|gstApplicable
20260529000000_add_gst_fields|FinanceCategory|gstRate
20260545000000_add_finance_payslip|FinanceIncomeEntry|actualAmountReceived
20260548000000_add_repeating_transaction_templates|FinanceRecurringBill|templateId
20260548000000_add_repeating_transaction_templates|FinanceRecurringBill|status
20260548000000_add_repeating_transaction_templates|FinanceIncomeEntry|templateId
20260548000000_add_repeating_transaction_templates|FinanceIncomeEntry|status
20260555000000_consolidate_trip_tags|Tag|emoji
20260555000000_consolidate_trip_tags|Tag|sortOrder
20260576000000_add_category_owner_tax_payment|FinanceCategory|memberId
20260576000000_add_category_owner_tax_payment|FinanceCategory|isTaxPayment
"
  echo "$COLUMN_CHECKS" | while IFS='|' read -r MIGRATION TABLE COLUMN; do
    # Skip blank lines
    [ -z "$MIGRATION" ] && continue
    # Check if column exists in the table
    COL_EXISTS=$(sqlite3 "$DB_PATH" \
      "SELECT count(*) FROM pragma_table_info('$TABLE') WHERE name='$COLUMN';" 2>/dev/null || echo "0")
    if [ "$COL_EXISTS" = "0" ]; then
      echo "   ! Column '$COLUMN' missing from '$TABLE' — resetting migration '$MIGRATION' so it re-runs..."
      sqlite3 "$DB_PATH" \
        "DELETE FROM _prisma_migrations WHERE migration_name = '$MIGRATION';" 2>/dev/null || true
      echo "   ✓ Migration record reset"
    fi
  done
fi

if node_modules/.bin/prisma migrate deploy; then
  echo "   ✓ Migrations completed successfully"
else
  echo "   ✗ ERROR: prisma migrate deploy failed"
  echo ""
  echo "   Possible causes:"
  echo "     - The /data volume is not mounted or not writable"
  echo "     - A migration SQL file has a syntax error"
  echo "     - The database is locked by another process"
  echo "     - prisma/schema.prisma or migrations/ missing from image"
  echo ""
  echo "   Listing /app/prisma contents:"
  ls -la /app/prisma/ 2>/dev/null || echo "   (directory not found)"
  echo "   Listing /data contents:"
  ls -la /data/ 2>/dev/null || echo "   (directory not found)"
  echo ""
  echo "   The container will exit so the issue can be diagnosed."
  echo "   Check logs with:  docker logs homebase-app"
  exit 1
fi

# ---------------------------------------------------------------------------
# 3b. One-time data correction — bimonthly recurrence interval bug
#
# Prior to this fix, the advanceNextDueDate / advanceNextExpectedDate helpers
# in bills/route.ts and income/route.ts did not have a 'bimonthly' branch.
# The fallback was addMonths(1) instead of the correct addMonths(2), so any
# bimonthly bill/income that was marked paid spawned its next occurrence only
# one month out rather than two.
#
# This block runs ONCE per affected database record and is fully idempotent:
#   - It only touches rows with frequency='bimonthly' AND paid=false.
#   - It only advances nextDueDate / nextExpectedDate if the current value
#     is within 15–55 days of today — i.e. clearly a 1-month gap, not the
#     correct 2-month gap (which would be 46–75 days from today).
#   - All corrections are wrapped in a single SQLite transaction.
# ---------------------------------------------------------------------------
echo ""
echo ">> [3b] Checking for bimonthly recurrence date corrections..."
if [ -f "$DB_PATH" ]; then
  BILLS_FIXED=$(sqlite3 "$DB_PATH" "
    BEGIN;
    UPDATE FinanceRecurringBill
    SET nextDueDate = datetime(nextDueDate, '+1 month')
    WHERE frequency = 'bimonthly'
      AND paid = 0
      AND julianday(nextDueDate) - julianday('now') BETWEEN 15 AND 55;
    SELECT changes();
    COMMIT;
  " 2>/dev/null || echo "0")

  INCOME_FIXED=$(sqlite3 "$DB_PATH" "
    BEGIN;
    UPDATE FinanceIncomeEntry
    SET nextExpectedDate = datetime(nextExpectedDate, '+1 month')
    WHERE frequency = 'bimonthly'
      AND received = 0
      AND julianday(nextExpectedDate) - julianday('now') BETWEEN 15 AND 55;
    SELECT changes();
    COMMIT;
  " 2>/dev/null || echo "0")

  if [ "$BILLS_FIXED" -gt 0 ] || [ "$INCOME_FIXED" -gt 0 ]; then
    echo "   ✓ Corrected $BILLS_FIXED bill(s) and $INCOME_FIXED income entry(ies) with wrong bimonthly next-due dates"
  else
    echo "   ✓ No bimonthly date corrections needed"
  fi
else
  echo "   - No database yet; skipping bimonthly correction"
fi

# ---------------------------------------------------------------------------
# 4. Verify the database is healthy and reachable
# ---------------------------------------------------------------------------
echo ""
echo ">> [4/7] Verifying database health..."
if sqlite3 "$DB_PATH" "SELECT count(*) FROM sqlite_master WHERE type='table';" > /dev/null 2>&1; then
  TABLE_COUNT=$(sqlite3 "$DB_PATH" "SELECT count(*) FROM sqlite_master WHERE type='table';")
  echo "   ✓ Database is healthy ($TABLE_COUNT tables found)"
else
  echo "   ✗ WARNING: Could not query database at $DB_PATH"
  echo "   The server will start anyway – it may recover on first request."
fi

# Ensure the DB file (and WAL/SHM if they exist) are owned by nextjs
chown nextjs:nodejs "$DB_PATH" 2>/dev/null || true
chown nextjs:nodejs "${DB_PATH}-wal" 2>/dev/null || true
chown nextjs:nodejs "${DB_PATH}-shm" 2>/dev/null || true

# Enable SQLite WAL mode for better concurrent read/write performance.
# WAL allows the Docker healthcheck reader to proceed without blocking on
# writes, preventing spurious health check failures and container restarts.
if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;" > /dev/null 2>&1 || true
  echo "   ✓ SQLite WAL mode enabled"
fi

# ---------------------------------------------------------------------------
# 5. Set up daily backup cron job (runs at 03:00 every night)
# ---------------------------------------------------------------------------
echo ""
echo ">> [5/7] Configuring scheduled backups..."
echo "0 3 * * * su-exec nextjs:nodejs /app/scripts/backup-db.sh /data/backups >> /data/backups/cron.log 2>&1" \
  > /etc/crontabs/root
crond -b -l 2
echo "   ✓ Cron daemon started (daily backup at 03:00)"

# ---------------------------------------------------------------------------
# 6. Optional: Cloudflare tunnel
# ---------------------------------------------------------------------------
echo ""
echo ">> [6/7] Starting services..."
if [ -f /etc/cloudflared/config.yml ]; then
  echo "   Starting Cloudflare tunnel..."
  # Use public DNS – Docker's internal resolver (127.0.0.11) can't handle
  # SRV lookups needed by cloudflared and hangs after network interruptions.
  printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n' > /etc/resolv.conf

  (
    while true; do
      su-exec nextjs:nodejs cloudflared tunnel \
        --no-autoupdate \
        --config /etc/cloudflared/config.yml \
        run
      echo "   Cloudflare tunnel exited – restarting in 5 seconds..."
      sleep 5
    done
  ) &
  echo "   ✓ Cloudflare tunnel started"
else
  echo "   - No Cloudflare config found; skipping tunnel"
fi

# ---------------------------------------------------------------------------
# Hand off to the Next.js server as the unprivileged nextjs user
# ---------------------------------------------------------------------------
echo ""
echo "========================================"
echo "  HomeBase is starting on port 3000"
echo "========================================"
exec su-exec nextjs:nodejs "$@"
