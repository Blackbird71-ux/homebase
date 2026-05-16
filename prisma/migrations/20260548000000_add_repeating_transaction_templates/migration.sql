-- =========================================================================
-- Migration: 20260548000000_add_repeating_transaction_templates
--
-- Purpose: Xero-style separation between recurring TEMPLATES and their
-- spawned INSTANCES (drafts → awaiting → paid/received).
--
-- Tables added:
--   FinanceRecurringTemplate         (master schedule; NEVER posts to GL)
--   FinanceRecurringTemplateLine     (template journal lines)
--
-- Tables extended:
--   FinanceRecurringBill             (+ templateId, status, spawnedAt,
--                                       postedAt, spawnedSnapshotHash, +2 indexes)
--   FinanceIncomeEntry               (+ same 5 columns and +2 indexes)
--
-- Non-destructive: no DELETE FROM, no DROP. All new columns are nullable.
-- Existing data and existing code paths are untouched. User wipes NAS DB
-- manually pre-deploy per Q5.
-- =========================================================================

-- CreateTable
CREATE TABLE "FinanceRecurringTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "counterpartyId" TEXT,
    "accountId" TEXT,
    "categoryId" TEXT,
    "entityId" TEXT,
    "locationId" TEXT,
    "memberId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createAutomatically" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnCreate" BOOLEAN NOT NULL DEFAULT false,
    "createInAdvanceDays" INTEGER NOT NULL DEFAULT 0,
    "remindInAdvanceDays" INTEGER,
    "frequency" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "daysOfWeek" TEXT,
    "dayOfMonth" INTEGER,
    "monthOfYear" INTEGER,
    "startDate" DATETIME NOT NULL,
    "endMode" TEXT NOT NULL DEFAULT 'forever',
    "endDate" DATETIME,
    "totalOccurrences" INTEGER,
    "occurrencesRemaining" INTEGER,
    "lastSpawnedDate" DATETIME,
    "nextOccurrenceDate" DATETIME NOT NULL,
    "defaultDueOffsetDays" INTEGER NOT NULL DEFAULT 0,
    "isTaxTracked" BOOLEAN NOT NULL DEFAULT false,
    "taxClassification" TEXT,
    "taxRate" REAL,
    "payslipEnabled" BOOLEAN NOT NULL DEFAULT false,
    "grossPay" REAL,
    "netPay" REAL,
    "grossIncomeGlAccountId" TEXT,
    "bankGlAccountId" TEXT,
    "paygWithheld" REAL,
    "paygGlAccountId" TEXT,
    "sgcAmount" REAL,
    "sgcGlAccountId" TEXT,
    "payslipComponents" TEXT,
    "payslipDeductions" TEXT,
    "createdBy" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinanceRecurringTemplate_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinanceRecurringTemplateLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" REAL NOT NULL DEFAULT 1,
    "unitPrice" REAL NOT NULL,
    "amount" REAL NOT NULL,
    "side" TEXT NOT NULL,
    "glAccountId" TEXT NOT NULL,
    "taxRateId" TEXT,
    "memberId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "gstApplicable" BOOLEAN NOT NULL DEFAULT false,
    "gstRate" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceRecurringTemplateLine_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FinanceRecurringTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinanceRecurringTemplateLine_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "FinanceCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FinanceRecurringTemplate_familyId_kind_idx" ON "FinanceRecurringTemplate"("familyId", "kind");

-- CreateIndex
CREATE INDEX "FinanceRecurringTemplate_familyId_enabled_nextOccurrenceDate_idx" ON "FinanceRecurringTemplate"("familyId", "enabled", "nextOccurrenceDate");

-- CreateIndex
CREATE INDEX "FinanceRecurringTemplate_familyId_name_idx" ON "FinanceRecurringTemplate"("familyId", "name");

-- CreateIndex
CREATE INDEX "FinanceRecurringTemplate_familyId_isActive_idx" ON "FinanceRecurringTemplate"("familyId", "isActive");

-- CreateIndex
CREATE INDEX "FinanceRecurringTemplateLine_templateId_idx" ON "FinanceRecurringTemplateLine"("templateId");

-- CreateIndex
CREATE INDEX "FinanceRecurringTemplateLine_glAccountId_idx" ON "FinanceRecurringTemplateLine"("glAccountId");

-- AlterTable: FinanceRecurringBill
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "templateId" TEXT;
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "status" TEXT;
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "spawnedAt" DATETIME;
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "postedAt" DATETIME;
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "spawnedSnapshotHash" TEXT;

-- CreateIndex
CREATE INDEX "FinanceRecurringBill_familyId_status_idx" ON "FinanceRecurringBill"("familyId", "status");

-- CreateIndex
CREATE INDEX "FinanceRecurringBill_templateId_idx" ON "FinanceRecurringBill"("templateId");

-- AlterTable: FinanceIncomeEntry
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "templateId" TEXT;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "status" TEXT;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "spawnedAt" DATETIME;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "postedAt" DATETIME;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "spawnedSnapshotHash" TEXT;

-- CreateIndex
CREATE INDEX "FinanceIncomeEntry_familyId_status_idx" ON "FinanceIncomeEntry"("familyId", "status");

-- CreateIndex
CREATE INDEX "FinanceIncomeEntry_templateId_idx" ON "FinanceIncomeEntry"("templateId");
