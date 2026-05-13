-- Add receiptJournalEntryId to FinanceIncomeEntry
-- This links the cash-receipt GL journal (DR bank / CR AR) posted when income is marked as received.
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "receiptJournalEntryId" TEXT;
CREATE INDEX "FinanceIncomeEntry_receiptJournalEntryId_idx" ON "FinanceIncomeEntry"("receiptJournalEntryId");
