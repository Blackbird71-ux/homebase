-- ============================================================
-- Migration: Fix AP/AR isSystem flag + GL balance integrity trigger
-- 
-- Fix 1: AP and AR were created with isSystem=FALSE.
--   ensureAccountsPayableCategory() searches for isSystem=TRUE.
--   Without this fix, every bill posting creates a duplicate AP/AR
--   category, splitting balances in the Trial Balance.
--
-- Fix 2: Database-level trigger prevents posting an unbalanced
--   journal entry. Backstop in addition to app-level validation.
-- ============================================================

UPDATE FinanceCategory
SET isSystem = 1
WHERE name = 'Accounts Payable'
  AND type = 'liability';

UPDATE FinanceCategory
SET isSystem = 1
WHERE name = 'Accounts Receivable'
  AND type = 'asset';

-- Trigger on UPDATE: fires when isPosted changes 0→1
CREATE TRIGGER IF NOT EXISTS trg_journal_balance_on_post
  AFTER UPDATE OF isPosted ON FinanceJournalEntry
  WHEN NEW.isPosted = 1 AND OLD.isPosted = 0
BEGIN
  SELECT CASE
    WHEN ABS(
      (SELECT COALESCE(SUM(amount), 0) FROM FinanceJournalLine
       WHERE journalEntryId = NEW.id AND side = 'debit')
      -
      (SELECT COALESCE(SUM(amount), 0) FROM FinanceJournalLine
       WHERE journalEntryId = NEW.id AND side = 'credit')
    ) > 0.005
    THEN RAISE(ABORT, 'Journal entry is unbalanced: debits must equal credits within $0.005')
  END;
END;
