# Cloudflare Tunnel Recovery

## What was fixed

When the NAS internet connection drops briefly, Docker's internal DNS resolver (`127.0.0.11`) gets stuck and can no longer handle the SRV record lookups that `cloudflared` needs to connect to Cloudflare. The tunnel drops and does not recover on its own.

Three changes were made to prevent this:

### 1. Watchdog loop in the entrypoint (`docker/entrypoint.sh`)
`cloudflared` runs as a background process inside the `homebase-app` container. Previously it was launched with `&` and forgotten — if it crashed, nothing restarted it. It is now wrapped in a loop that restarts it automatically within 5 seconds if it exits for any reason.

### 2. DNS override in the entrypoint (`docker/entrypoint.sh`)
Before starting `cloudflared`, the entrypoint writes `/etc/resolv.conf` to use `1.1.1.1` and `8.8.8.8` directly, bypassing Docker's internal DNS proxy which cannot reliably handle SRV record lookups.

### 3. Docker daemon DNS (`/etc/docker/daemon.json` on the NAS)
The root fix. Configures Docker's embedded DNS resolver to forward to `1.1.1.1` and `8.8.8.8` globally, so all containers on the NAS use reliable external DNS even after a network drop.

File location on NAS: `/etc/docker/daemon.json`
```json
{"dns": ["1.1.1.1", "8.8.8.8"]}
```

---

## If the tunnel goes down again

**Step 1 — Check if the container is running:**
```bash
docker ps | grep homebase
```

**Step 2 — Check the logs:**
```bash
docker logs homebase-app --tail 50
```

Look for DNS timeout errors like `lookup ... on 127.0.0.11:53: i/o timeout`. If you see these, the Docker DNS is broken again.

**Step 3 — Verify daemon.json is still in place:**
```bash
cat /etc/docker/daemon.json
```

If it's missing (can happen after DSM or Container Manager updates), recreate it:
```bash
echo '{"dns": ["1.1.1.1", "8.8.8.8"]}' > /etc/docker/daemon.json
synopkg restart Docker
```

**Step 4 — If daemon.json is in place but tunnels are still broken, restart Docker:**
```bash
synopkg restart Docker
```

This restarts all containers. They come back up automatically within ~1 minute via `restart: unless-stopped`.

**Step 5 — Last resort: reboot the NAS**
A full reboot restores all iptables rules and Docker networking state cleanly.

---

## Architecture note
`cloudflared` runs inside the `homebase-app` container (not as a separate container). The Cloudflare config files are mounted from `/volume1/docker/homebase/cloudflared/` on the NAS into `/etc/cloudflared/` inside the container.
