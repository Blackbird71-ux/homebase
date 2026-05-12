-- =============================================================================
-- HomeBase Finance — Transactional Data Wipe
--
-- Deletes all financial transaction data while preserving:
--   ✓ FinanceCategory     (GL chart of accounts — user-created and system)
--   ✓ FinanceVendor       (contacts / payers)
--   ✓ FinanceEntity       (personal, super fund, trust, etc.)
--   ✓ FinanceBudget       (budget rules)
--   ✓ FinanceAccount      (bank accounts)
--   ✓ FinanceRecurringBill templates (bill definitions — resets paid/invoice status)
--   ✓ FinanceIncomeEntry  templates (income definitions — resets received status)
--   ✓ FinanceLocation     (property / location records)
--   ✓ FinanceSavingsGoal  (goal definitions)
--   ✓ Family / User settings
--
-- Deletes:
--   ✗ FinanceBillPayment  (partial payment records)
--   ✗ FinanceJournalLine  (journal entry lines)
--   ✗ FinanceJournalEntry (journal entries)
--   ✗ FinanceTransaction  (all transactions)
--   ✗ finance_snapshots   (report snapshots)
--   ✗ report_emails       (snapshot email records)
--
-- Usage (run on NAS via SSH):
--   # Back up first:
--   cp /data/homebase.db /data/backups/homebase-pre-wipe-$(date +%Y%m%d-%H%M%S).db
--
--   # Run inside container:
--   docker compose exec homebase-app sqlite3 /data/homebase.db < scripts/finance-data-wipe.sql
-- =============================================================================

PRAGMA foreign_keys = OFF;

-- Transactional data
DELETE FROM "FinanceBillPayment";
DELETE FROM "FinanceJournalLine";
DELETE FROM "FinanceJournalEntry";
DELETE FROM "FinanceTransaction";
DELETE FROM "finance_snapshots";
DELETE FROM "report_emails";

-- Reset bill paid/invoice/journal link status (keep bill template definitions)
UPDATE "FinanceRecurringBill" SET
  paid = 0,
  paidDate = NULL,
  invoiceReceived = 0,
  invoiceReceivedDate = NULL,
  journalEntryId = NULL,
  invoiceTxId = NULL,
  paymentTxId = NULL,
  transactionId = NULL,
  parentBillId = NULL;

-- Reset income received/invoice/journal link status (keep income template definitions)
UPDATE "FinanceIncomeEntry" SET
  received = 0,
  receivedDate = NULL,
  journalEntryId = NULL,
  invoiceTxId = NULL,
  receiptTxId = NULL,
  transactionId = NULL,
  parentIncomeId = NULL;

PRAGMA foreign_keys = ON;

-- Verification: confirm all transactional tables are empty
SELECT 'FinanceBillPayment'  AS tbl, COUNT(*) AS remaining FROM "FinanceBillPayment"
UNION ALL
SELECT 'FinanceJournalLine',  COUNT(*) FROM "FinanceJournalLine"
UNION ALL
SELECT 'FinanceJournalEntry', COUNT(*) FROM "FinanceJournalEntry"
UNION ALL
SELECT 'FinanceTransaction',  COUNT(*) FROM "FinanceTransaction"
UNION ALL
SELECT 'finance_snapshots',   COUNT(*) FROM "finance_snapshots";

-- Confirm templates are preserved
SELECT 'FinanceRecurringBill (kept)' AS tbl, COUNT(*) AS count FROM "FinanceRecurringBill"
UNION ALL
SELECT 'FinanceIncomeEntry (kept)',   COUNT(*) FROM "FinanceIncomeEntry"
UNION ALL
SELECT 'FinanceCategory (kept)',      COUNT(*) FROM "FinanceCategory"
UNION ALL
SELECT 'FinanceVendor (kept)',        COUNT(*) FROM "FinanceVendor";
