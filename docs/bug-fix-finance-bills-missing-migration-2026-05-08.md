# Bug Fix: Finance Bills Page — Missing Migration for billType Column

**Date:** 2026-05-08

## Symptoms

Finance / Bills page fails to render with error:

```
Uncaught Error: An error occurred in the Server Components render.
Digest: [...] — ColumnNotFound: billType
```

## Root Cause

The Prisma schema (`prisma/schema.prisma`) had bill enhancement fields added to `FinanceRecurringBill` (part of the recent finance module work), but **no corresponding migration SQL file** was created. The container's entrypoint runs `prisma migrate deploy` on startup, which applies any new migration folders. Since there was no migration file for these columns, they were never created in the database.

## Affected columns

| Column | Type | Default |
|---|---|---|
| `billType` | TEXT | `'recurring'` |
| `recurrenceInterval` | TEXT | NULL |
| `invoiceReceived` | BOOLEAN | `false` |
| `invoiceReceivedDate` | DATETIME | NULL |
| `paid` | BOOLEAN | `false` |
| `paidDate` | DATETIME | NULL |

## Fix

Added migration file: `prisma/migrations/20260509000000_add_finance_bill_enhancements/migration.sql`

This is a standalone SQL migration with `ALTER TABLE ADD COLUMN` statements. It is **safe to run on existing databases** — all columns have sensible defaults (`NOT NULL` columns default to their specified default, nullable columns default to NULL).

## Deployment

1. Build the Docker image from `c:\Appdev\HomeBase`:
   ```
   deploy-build.bat
   ```
2. Copy `homebase.tar` to the NAS
3. Run on NAS:
   ```
   sudo sh /volume1/docker/homebase/deploy-nas.sh
   ```
4. The container entrypoint runs `prisma migrate deploy` which auto-applies the new migration
5. No manual SQL is needed

## Verification

After deployment, the Finance -> Bills page should load without errors. Existing bills will have:
- `billType` = `'recurring'` (safe default)
- `paid` = `false`
- All new nullable columns = `NULL`

## Lesson

When adding new fields to Prisma models, **always create the corresponding migration SQL file** in a timestamped directory under `prisma/migrations/`. The naming convention is:

```
prisma/migrations/<YYYYMMDDHHMMSS>_<descriptive_name>/migration.sql
```

Use `ALTER TABLE ... ADD COLUMN` with the exact column definition matching the Prisma schema. The container applies migrations automatically on restart.