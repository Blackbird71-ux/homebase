#!/bin/sh
# Run on the NAS as: sudo sh /volume1/docker/homebase/deploy-nas.sh

set -e

# Single source of truth for the deploy directory. Note the lowercase 'homebase' —
# the NAS filesystem is case-sensitive and /volume1/docker/Homebase does not exist.
DEPLOY_DIR=/volume1/docker/homebase
IMAGE_TAR="$DEPLOY_DIR/homebase.tar"

echo "=== Preflight ==="
if [ ! -f "$IMAGE_TAR" ]; then
  echo "✗ Image tar not found: $IMAGE_TAR"
  echo "  Run deploy-build.bat on the PC first — it builds the image and SCPs it here."
  echo "  The running container has NOT been touched."
  exit 1
fi
if [ ! -f "$DEPLOY_DIR/.env.local" ]; then
  echo "✗ .env.local not found: $DEPLOY_DIR/.env.local"
  echo "  The running container has NOT been touched."
  exit 1
fi
echo "   ✓ $IMAGE_TAR ($(du -h "$IMAGE_TAR" | cut -f1))"
echo "   ✓ $DEPLOY_DIR/.env.local"

# Load BEFORE tearing anything down. If the tar is corrupt this fails while the
# old container is still serving traffic, instead of leaving the NAS with no
# container and no image. The old image becomes dangling and is pruned at the end.
echo "=== Loading new image ==="
docker load -i "$IMAGE_TAR"

echo "=== Stopping old container ==="
docker stop homebase-app 2>/dev/null || true
docker rm -f homebase-app 2>/dev/null || true

echo "=== Creating network ==="
docker network create homebase-network 2>/dev/null || true

echo "=== Setting data directory permissions ==="
mkdir -p "$DEPLOY_DIR/Data"
mkdir -p "$DEPLOY_DIR/Data/images"
mkdir -p "$DEPLOY_DIR/cloudflared"
chown -R 1001:1001 "$DEPLOY_DIR/Data"
chmod 755 "$DEPLOY_DIR/Data"
chmod 777 "$DEPLOY_DIR/cloudflared"

# Port 3001 on the NAS — 3000 is taken by the Memories app. The tunnel's
# config.yml points at the container's internal port 3000, not the NAS port.
echo "=== Starting homebase-app ==="
docker run -d \
  --name homebase-app \
  --restart unless-stopped \
  --network homebase-network \
  -p 3001:3000 \
  -v "$DEPLOY_DIR/Data:/data" \
  -v "$DEPLOY_DIR/cloudflared:/etc/cloudflared" \
  --env-file "$DEPLOY_DIR/.env.local" \
  -e DATABASE_URL=file:/data/homebase.db \
  -e NODE_ENV=production \
  -e TZ=Australia/Sydney \
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
