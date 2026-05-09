-- Migration: link income entries and bills to auto-created transactions
-- Adds nullable FK columns so that when income is marked received (or a bill
-- is marked paid) a FinanceTransaction is created and its ID stored here.
-- This keeps account balances and the transaction feed accurate.
--
-- SQLite supports ADD COLUMN with REFERENCES for nullable columns.

-- FinanceIncomeEntry: track the auto-created income transaction
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "transactionId" TEXT
    REFERENCES "FinanceTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "FinanceIncomeEntry_transactionId_idx"
    ON "FinanceIncomeEntry"("transactionId");

-- FinanceRecurringBill: track the auto-created expense transaction
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "transactionId" TEXT
    REFERENCES "FinanceTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "FinanceRecurringBill_transactionId_idx"
    ON "FinanceRecurringBill"("transactionId");
