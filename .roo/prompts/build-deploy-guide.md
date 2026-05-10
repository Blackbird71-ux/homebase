# HomeBase Build & Deploy Guide — NAS Production

## Schema Changes → Always Remind User to Rebuild & Redeploy

Whenever Prisma schema changes are made (new migrations), **I MUST explicitly tell the user** that they need to rebuild and redeploy the Docker image to production. The local dev database gets the migrations via `npx prisma migrate dev`, but the production database on the NAS only gets them when the container restarts and `entrypoint.sh` runs `prisma migrate deploy`.

---

## Build & Deploy Flow

### 1. Build Docker Image (Windows)
```
deploy-build.bat
```

This single command does:
1. `docker build --no-cache -t homebase:latest .` — builds the image (includes all Prisma migration files from `prisma/migrations/`)
2. `docker save homebase:latest -o homebase.tar` — saves the image to a tar file
3. `scp homebase.tar deploy-nas.sh .env.local admin@sovereign-main:/volume1/docker/homebase/` — copies the files to the NAS

### 2. Deploy on NAS
SSH into the NAS (`sovereign-main`) and run:
```
sudo sh /volume1/docker/homebase/deploy-nas.sh
```

This script:
1. Stops and removes the old container
2. Removes the old Docker image
3. Loads the new image from `homebase.tar`
4. Starts a new container with `docker run`

### 3. Migrations Auto-Apply on Container Start
When the new container starts, `docker/entrypoint.sh` automatically runs:
```
node_modules/.bin/prisma migrate deploy
```

This applies **only pending** migrations — already-applied ones are skipped. The 3 migration files affected in the current build cycle are:
- `20260519000000_add_is_transfer`
- `20260520000000_add_finance_year_start`
- `20260520100000_add_opening_balances`

### 4. Rollback
The entrypoint auto-creates a pre-migration backup before running `prisma migrate deploy`:
```
/data/backups/homebase.db.pre-deploy.YYYYMMDD_HHMMSS
```

To restore manually on the NAS:
```
cp /data/backups/homebase.db.pre-deploy.<timestamp> /data/homebase.db
```

---

## Reminder for Future Schema Changes

When I create/modify any Prisma migration, I must add a note like this to my completion message:

> **Deploy reminder:** This change includes new Prisma migrations. You'll need to run `deploy-build.bat` and then `sudo sh /volume1/docker/homebase/deploy-nas.sh` on the NAS for the migration to apply to production.
