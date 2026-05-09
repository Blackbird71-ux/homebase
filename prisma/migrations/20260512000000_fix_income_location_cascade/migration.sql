-- Fix FinanceIncomeEntry.locationId FK: change ON DELETE CASCADE → ON DELETE SET NULL
-- SQLite does not support ALTER CONSTRAINT, so we recreate the table.

PRAGMA foreign_keys=OFF;

-- Step 1: Create replacement table with corrected FK
CREATE TABLE "FinanceIncomeEntry_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "incomeType" TEXT NOT NULL DEFAULT 'recurring',
    "nextExpectedDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "received" BOOLEAN NOT NULL DEFAULT false,
    "receivedDate" DATETIME,
    "notes" TEXT,
    "memberId" TEXT,
    "accountId" TEXT,
    "categoryId" TEXT,
    "entityId" TEXT,
    "locationId" TEXT,
    "parentIncomeId" TEXT,
    "familyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinanceIncomeEntry_new_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceIncomeEntry_new_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceIncomeEntry_new_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "FinanceEntity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceIncomeEntry_new_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "FinanceLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceIncomeEntry_new_parentIncomeId_fkey" FOREIGN KEY ("parentIncomeId") REFERENCES "FinanceIncomeEntry_new" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceIncomeEntry_new_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 2: Copy all existing data
INSERT INTO "FinanceIncomeEntry_new"
SELECT * FROM "FinanceIncomeEntry";

-- Step 3: Drop old table (and its indexes)
DROP TABLE "FinanceIncomeEntry";

-- Step 4: Rename new table to correct name
ALTER TABLE "FinanceIncomeEntry_new" RENAME TO "FinanceIncomeEntry";

-- Step 5: Recreate indexes
CREATE INDEX "FinanceIncomeEntry_familyId_idx" ON "FinanceIncomeEntry"("familyId");
CREATE INDEX "FinanceIncomeEntry_familyId_isActive_idx" ON "FinanceIncomeEntry"("familyId", "isActive");
CREATE INDEX "FinanceIncomeEntry_familyId_nextExpectedDate_idx" ON "FinanceIncomeEntry"("familyId", "nextExpectedDate");
CREATE INDEX "FinanceIncomeEntry_familyId_received_idx" ON "FinanceIncomeEntry"("familyId", "received");
CREATE INDEX "FinanceIncomeEntry_memberId_idx" ON "FinanceIncomeEntry"("memberId");
CREATE INDEX "FinanceIncomeEntry_parentIncomeId_idx" ON "FinanceIncomeEntry"("parentIncomeId");
CREATE INDEX "FinanceIncomeEntry_entityId_idx" ON "FinanceIncomeEntry"("entityId");

PRAGMA foreign_keys=ON;
