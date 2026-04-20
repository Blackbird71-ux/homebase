#!/bin/sh
set -e

export DATABASE_URL="${DATABASE_URL:-file:/data/homebase.db}"

echo "=== HomeBase Container Startup ==="
echo "Database path: $DATABASE_URL"

# Create data directory if it doesn't exist
mkdir -p /data

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

echo "Running database migrations..."
if node node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma; then
  echo "✓ Database migrations completed successfully"
else
  echo "✗ Database migrations failed"
  echo "Attempting to generate Prisma client..."
  npx prisma generate
  echo "Retrying migrations..."
  node node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma || {
    echo "✗ Critical: Database migrations failed after retry"
    exit 1
  }
fi

# Verify database is accessible
echo "Verifying database connection..."
if npx prisma db execute --stdin --url="$DATABASE_URL" <<< "SELECT 1;" >/dev/null 2>&1; then
  echo "✓ Database connection verified"
else
  echo "✗ Warning: Could not verify database connection"
fi

if [ -f /etc/cloudflared/config.yml ]; then
  echo "Starting Cloudflare tunnel..."
  cloudflared tunnel --no-autoupdate --config /etc/cloudflared/config.yml run &
fi

echo "Starting Homebase..."
exec node server.js
