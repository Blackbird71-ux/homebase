-- CreateTable
CREATE TABLE "FinancePayslip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incomeEntryId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "payPeriodStart" DATETIME,
    "payPeriodEnd" DATETIME,
    "grossPay" REAL NOT NULL,
    "netPay" REAL NOT NULL,
    "grossIncomeGlAccountId" TEXT,
    "bankGlAccountId" TEXT,
    "paygWithheld" REAL NOT NULL DEFAULT 0,
    "paygGlAccountId" TEXT,
    "sgcAmount" REAL NOT NULL DEFAULT 0,
    "sgcGlAccountId" TEXT,
    "components" TEXT NOT NULL DEFAULT '[]',
    "deductions" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancePayslip_incomeEntryId_fkey" FOREIGN KEY ("incomeEntryId") REFERENCES "FinanceIncomeEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancePayslip_incomeEntryId_key" ON "FinancePayslip"("incomeEntryId");

-- CreateIndex
CREATE INDEX "FinancePayslip_familyId_idx" ON "FinancePayslip"("familyId");

-- CreateIndex
CREATE INDEX "FinancePayslip_incomeEntryId_idx" ON "FinancePayslip"("incomeEntryId");

-- AlterTable
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "actualAmountReceived" REAL;
