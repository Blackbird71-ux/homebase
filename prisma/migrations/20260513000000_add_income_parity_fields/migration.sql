-- Migration: add income entry parity fields + IncomeAttachment model
-- Mirrors the fields that FinanceRecurringBill has so the income editor
-- can expose the same entities as the bills editor.
--
-- SQLite does not support ADD COLUMN with FK constraints, so new FK columns
-- are added as plain nullable TEXT and the FK is enforced at the Prisma level.
-- The IncomeAttachment table is created from scratch.

-- 1. New scalar/flag columns on FinanceIncomeEntry
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "autoPay"             BOOLEAN  NOT NULL DEFAULT false;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "emailReminder"       BOOLEAN  NOT NULL DEFAULT false;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "reminderDays"        INTEGER  NOT NULL DEFAULT 3;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "dayOfMonth"          INTEGER;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "monthOfYear"         INTEGER;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "recurrenceInterval"  TEXT;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "invoiceReceived"     BOOLEAN  NOT NULL DEFAULT false;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "invoiceReceivedDate" DATETIME;

-- 2. New FK column: vendorId (payer / employer / tenant)
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "vendorId" TEXT
    REFERENCES "FinanceVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Index for the new vendorId column
CREATE INDEX "FinanceIncomeEntry_vendorId_idx" ON "FinanceIncomeEntry"("vendorId");

-- 4. IncomeAttachment table (mirrors BillAttachment)
CREATE TABLE "IncomeAttachment" (
    "id"           TEXT     NOT NULL PRIMARY KEY,
    "incomeId"     TEXT     NOT NULL,
    "familyId"     TEXT     NOT NULL,
    "title"        TEXT     NOT NULL,
    "fileName"     TEXT     NOT NULL,
    "fileSize"     INTEGER  NOT NULL DEFAULT 0,
    "mimeType"     TEXT     NOT NULL DEFAULT 'application/octet-stream',
    "uploadedById" TEXT     NOT NULL,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncomeAttachment_incomeId_fkey"
        FOREIGN KEY ("incomeId") REFERENCES "FinanceIncomeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "IncomeAttachment_incomeId_idx" ON "IncomeAttachment"("incomeId");
CREATE INDEX "IncomeAttachment_familyId_idx" ON "IncomeAttachment"("familyId");
