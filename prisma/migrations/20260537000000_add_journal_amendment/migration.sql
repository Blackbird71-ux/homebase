-- Add amendmentOfId to FinanceJournalEntry
-- Links a corrective journal entry back to the original entry it amends.
-- The amendment workflow: original → reversal (reversalOfId) + new corrective entry (amendmentOfId → original).
-- This preserves a full audit trail: the original is isReversed=true, the reversal zeroes it out,
-- and the new corrective entry carries amendmentOfId so it can be traced back to the original.

ALTER TABLE "FinanceJournalEntry" ADD COLUMN "amendmentOfId" TEXT;
CREATE INDEX "FinanceJournalEntry_amendmentOfId_idx" ON "FinanceJournalEntry"("amendmentOfId");
