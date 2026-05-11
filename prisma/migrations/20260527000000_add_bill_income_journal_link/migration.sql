-- Add journalEntryId to FinanceRecurringBill
-- Links a bill to its double-entry journal entry (accrual: DR expense / CR AP)
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "journalEntryId" TEXT;

-- Add journalEntryId to FinanceIncomeEntry
-- Links an income entry to its double-entry journal entry (accrual: DR AR / CR income)
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "journalEntryId" TEXT;
