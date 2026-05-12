-- Add sourceTransactionId to FinanceJournalEntry so auto-generated journal entries
-- can be found and updated when their source transaction is edited.
ALTER TABLE "FinanceJournalEntry" ADD COLUMN "sourceTransactionId" TEXT;
CREATE INDEX "FinanceJournalEntry_sourceTransactionId_idx" ON "FinanceJournalEntry"("sourceTransactionId");
