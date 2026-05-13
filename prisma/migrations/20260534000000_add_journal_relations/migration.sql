-- Formalize journalEntry Prisma relations for FinanceRecurringBill and FinanceIncomeEntry.
-- journalEntryId columns already exist (added in 20260527000000_add_bill_income_journal_link).
-- FK constraints are omitted to avoid SQLite table-rebuild on production data;
-- Prisma resolves joins from the column value regardless of FK constraint presence.
CREATE INDEX IF NOT EXISTS "FinanceRecurringBill_journalEntryId_idx" ON "FinanceRecurringBill"("journalEntryId");
CREATE INDEX IF NOT EXISTS "FinanceIncomeEntry_journalEntryId_idx" ON "FinanceIncomeEntry"("journalEntryId");
