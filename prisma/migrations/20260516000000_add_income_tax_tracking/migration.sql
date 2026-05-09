-- Add tax tracking fields to FinanceIncomeEntry
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "isTaxTracked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "taxRate" REAL;
