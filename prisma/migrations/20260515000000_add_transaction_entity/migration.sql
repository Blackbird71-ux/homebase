-- Migration: add entityId to FinanceTransaction for multi-entity support
-- Transactions can now be tagged to a specific FinanceEntity just like bills and income.
-- Nullable with SET NULL cascade so deleting an entity doesn't delete transactions.

ALTER TABLE "FinanceTransaction" ADD COLUMN "entityId" TEXT
    REFERENCES "FinanceEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FinanceTransaction_entityId_idx" ON "FinanceTransaction"("entityId");
