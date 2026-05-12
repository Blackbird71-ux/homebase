-- ============================================================
-- Migration: Fix journal posting and AR deduplication
-- Date: 2026-05-30
--
-- Fixes issues found in the income entry journal audit:
--
-- 1. Post any unposted journal entries that are balanced (DR = CR)
--    AND are linked to an income entry via journalEntryId.
--    Previously, upsertIncomeJournalEntry() always saved isPosted=false.
--    Code is now fixed to auto-post balanced entries. This migration
--    catches existing drafts created before the code fix was deployed.
--
-- 2. Post any balanced unposted auto_transaction journal entries
--    (broader safety net for journals created via income/bill dialogs).
--
-- These statements are no-ops if there are no draft journals.
-- ============================================================

-- Step 1: Post balanced journal entries linked to income entries
UPDATE FinanceJournalEntry
SET isPosted = 1
WHERE isPosted = 0
  AND id IN (
    SELECT journalEntryId
    FROM FinanceIncomeEntry
    WHERE journalEntryId IS NOT NULL
  )
  AND id IN (
    SELECT journalEntryId
    FROM FinanceJournalLine
    GROUP BY journalEntryId
    HAVING ABS(
      SUM(CASE WHEN side = 'debit'  THEN amount ELSE 0 END) -
      SUM(CASE WHEN side = 'credit' THEN amount ELSE 0 END)
    ) < 0.01
  );

-- Step 2: Post any other balanced unposted auto_transaction journal entries
-- (e.g. those created via income/bill dialogs without a journalEntryId link)
UPDATE FinanceJournalEntry
SET isPosted = 1
WHERE isPosted = 0
  AND type = 'auto_transaction'
  AND id IN (
    SELECT journalEntryId
    FROM FinanceJournalLine
    GROUP BY journalEntryId
    HAVING ABS(
      SUM(CASE WHEN side = 'debit'  THEN amount ELSE 0 END) -
      SUM(CASE WHEN side = 'credit' THEN amount ELSE 0 END)
    ) < 0.01
  );
