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
# 1. Ensure /data directory structure exists and is owned by nextjs
# ---------------------------------------------------------------------------
echo ""
echo ">> [1/6] Setting up /data directory structure..."
mkdir -p /data/uploads          # recipe images uploaded by users
mkdir -p /data/documents        # document vault files
mkdir -p /data/bill-attachments # invoice/reference docs attached to bills
mkdir -p /data/income-attachments # payslips/remittance docs attached to income
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
echo ">> [2/6] Pre-migration backup..."
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
echo ">> [3/6] Running database migrations..."
echo "   Schema  : $(pwd)/prisma/schema.prisma"
echo "   Prisma  : $(node_modules/.bin/prisma --version 2>/dev/null | head -1 || echo 'unknown')"

# Remove any migrations that are recorded as failed so `migrate deploy`
# will retry them with the corrected SQL.
#
# Previously this marked them as "finished" which caused migrate deploy to
# skip them, leaving the columns absent from the database but recorded as
# applied. This was broken for cases like `ALTER TABLE ... ADD COLUMN ... UNIQUE`
# which SQLite rejects — the migration failed, columns were never created,
# but marking it finished told Prisma "all good" when it wasn't.
if [ -f "$DB_PATH" ]; then
  STALE=$(sqlite3 "$DB_PATH" \
    "SELECT count(*) FROM _prisma_migrations WHERE logs IS NOT NULL OR (finished_at IS NULL AND rolled_back_at IS NULL);" 2>/dev/null || echo "0")
  if [ "$STALE" -gt 0 ]; then
    echo "   ! Found $STALE stale/failed migration record(s) – removing so migrate deploy retries..."
    sqlite3 "$DB_PATH" \
      "DELETE FROM _prisma_migrations WHERE logs IS NOT NULL OR (finished_at IS NULL AND rolled_back_at IS NULL);"
    echo "   ✓ Stale records removed"
  fi
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
# 4. Verify the database is healthy and reachable
# ---------------------------------------------------------------------------
echo ""
echo ">> [4/6] Verifying database health..."
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

# ---------------------------------------------------------------------------
# 5. Set up daily backup cron job (runs at 03:00 every night)
# ---------------------------------------------------------------------------
echo ""
echo ">> [5/6] Configuring scheduled backups..."
echo "0 3 * * * su-exec nextjs:nodejs /app/scripts/backup-db.sh /data/backups >> /data/backups/cron.log 2>&1" \
  > /etc/crontabs/root
crond -b -l 2
echo "   ✓ Cron daemon started (daily backup at 03:00)"

# ---------------------------------------------------------------------------
# 6. Optional: Cloudflare tunnel
# ---------------------------------------------------------------------------
echo ""
echo ">> [6/6] Starting services..."
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
