-- Add financial year start month to Family
-- Default 7 = July (Australian financial year).
-- Valid range: 1-12.
ALTER TABLE "Family" ADD COLUMN "financeYearStartMonth" INTEGER NOT NULL DEFAULT 7;
