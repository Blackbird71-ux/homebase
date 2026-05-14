-- ============================================================================
-- Add journalEntryId FK on FinanceBillPayment so the partial-payment undo
-- handler can locate and reverse the GL journal entry created at payment time.
--
-- SQLite limitation: cannot ALTER TABLE ADD COLUMN with UNIQUE in one go,
-- so we add the column then create the index separately.
-- ============================================================================

ALTER TABLE "FinanceBillPayment" ADD COLUMN "journalEntryId" TEXT;
CREATE INDEX "FinanceBillPayment_journalEntryId_idx" ON "FinanceBillPayment"("journalEntryId");
