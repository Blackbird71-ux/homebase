#!/bin/sh
set -e

export DATABASE_URL="${DATABASE_URL:-file:/data/homebase.db}"

echo "Running database migrations..."
node node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma

if [ -f /etc/cloudflared/config.yml ]; then
  echo "Starting Cloudflare tunnel..."
  cloudflared tunnel --no-autoupdate --config /etc/cloudflared/config.yml run &
fi

echo "Starting Homebase..."
exec node server.js
