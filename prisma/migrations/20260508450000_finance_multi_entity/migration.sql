-- AlterTable: FinanceAccount - add entityType and entityABN
ALTER TABLE "FinanceAccount" ADD COLUMN "entityType" TEXT;
ALTER TABLE "FinanceAccount" ADD COLUMN "entityABN" TEXT;
CREATE INDEX IF NOT EXISTS "FinanceAccount_familyId_type_idx" ON "FinanceAccount"("familyId", "type");

-- AlterTable: FinanceCategory - add level, isPersonal, isLocationBased, isExternal
ALTER TABLE "FinanceCategory" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FinanceCategory" ADD COLUMN "isPersonal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinanceCategory" ADD COLUMN "isLocationBased" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinanceCategory" ADD COLUMN "isExternal" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "FinanceCategory_familyId_level_idx" ON "FinanceCategory"("familyId", "level");

-- AlterTable: FinanceTransaction - add memberId and locationId
ALTER TABLE "FinanceTransaction" ADD COLUMN "memberId" TEXT;
ALTER TABLE "FinanceTransaction" ADD COLUMN "locationId" TEXT;
CREATE INDEX IF NOT EXISTS "FinanceTransaction_memberId_idx" ON "FinanceTransaction"("memberId");
CREATE INDEX IF NOT EXISTS "FinanceTransaction_locationId_idx" ON "FinanceTransaction"("locationId");

-- AlterTable: FinanceRecurringBill - add memberId and locationId
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "memberId" TEXT;
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "locationId" TEXT;
CREATE INDEX IF NOT EXISTS "FinanceRecurringBill_memberId_idx" ON "FinanceRecurringBill"("memberId");
CREATE INDEX IF NOT EXISTS "FinanceRecurringBill_locationId_idx" ON "FinanceRecurringBill"("locationId");

-- CreateTable: FinanceLocation
CREATE TABLE "FinanceLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "type" TEXT NOT NULL DEFAULT 'primary',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinanceLocation_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "FinanceLocation_familyId_idx" ON "FinanceLocation"("familyId");
CREATE INDEX IF NOT EXISTS "FinanceLocation_familyId_isActive_idx" ON "FinanceLocation"("familyId", "isActive");