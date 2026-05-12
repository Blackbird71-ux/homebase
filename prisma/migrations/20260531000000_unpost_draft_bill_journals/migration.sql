-- ============================================================
-- Migration: Un-post bill journal entries that were incorrectly auto-posted
-- Date: 2026-05-31
--
-- Root cause: bills/route.ts upsertBillJournalEntry() was setting
-- isPosted=true for balanced journal entries on bill save/edit.
--
-- Accounting rule: bill journal entries (DR expense / CR AP) should
-- only be posted when the invoice is actually received (invoiceReceived=true).
-- Posting them when the bill is merely created causes:
--   - Expenses to appear on the P&L before any invoice exists
--   - Accounts Payable to show on the Balance Sheet for unpaid invoices
--   - Trial Balance to include uncommitted future expenses
--
-- This migration reverts any bill journals that are currently posted
-- but belong to bills where the invoice has NOT been received.
--
-- Bills where invoiceReceived=true are left posted (correct behaviour).
-- ============================================================

-- Step 1: Un-post journal entries linked to bills where invoice NOT received.
-- These were incorrectly auto-posted by the old code.
UPDATE FinanceJournalEntry
SET isPosted = 0
WHERE isPosted = 1
  AND type = 'auto_transaction'
  AND id IN (
    SELECT journalEntryId
    FROM FinanceRecurringBill
    WHERE journalEntryId IS NOT NULL
      AND invoiceReceived = 0
  );

-- Step 2: Safety check — ensure journals for bills WITH invoices are posted.
-- (No-op if already correct, but ensures consistency.)
UPDATE FinanceJournalEntry
SET isPosted = 1
WHERE isPosted = 0
  AND type = 'auto_transaction'
  AND id IN (
    SELECT journalEntryId
    FROM FinanceRecurringBill
    WHERE journalEntryId IS NOT NULL
      AND invoiceReceived = 1
  )
  AND id IN (
    -- Only post if balanced
    SELECT journalEntryId
    FROM FinanceJournalLine
    GROUP BY journalEntryId
    HAVING ABS(
      SUM(CASE WHEN side = 'debit'  THEN amount ELSE 0 END) -
      SUM(CASE WHEN side = 'credit' THEN amount ELSE 0 END)
    ) < 0.01
  );
