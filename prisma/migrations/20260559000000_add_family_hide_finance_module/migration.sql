-- Add hideFinanceModule to Family — admin toggle to hide Finance nav and show Simple Budget Planner
ALTER TABLE "Family" ADD COLUMN "hideFinanceModule" BOOLEAN NOT NULL DEFAULT 0;
