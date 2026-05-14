-- Performance indexes to accelerate P&L, balance sheet, and overview queries.
-- All statements are CREATE INDEX IF NOT EXISTS — safe to apply on any DB state.

-- FinanceJournalEntry: compound index for posted-entry range queries (P&L, Balance Sheet)
CREATE INDEX IF NOT EXISTS "FinanceJournalEntry_familyId_isPosted_date_idx"
  ON "FinanceJournalEntry"("familyId", "isPosted", "date" DESC);

-- FinanceJournalEntry: compound index for entity-scoped posted-entry range queries
CREATE INDEX IF NOT EXISTS "FinanceJournalEntry_familyId_entityId_isPosted_date_idx"
  ON "FinanceJournalEntry"("familyId", "entityId", "isPosted", "date" DESC);

-- FinanceJournalLine: compound index to accelerate joins between lines and their entries
CREATE INDEX IF NOT EXISTS "FinanceJournalLine_glAccountId_journalEntryId_idx"
  ON "FinanceJournalLine"("glAccountId", "journalEntryId");

-- FinanceTransaction: compound index for date+type range queries (overview, P&L txs)
CREATE INDEX IF NOT EXISTS "FinanceTransaction_familyId_date_type_idx"
  ON "FinanceTransaction"("familyId", "date" DESC, "type");

-- FinanceTransaction: compound index for account balance derivation
CREATE INDEX IF NOT EXISTS "FinanceTransaction_familyId_accountId_isCleared_idx"
  ON "FinanceTransaction"("familyId", "accountId", "isCleared");

-- FinanceRecurringBill: compound index for active bills sorted by due date
CREATE INDEX IF NOT EXISTS "FinanceRecurringBill_familyId_isActive_nextDueDate_idx"
  ON "FinanceRecurringBill"("familyId", "isActive", "nextDueDate");
