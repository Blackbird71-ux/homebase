-- ============================================================
-- Migration: add_vendors_budget_income
-- 1. FinanceVendor table
-- 2. vendorId on FinanceRecurringBill + FinanceTransaction
-- 3. billId + isIncludedInPlanner on FinanceBudget
-- 4. incomeStreams JSON column on Family (budget planner income)
-- ============================================================

-- 1. Vendor table
CREATE TABLE "FinanceVendor" (
    "id"                TEXT NOT NULL PRIMARY KEY,
    "name"              TEXT NOT NULL,
    "website"           TEXT,
    "phone"             TEXT,
    "accountRef"        TEXT,
    "notes"             TEXT,
    "defaultCategoryId" TEXT,
    "familyId"          TEXT NOT NULL,
    "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceVendor_familyId_fkey"          FOREIGN KEY ("familyId")          REFERENCES "Family"           ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinanceVendor_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "FinanceCategory"  ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinanceVendor_familyId_name_key" ON "FinanceVendor"("familyId","name");
CREATE INDEX "FinanceVendor_familyId_idx"             ON "FinanceVendor"("familyId");

-- 2a. vendorId on FinanceRecurringBill
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "vendorId" TEXT REFERENCES "FinanceVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "FinanceRecurringBill_vendorId_idx" ON "FinanceRecurringBill"("vendorId");

-- 2b. vendorId on FinanceTransaction
ALTER TABLE "FinanceTransaction" ADD COLUMN "vendorId" TEXT REFERENCES "FinanceVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "FinanceTransaction_vendorId_idx" ON "FinanceTransaction"("vendorId");

-- 3a. billId on FinanceBudget (tracks which bill created this rule)
ALTER TABLE "FinanceBudget" ADD COLUMN "billId" TEXT REFERENCES "FinanceRecurringBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "FinanceBudget_billId_idx" ON "FinanceBudget"("billId");

-- 3b. isIncludedInPlanner flag - whether this rule shows in the budget planner
ALTER TABLE "FinanceBudget" ADD COLUMN "isIncludedInPlanner" INTEGER NOT NULL DEFAULT 1;

-- 4. Income streams stored as JSON on Family
--    e.g. [{"id":"...","name":"My Salary","amount":5330,"frequency":"fortnightly","isIncluded":true}]
ALTER TABLE "Family" ADD COLUMN "budgetIncomeStreams" TEXT;
