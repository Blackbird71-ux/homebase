-- Add unique constraint on (familyId, reference) for FinanceJournalEntry
-- This prevents the race condition where concurrent requests could generate
-- the same reference number (P1-5).

CREATE UNIQUE INDEX "FinanceJournalEntry_familyId_reference_key" ON "FinanceJournalEntry" ("familyId", "reference");
