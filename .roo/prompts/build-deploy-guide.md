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

This applies **only pending** migrations — already-applied ones are skipped.

#### ⚠️ SQLite Compatibility Warning
SQLite does NOT support `ALTER TABLE ... ADD COLUMN ... UNIQUE`. If a migration needs a unique column, split it into:
```sql
ALTER TABLE "TableName" ADD COLUMN "columnName" TEXT;
CREATE UNIQUE INDEX "TableName_columnName_key" ON "TableName"("columnName");
```
This avoids `prisma migrate deploy` failing on the NAS at startup.

The pending migrations in the current build cycle are:
- `20260521000000_add_invoice_tx_id` — adds invoiceTxId to recurring bills + income entries (has separate UNIQUE index for SQLite compatibility)
- `20260522000000_fix_opening_balance_sign` — fixes opening balance transaction sign for liability accounts
- `20260523000000_add_coa_opening_balance` — adds glCode, openingBalance, openingBalanceDate to FinanceCategory

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

## 🧪 Running & Diagnosing the Test Suite

The app ships its own automated test suite (vitest). Two ways to run it:

### From the app (preferred — no dev environment needed)
**Admin → Operations tab → "Test Suite — Code Verification" panel.** Admin-only.

- **All Tests** — every test file (~2–10 min).
- **Finance Tests** — accounting-invariant suites only (~1 min): DR=CR, subledger↔GL, lifecycle journals.

The panel polls while the run is in progress and then shows passed/failed/skipped counts. Each failure is shown as a card with the test name, file path, and full error message — that is the diagnosis; no log digging required.

This works **inside the production container** too: the Dockerfile copies `src/`, `vitest.config.ts`, `vitest.setup.ts`, and `tsconfig.json` into the runner image, and vitest is already present in the full `node_modules`. If the panel says the tooling is not present, the running image predates this feature — rebuild and redeploy.

### From the CLI (dev checkout)
```
npm test                 # full suite
npx vitest run finance   # finance suites only
```

### Safety — tests can never touch live data
The runner executes vitest as a child process with `DATABASE_URL` pointed at an **empty throwaway file in the OS temp dir** — never `/data/homebase.db`. Suites that need a database (the finance integration tests) build their own temp DB from `prisma/schema.prisma` and delete it afterwards. Any test that accidentally reached for the ambient database would hit an empty schema and fail loudly.

### Test suite vs. Integrity Audit — two different checks
| Check | What it validates | Where |
|-------|-------------------|-------|
| **Test Suite** | The **code** is still correct (posting logic, invariants) — runs on a throwaway DB | Admin → Operations → Test Suite |
| **Integrity Audit** | The **live ledger data** is internally consistent | Finance → Admin → Run Integrity Audit |

### If tests fail after a deploy
1. Read the failure cards — the file + test name pinpoint the broken behaviour.
2. If the failure appeared with a new image, **roll back** to the previous image / pre-deploy DB backup (see §4 Rollback above) and investigate in the dev checkout.

---

## ⏰ Timezone Requirement — Australia/Sydney

The application **must** run in the `Australia/Sydney` timezone for correct operation. Without proper timezone configuration:

- The daily backup cron (scheduled for `03:00`) fires at 03:00 **UTC** instead of 03:00 **AEST**
- Backup filenames like `homebase.db.pre-deploy.20260515_130000` use UTC timestamps
- SQLite functions (`datetime('now')`, `julianday('now')`) return UTC values
- The bimonthly date correction in `entrypoint.sh` uses `julianday('now')` which would be UTC-offset
- Node.js `new Date()` uses UTC internally for `Date()` without timezone-aware formatting

### How it's configured

| Layer | Mechanism |
|-------|-----------|
| **Dockerfile** (runner stage) | `ENV TZ=Australia/Sydney` + `apk add tzdata` + copies zoneinfo to `/etc/localtime` and `/etc/timezone` |
| **docker-compose.yml** | `TZ=Australia/Sydney` environment variable |
| **deploy-nas.sh** | `-e TZ=Australia/Sydney` on `docker run` |
| **entrypoint.sh** | Step [0/7] verifies timezone at startup; banner displays `System TZ` and `Current time` |

### Why tzdata is required

Alpine Linux (`node:22-alpine`) does **not** include the `tzdata` package by default. Without it, the musl libc cannot resolve the `TZ` environment variable — it has no `/usr/share/zoneinfo/` directory to read from. Setting `TZ=Australia/Sydney` without `tzdata` is effectively a no-op.

### ⚠️ Legacy containers (built before this fix)

If a running container was built before `tzdata` was added to the Dockerfile, fix it in-place via SSH:

```bash
sudo sh /volume1/docker/homebase/scripts/set-container-tz.sh
```

This script:
1. Installs `tzdata` in the running container
2. Copies `Australia/Sydney` zoneinfo to `/etc/localtime`
3. Sets `/etc/timezone` to `Australia/Sydney`
4. Restarts the container

After restart, verify with:
```bash
docker exec homebase-app date
```

---

## Reminder for Future Schema Changes

When I create/modify any Prisma migration, I must add a note like this to my completion message:

> **Deploy reminder:** This change includes new Prisma migrations. You'll need to run `deploy-build.bat` and then `sudo sh /volume1/docker/homebase/deploy-nas.sh` on the NAS for the migration to apply to production.
