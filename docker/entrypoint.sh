#!/bin/sh
set -e

export DATABASE_URL="${DATABASE_URL:-file:/data/homebase.db}"

echo "=== HomeBase Container Startup ==="
echo "Database path: $DATABASE_URL"

# Fix permissions for /data directory (running as root)
echo "Setting up /data directory permissions..."
mkdir -p /data
mkdir -p /data/uploads      # Create uploads directory for recipe images
mkdir -p /data/documents    # Create documents directory for document vault
mkdir -p /data/images   # Create images cache directory for external recipe images
mkdir -p /data/backups  # Create backups directory for automated DB backups
chown -R nextjs:nodejs /data 2>/dev/null || true
chmod -R 755 /data 2>/dev/null || true

# Fix permissions for Prisma client directory
echo "Fixing Prisma client permissions..."
if [ -d /app/node_modules/.prisma ]; then
  chown -R nextjs:nodejs /app/node_modules/.prisma 2>/dev/null || true
  chmod -R 755 /app/node_modules/.prisma 2>/dev/null || true
fi

# Check if database file exists and create backup
if [ -f /data/homebase.db ]; then
  BACKUP_FILE="/data/homebase.db.backup.$(date +%Y%m%d_%H%M%S)"
  echo "Backing up existing database to: $BACKUP_FILE"
  cp /data/homebase.db "$BACKUP_FILE"
  
  # Keep only last 5 backups
  ls -t /data/homebase.db.backup.* 2>/dev/null | tail -n +6 | xargs -r rm -f
else
  echo "No existing database found at /data/homebase.db"
  echo "A new database will be created after migrations"
fi

# Check database file permissions
if [ -f /data/homebase.db ]; then
  echo "Database file permissions:"
  ls -la /data/homebase.db
fi

# Generate Prisma client first to avoid permission issues
echo "Generating Prisma client..."
npx prisma generate 2>/dev/null || echo "Note: Prisma client generation may have warnings"

echo "Running database migrations..."
if npx prisma migrate deploy; then
  echo "✓ Database migrations completed successfully"
else
  echo "✗ Database migrations failed"
  echo "Attempting alternative migration approach..."
  npx prisma db push --accept-data-loss 2>/dev/null || {
    echo "✗ Failed to create database"
    echo "Trying to create database with SQLite directly..."
    sqlite3 /data/homebase.db "VACUUM;" 2>/dev/null || true
  }
fi


# Verify database is accessible
echo "Verifying database connection..."
if echo "SELECT 1;" | npx prisma db execute --stdin >/dev/null 2>&1; then
  echo "✓ Database connection verified"
else
  echo "✗ Warning: Could not verify database connection"
fi


# Set up cron job for automated database backups (runs daily at 3:00 AM)
echo "Setting up automated database backup cron job..."
mkdir -p /data/backups
chown nextjs:nodejs /data/backups
echo "0 3 * * * /app/scripts/backup-db.sh /data/backups >> /data/backups/cron.log 2>&1" > /etc/crontabs/root
crond -b -l 2
echo "✓ Cron daemon started (daily backup at 3:00 AM)"

# Drop privileges to nextjs user for security
echo "Dropping privileges to nextjs user..."
if [ -f /etc/cloudflared/config.yml ]; then
  echo "Starting Cloudflare tunnel..."
  su-exec nextjs:nodejs cloudflared tunnel --no-autoupdate --config /etc/cloudflared/config.yml run &
fi

echo "Starting Homebase..."
exec su-exec nextjs:nodejs node server.js
