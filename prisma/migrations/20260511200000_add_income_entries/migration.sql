-- CreateTable: FinanceIncomeEntry
CREATE TABLE "FinanceIncomeEntry" (
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
    CONSTRAINT "FinanceIncomeEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceIncomeEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceIncomeEntry_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "FinanceEntity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceIncomeEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "FinanceLocation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinanceIncomeEntry_parentIncomeId_fkey" FOREIGN KEY ("parentIncomeId") REFERENCES "FinanceIncomeEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceIncomeEntry_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FinanceIncomeEntry_familyId_idx" ON "FinanceIncomeEntry"("familyId");
CREATE INDEX "FinanceIncomeEntry_familyId_isActive_idx" ON "FinanceIncomeEntry"("familyId", "isActive");
CREATE INDEX "FinanceIncomeEntry_familyId_nextExpectedDate_idx" ON "FinanceIncomeEntry"("familyId", "nextExpectedDate");
CREATE INDEX "FinanceIncomeEntry_familyId_received_idx" ON "FinanceIncomeEntry"("familyId", "received");
CREATE INDEX "FinanceIncomeEntry_memberId_idx" ON "FinanceIncomeEntry"("memberId");
CREATE INDEX "FinanceIncomeEntry_parentIncomeId_idx" ON "FinanceIncomeEntry"("parentIncomeId");
CREATE INDEX "FinanceIncomeEntry_entityId_idx" ON "FinanceIncomeEntry"("entityId");
