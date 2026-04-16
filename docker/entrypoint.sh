#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "Starting Homebase..."
exec node server.js
