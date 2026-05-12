-- AddColumn: gstApplicable flag on FinanceCategory
-- When true, transactions using this category will automatically generate
-- a posted journal entry splitting the amount into ex-GST + GST ITC/Collected.

ALTER TABLE "FinanceCategory" ADD COLUMN "gstApplicable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinanceCategory" ADD COLUMN "gstRate" REAL NOT NULL DEFAULT 10;
