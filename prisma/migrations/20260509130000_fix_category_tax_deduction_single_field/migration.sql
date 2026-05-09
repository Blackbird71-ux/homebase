-- AlterTable: FinanceCategory - replace isTaxableIncome/isTaxableExpense with single isTaxDeduction field
ALTER TABLE "FinanceCategory" ADD COLUMN "isTaxDeduction" BOOLEAN NOT NULL DEFAULT false;

-- Migrate data: if isTaxableExpense was true, set isTaxDeduction to true
UPDATE "FinanceCategory" SET "isTaxDeduction" = true WHERE "isTaxableExpense" = true;

-- Drop old columns
ALTER TABLE "FinanceCategory" DROP COLUMN "isTaxableIncome";
ALTER TABLE "FinanceCategory" DROP COLUMN "isTaxableExpense";
