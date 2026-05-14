-- Add hideFromReports field to FinanceCategory
-- Allows hiding system-generated GL categories from reports & dialog pickers
ALTER TABLE "FinanceCategory" ADD COLUMN "hideFromReports" BOOLEAN NOT NULL DEFAULT false;
