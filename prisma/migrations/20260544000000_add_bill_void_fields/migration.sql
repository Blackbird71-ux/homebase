-- Add void fields to FinanceRecurringBill and FinanceIncomeEntry
-- Void = accountant-safe soft delete: keeps the record, creates reversal journals, full audit trail.
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "isVoided" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "voidedAt" DATETIME;
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "voidNote" TEXT;

ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "isVoided" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "voidedAt" DATETIME;
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "voidNote" TEXT;
