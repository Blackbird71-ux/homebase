-- =============================================================================
-- HomeBase Finance — Complete Transactional Data Wipe
--
-- Deletes ALL financial transaction data while preserving:
--   ✓ FinanceCategory       (GL chart of accounts — user-created and system)
--   ✓ FinanceVendor         (contacts / payers)
--   ✓ FinanceEntity         (personal, super fund, trust, etc.)
--   ✓ FinanceBudget         (budget rules)
--   ✓ FinanceAccount        (bank accounts)
--   ✓ FinanceRecurringBill  templates (bill definitions — resets transactional fields)
--   ✓ FinanceIncomeEntry    templates (income definitions — resets transactional fields)
--   ✓ FinanceLocation       (property / location records)
--   ✓ FinanceSavingsGoal    (goal definitions)
--   ✓ Family / User settings
--
-- Deletes:
--   ✗ FinanceBillPayment    (partial payment records)
--   ✗ FinanceJournalLine    (journal entry lines)
--   ✗ FinanceJournalEntry   (journal entries — including reversal/amendment chains)
--   ✗ FinanceTransaction    (all transactions)
--   ✗ IncomeAttachment      (uploaded income document records)
--   ✗ BillAttachment        (uploaded bill document records)
--   ✗ finance_snapshots     (report snapshots)
--   ✗ report_emails         (snapshot email records)
--
-- Usage (SSH into NAS first, then run inside container):
--   # Option A — pipe via docker exec:
--   docker exec -i homebase-app sqlite3 /data/homebase.db < scripts/finance-data-wipe.sql
--
--   # Option B — from host shell with cat:
--   cat scripts/finance-data-wipe.sql | docker exec -i homebase-app sqlite3 /data/homebase.db
-- =============================================================================

PRAGMA foreign_keys = OFF;

-- ─── 1. Transactional children (FK dependencies first) ─────────────────────────

-- Partial payments on bills (FK→FinanceTransaction, FinanceJournalEntry)
DELETE FROM "FinanceBillPayment";

-- Journal lines (FK→FinanceJournalEntry, CASCADE)
DELETE FROM "FinanceJournalLine";

-- Journal entries (FK→FinanceTransaction via sourceTransactionId; set nulls handled)
DELETE FROM "FinanceJournalEntry";

-- All transactions (FK→almost everything; set nulls handled)
DELETE FROM "FinanceTransaction";

-- Document attachments (FK→FinanceIncomeEntry, FinanceRecurringBill; CASCADE)
DELETE FROM "IncomeAttachment";
DELETE FROM "BillAttachment";

-- Report snapshot data
DELETE FROM "report_emails";
DELETE FROM "finance_snapshots";

-- ─── 2. Reset bill templates — keep definitions, wipe transactional links ──────

UPDATE "FinanceRecurringBill" SET
  paid                  = 0,
  paidDate              = NULL,
  invoiceReceived       = 0,
  invoiceReceivedDate   = NULL,
  journalEntryId        = NULL,
  invoiceTxId           = NULL,
  paymentTxId           = NULL,
  transactionId         = NULL,
  parentBillId          = NULL,
  isVoided              = 0,
  voidedAt              = NULL,
  voidNote              = NULL;

-- ─── 3. Reset income templates — keep definitions, wipe transactional links ────

UPDATE "FinanceIncomeEntry" SET
  received                = 0,
  receivedDate            = NULL,
  journalEntryId          = NULL,
  receiptJournalEntryId   = NULL,
  invoiceTxId             = NULL,
  receiptTxId             = NULL,
  transactionId           = NULL,
  parentIncomeId          = NULL,
  isVoided                = 0,
  voidedAt                = NULL,
  voidNote                = NULL;

PRAGMA foreign_keys = ON;

-- ─── 4. Verification ──────────────────────────────────────────────────────────

SELECT '[DELETE] FinanceBillPayment'    AS tbl, COUNT(*) AS remaining FROM "FinanceBillPayment"
UNION ALL
SELECT '[DELETE] FinanceJournalLine',    COUNT(*) FROM "FinanceJournalLine"
UNION ALL
SELECT '[DELETE] FinanceJournalEntry',   COUNT(*) FROM "FinanceJournalEntry"
UNION ALL
SELECT '[DELETE] FinanceTransaction',    COUNT(*) FROM "FinanceTransaction"
UNION ALL
SELECT '[DELETE] IncomeAttachment',      COUNT(*) FROM "IncomeAttachment"
UNION ALL
SELECT '[DELETE] BillAttachment',        COUNT(*) FROM "BillAttachment"
UNION ALL
SELECT '[DELETE] finance_snapshots',     COUNT(*) FROM "finance_snapshots"
UNION ALL
SELECT '[DELETE] report_emails',         COUNT(*) FROM "report_emails"
UNION ALL
SELECT ''                               AS tbl, 0 AS remaining
UNION ALL
SELECT '[KEEP]  FinanceRecurringBill',   COUNT(*) FROM "FinanceRecurringBill"
UNION ALL
SELECT '[KEEP]  FinanceIncomeEntry',     COUNT(*) FROM "FinanceIncomeEntry"
UNION ALL
SELECT '[KEEP]  FinanceCategory',        COUNT(*) FROM "FinanceCategory"
UNION ALL
SELECT '[KEEP]  FinanceVendor',          COUNT(*) FROM "FinanceVendor"
UNION ALL
SELECT '[KEEP]  FinanceEntity',          COUNT(*) FROM "FinanceEntity"
UNION ALL
SELECT '[KEEP]  FinanceAccount',         COUNT(*) FROM "FinanceAccount"
UNION ALL
SELECT '[KEEP]  FinanceBudget',          COUNT(*) FROM "FinanceBudget"
UNION ALL
SELECT '[KEEP]  FinanceLocation',        COUNT(*) FROM "FinanceLocation"
UNION ALL
SELECT '[KEEP]  FinanceSavingsGoal',     COUNT(*) FROM "FinanceSavingsGoal";
