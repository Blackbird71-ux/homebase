#!/bin/sh
# Run on the NAS as: sudo sh /volume1/docker/homebase/deploy-nas.sh

set -e

echo "=== Stopping old container ==="
docker stop homebase-app 2>/dev/null || true
docker rm -f homebase-app 2>/dev/null || true

echo "=== Removing old image ==="
docker image rm homebase:latest -f 2>/dev/null || true

echo "=== Loading new image ==="
docker load -i /volume1/docker/homebase/homebase.tar

echo "=== Creating network ==="
docker network create homebase-network 2>/dev/null || true

echo "=== Setting data directory permissions ==="
mkdir -p /volume1/docker/homebase/Data
mkdir -p /volume1/docker/homebase/cloudflared
chown -R 1001:1001 /volume1/docker/homebase/Data
chmod 755 /volume1/docker/homebase/Data
chmod 777 /volume1/docker/homebase/cloudflared

echo "=== Starting homebase-app ==="
docker run -d \
  --name homebase-app \
  --restart unless-stopped \
  --network homebase-network \
  -p 3001:3000 \
  -v /volume1/docker/homebase/Data:/data \
  -v /volume1/docker/homebase/cloudflared:/etc/cloudflared \
  --env-file /volume1/docker/homebase/.env.local \
  -e DATABASE_URL=file:/data/homebase.db \
  -e NODE_ENV=production \
  -e AUTH_URL=https://homebase.liddleapps.com \
  -e NEXTAUTH_URL=https://homebase.liddleapps.com \
  homebase:latest

echo "=== Waiting for app to start ==="
sleep 5

echo "=== Logs ==="
docker logs homebase-app --tail 40

echo "=== Cleaning up old images ==="
docker image prune -f

echo "=== Done! Homebase should be live at https://homebase.liddleapps.com ==="
