-- ============================================================
-- Migration: Fix journal posting and AR deduplication
-- Date: 2026-05-30 (revised)
--
-- Fixes issues found in the income entry and bill journal audit:
--
-- 1. Post any unposted journal entries that are balanced (DR = CR)
--    AND are linked to an income entry via journalEntryId.
--    Previously, upsertIncomeJournalEntry() always saved isPosted=false.
--    Code is now fixed to auto-post balanced entries. This migration
--    catches existing drafts created before the code fix was deployed.
--
-- Note: Bill journal entries are intentionally NOT auto-posted here.
--    Bills should only be posted when invoiceReceived=true, which is
--    handled by the PATCH handler in bills/route.ts.
--
-- These statements are no-ops if there are no matching journals.
-- ============================================================

-- Post balanced journal entries linked to income entries ONLY.
-- Excludes journals linked to bills (those stay draft until invoice received).
UPDATE FinanceJournalEntry
SET isPosted = 1
WHERE isPosted = 0
  AND id IN (
    SELECT journalEntryId
    FROM FinanceIncomeEntry
    WHERE journalEntryId IS NOT NULL
  )
  AND id NOT IN (
    SELECT journalEntryId
    FROM FinanceRecurringBill
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
