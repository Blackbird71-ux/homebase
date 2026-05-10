-- Add isTransfer to FinanceTransaction
-- Marks transactions that are inter-entity fund movements.
-- These are excluded from P&L totals and tax calculations to avoid double-counting.
-- Defaults to false so all existing transactions are treated as normal (not transfers).
ALTER TABLE "FinanceTransaction" ADD COLUMN "isTransfer" BOOLEAN NOT NULL DEFAULT false;
