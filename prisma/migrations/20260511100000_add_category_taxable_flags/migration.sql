-- AlterTable: FinanceCategory - add taxable income/expense flags
ALTER TABLE "FinanceCategory" ADD COLUMN "isTaxableIncome" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinanceCategory" ADD COLUMN "isTaxableExpense" BOOLEAN NOT NULL DEFAULT false;
