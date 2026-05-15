#!/bin/sh
# =============================================================================
# Set the running homebase-app container timezone to Australia/Sydney
#
# Usage (from the NAS):
#   sudo sh /volume1/docker/homebase/scripts/set-container-tz.sh
#
# Or via SSH from your dev machine:
#   ssh <nas-ip> "sudo sh /volume1/docker/homebase/scripts/set-container-tz.sh"
# =============================================================================
set -e

CONTAINER="homebase-app"
TZ="Australia/Sydney"

echo "=== Setting timezone for container: $CONTAINER ==="

# Check if container exists
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "ERROR: Container '$CONTAINER' does not exist."
  echo "       Start it first with: docker compose up -d"
  exit 1
fi

# Set the TZ environment variable on the running container
docker exec -u root "$CONTAINER" sh -c "
  # Set timezone in the container
  apk add --no-cache tzdata >/dev/null 2>&1
  cp /usr/share/zoneinfo/$TZ /etc/localtime
  echo '$TZ' > /etc/timezone
  apk del tzdata >/dev/null 2>&1
  echo 'Timezone set to: \$(cat /etc/timezone)'
"

# Restart the container so Node picks up the new TZ
echo "=== Restarting container to apply TZ change ==="
docker restart "$CONTAINER"

echo ""
echo "=== Done! Container '$CONTAINER' is now using TZ=$TZ ==="
echo ""
echo "Verify with: docker exec $CONTAINER date"
