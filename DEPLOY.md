# HomeBase — Deployment Reference

**Live URL:** https://homebase.liddleapps.com  
**Hosting:** Synology NAS via Cloudflare Argo Tunnel  
**Stack:** Next.js 16 standalone · SQLite · Docker

---

## Architecture

```
Browser → Cloudflare CDN → Argo Tunnel (cloudflared container)
                               → homebase-app container (port 3000)
                                    → /data/homebase.db (NAS volume)
```

- App container is self-contained and portable — move it to any Docker host by changing the volume mount path
- Only the SQLite database (`/data/homebase.db`) and the Cloudflare tunnel credentials live outside the container
- The entrypoint automatically runs `prisma migrate deploy` on every start — no manual migration step needed after updates

---

## NAS Folder Structure

```
/volume1/docker/homebase/
  Data/               ← SQLite database (persists across rebuilds)
  cloudflared/        ← cert.pem + homebase.json + config.yml (tunnel config)
  .env.local          ← All secrets (never commit this)
  homebase.tar        ← Uploaded Docker image (replaced on each deploy)
  deploy-nas.sh       ← Run on NAS after uploading a new image
```

---

## First-Time Setup

### Step 1 — Create NAS folders (on NAS via SSH)

```bash
sudo mkdir -p /volume1/docker/homebase/Data
sudo mkdir -p /volume1/docker/homebase/cloudflared
sudo chmod 755 /volume1/docker/homebase/Data
```

### Step 2 — Create .env.local on the NAS

```bash
# On NAS SSH:
nano /volume1/docker/homebase/.env.local
```

Paste and fill in:

```env
AUTH_SECRET=<output of: openssl rand -base64 32>
AUTH_URL=https://homebase.liddleapps.com
NEXTAUTH_SECRET=<same as AUTH_SECRET>
NEXTAUTH_URL=https://homebase.liddleapps.com
ENCRYPTION_KEY=<output of: openssl rand -base64 32>

# Google Calendar sync (optional — leave blank to disable)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://homebase.liddleapps.com/api/auth/google/callback
```

Generate secrets:
```bash
openssl rand -base64 32   # for AUTH_SECRET
openssl rand -base64 32   # for ENCRYPTION_KEY (must be different)
```

### Step 3 — Build the image on your PC and deploy to the NAS

Docker cannot build directly on the NAS (no build tools). The image is built on Windows, saved as a `.tar` file, copied to the NAS over SSH, then loaded there.

**On PC** — this builds the image, saves `homebase.tar`, and SCPs it to the NAS:
```bat
deploy-build.bat
```

> Requires Docker Desktop running on your PC and SSH access to the NAS.  
> The SCP step copies the tar to `/volume1/docker/homebase/homebase.tar`.

**On NAS SSH** — this loads the image and starts the container:
```bash
sudo sh /volume1/docker/homebase/deploy-nas.sh
```

The app starts on port 3001. The tunnel won't run yet — `config.yml` doesn't exist.  
You can reach it locally at `http://192.168.68.67:3001` to complete tunnel setup.

### Step 4 — Set up the Cloudflare tunnel

cloudflared is bundled in the image. You can do this either from the **Settings UI** or via SSH.

#### Option A — Settings UI (easiest)

1. Open https://homebase.liddleapps.com (or `http://<NAS-IP>:3001` if tunnel isn't up yet)
2. Log in as an admin user
3. Go to **Settings → Integrations → Cloudflare Tunnel**
4. Follow the step-by-step wizard:
   - Click **Connect to Cloudflare** → open the URL in your browser to authenticate
   - Click **Create Tunnel** → waits for creation, auto-fills the tunnel ID
   - Click **Save Config** → writes `config.yml` to the mounted volume
   - Click **Start Tunnel** → activates the tunnel in the running container

#### Option B — SSH / terminal

```bash
# Ensure cloudflared directory is writable by the container (UID 1001 = nextjs user)
sudo chmod 777 /volume1/docker/homebase/cloudflared

# Log in to Cloudflare — prints a URL, open it in your browser
docker exec -it homebase-app cloudflared tunnel login --origincert /etc/cloudflared/cert.pem

# Create the tunnel — note the tunnel ID (UUID) it prints
docker exec homebase-app cloudflared tunnel create homebase --origincert /etc/cloudflared/cert.pem --credentials-file /etc/cloudflared/homebase.json
```

Both `cert.pem` and `homebase.json` are written to `/volume1/docker/homebase/cloudflared/` on the NAS.

