-- Add tax classification fields for enhanced ATO reporting
ALTER TABLE "FinanceCategory" ADD COLUMN "taxIncludeInReporting" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinanceCategory" ADD COLUMN "taxDisplayLabel" TEXT;
ALTER TABLE "FinanceTransaction" ADD COLUMN "taxClassification" TEXT;
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "taxClassification" TEXT;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "taxClassification" TEXT;