> **Permission note:** The `cloudflared` directory must be writable by UID 1001 (the container's `nextjs` user).
> Run `sudo chmod 777 /volume1/docker/homebase/cloudflared` on the NAS if you see permission errors.

### Step 5 — Create config.yml on the NAS

**If you used the Settings UI in Step 4:** `config.yml` is already written — skip to Step 6.

**If you used SSH:** create it manually:

```bash
nano /volume1/docker/homebase/cloudflared/config.yml
```

Paste (replace `<tunnel-id>` with the UUID from Step 4):

```yaml
tunnel: <tunnel-id>
credentials-file: /etc/cloudflared/homebase.json

ingress:
  - hostname: homebase.liddleapps.com
    service: http://localhost:3000
  - service: http_status:404
```

> **Note:** Inside a single container, the tunnel connects to `localhost:3000`.

### Step 6 — Update DNS CNAME

In Cloudflare DNS:

| Type  | Name       | Target                         | Proxy |
|-------|------------|--------------------------------|-------|
| CNAME | homebase   | `<tunnel-id>.cfargotunnel.com` | ✓ Proxied |

**Easier alternative:** Cloudflare Zero Trust → Networks → Tunnels → homebase → Public Hostnames → Add. This creates the DNS record automatically.

### Step 7 — Restart the container to activate the tunnel

```bash
docker restart homebase-app
docker logs homebase-app --tail 30
```

You should see "Starting Cloudflare tunnel..." in the logs. Visit https://homebase.liddleapps.com — you should see the HomeBase login page.

---

## Routine Deployment (Updates)

Whenever you want to push code changes to production:

**Step 1 — Build on PC** (builds image, saves tar, SCPs to NAS):
```bat
deploy-build.bat
```

**Step 2 — Deploy on NAS SSH** (loads image, restarts container):
```bash
sudo sh /volume1/docker/homebase/deploy-nas.sh
```

That's it. The script stops the old container, loads the new image, restarts it, and prunes the old image. The tunnel restarts automatically because `config.yml` is already in place.

---

## Google Calendar Setup

After deployment, to enable Google Calendar sync for family members:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Library
2. Enable **Google Calendar API**
3. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: **Web application**
   - Authorised redirect URI: `https://homebase.liddleapps.com/api/auth/google/callback`
4. Copy the Client ID and Client Secret into `/volume1/docker/homebase/.env.local`
5. Restart the container: `docker restart homebase-app`
6. Each user goes to **Settings → Integrations → Connect Google Calendar**

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | ✅ | NextAuth v5 secret (32+ random bytes) |
| `AUTH_URL` | ✅ | Public URL e.g. `https://homebase.liddleapps.com` |
| `NEXTAUTH_SECRET` | ✅ | Same as AUTH_SECRET (v4 compat) |
| `NEXTAUTH_URL` | ✅ | Same as AUTH_URL (v4 compat) |
| `ENCRYPTION_KEY` | ✅ | Invite code encryption key (32 random bytes) |
| `DATABASE_URL` | Auto | Set by deploy script: `file:/data/homebase.db` |
| `ADMIN_RESET_TOKEN` | Recommended | Secret token for emergency password reset API |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth — enables Calendar sync |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth |
| `GOOGLE_REDIRECT_URI` | Optional | Must match Google Console exactly |

---

## Ports

| Service         | Container port | NAS port | Notes |
|----------------|---------------|----------|-------|
| homebase-app   | 3000          | 3001     | Tunnel connects to internal 3000 |
| Memories app   | 3000          | 3000     | Different NAS port, same tunnel |

---

## Troubleshooting

**Resetting a user password (locked out of UI):**

Option A — Secret reset URL (requires `ADMIN_RESET_TOKEN` in `.env.local`):
```bash
curl -X POST http://192.168.68.64:3001/api/admin/reset-password \
  -H "Content-Type: application/json" \
  -H "x-reset-token: <your-ADMIN_RESET_TOKEN>" \
  -d '{"email":"you@example.com","password":"newpassword"}'
```

Option B — Direct Docker CLI (no token needed, works even if app is broken):
```bash
docker exec homebase-app node -e "
const {PrismaClient}=require('@prisma/client');
const bcrypt=require('bcryptjs');
const p=new PrismaClient();
p.user.update({where:{email:'you@example.com'},data:{password:bcrypt.hashSync('newpassword',12)}}).then(()=>{console.log('Done');p.\$disconnect()});
"
```

---

**Container won't start:**
```bash
docker logs homebase-app --tail 50
```
Common cause: missing or malformed `.env.local`.

**Tunnel not connecting:**
```bash
docker logs homebase-app --tail 50
```
Look for "Starting Cloudflare tunnel..." — if missing, `config.yml` wasn't found at `/etc/cloudflared/config.yml`.  
Common cause: wrong tunnel ID in `config.yml`, or credentials file missing from `/volume1/docker/homebase/cloudflared/`.

**Database issues:**
```bash
# Check DB is accessible
docker exec homebase-app ls -la /data/
# Reset DB (destructive — deletes all data)
docker stop homebase-app
rm /volume1/docker/homebase/Data/homebase.db
docker start homebase-app
```

**Google Calendar "connected" but sync fails:**  
The refresh token may have been revoked in the user's Google account. User should go to Settings → Integrations → Disconnect → reconnect.

**Migration errors on start:**  
```bash
docker exec -it homebase-app sh
node node_modules/prisma/build/index.js migrate status --schema=./prisma/schema.prisma
```

---

## Local Development

```bash
cd "C:\Users\liddlem\Downloads\Claude Apps\HomeBase\homebase"
npm run dev
# Runs at http://localhost:3300
```

Test production build:
```bash
npm run build
npm start
```

---

## Files in This Repo

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build — deps → build → minimal runner |
| `docker-compose.yml` | Local build helper (not used on NAS directly) |
| `docker/entrypoint.sh` | Runs migrations, starts cloudflared (if configured), then starts Next.js |
| `deploy-build.bat` | PC: build image, save tar, scp to NAS |
| `deploy-nas.sh` | NAS: load image, restart containers |
| `env.local.example` | Template for NAS `.env.local` |
| `DEPLOY.md` | This file |
