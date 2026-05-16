-- =============================================================================
-- HomeBase — Clear All Financial Transaction Data (Keep Templates)
--
-- Deletes ALL transactional/financial data while PRESERVING all template
-- and reference records you've added (bills, income entries, categories,
-- vendors, entities, accounts, locations, budgets, savings goals, etc.)
--
-- What gets DELETED:
--   ✗ FinanceBillPayment     (partial payment records)
--   ✗ FinanceJournalLine     (journal entry lines)
--   ✗ FinanceJournalEntry    (journal entries — including reversal/amendment chains)
--   ✗ FinanceTransaction     (all transactions — expense, income, transfer)
--   ✗ FinancePayslip         (per-occurrence payslip breakdowns with PAYG/SGC)
--   ✗ BillAttachment         (uploaded bill document records)
--   ✗ IncomeAttachment       (uploaded income document records)
--   ✗ finance_snapshots      (cached report snapshot data)
--   ✗ report_emails          (snapshot email records)
--
-- What gets RESET (templates kept, transactional fields cleared):
--   ✓ FinanceRecurringBill   → paid=0, invoiceReceived=0, FK nulls
--   ✓ FinanceIncomeEntry     → received=0, FK nulls
--
-- What's PRESERVED (untouched):
--   ✓ FinanceCategory        (GL chart of accounts)
--   ✓ FinanceVendor          (contacts / payers)
--   ✓ FinanceEntity          (personal, super fund, trust, etc.)
--   ✓ FinanceAccount         (bank accounts)
--   ✓ FinanceBudget          (budget rules)
--   ✓ FinanceLocation        (property / location records)
--   ✓ FinanceSavingsGoal     (goal definitions)
--   ✓ Family / User settings
--
-- Usage:
--   docker exec -i homebase-app sqlite3 /data/homebase.db < scripts/clear-bills-income.sh
--
--   # OR paste inline:
--   docker exec -i homebase-app sqlite3 /data/homebase.db << 'EOF'
--   ... (paste the SQL below) ...
--   EOF
-- =============================================================================

PRAGMA foreign_keys = OFF;

-- ─── 1. Transactional children (FK dependencies first) ─────────────────────────

-- Partial payments on bills
DELETE FROM "FinanceBillPayment";

-- Journal lines (FK→FinanceJournalEntry)
DELETE FROM "FinanceJournalLine";

-- Journal entries
DELETE FROM "FinanceJournalEntry";

-- All transactions (expense, income, transfer, opening_balance)
DELETE FROM "FinanceTransaction";

-- Payslip breakdowns linked to income entries
DELETE FROM "FinancePayslip";

-- Document attachments
DELETE FROM "BillAttachment";
DELETE FROM "IncomeAttachment";

-- Cached report data
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

SELECT 'DELETED' AS action, 'FinanceBillPayment'    AS tbl, COUNT(*) AS remaining FROM "FinanceBillPayment"
UNION ALL
SELECT 'DELETED', 'FinanceJournalLine',    COUNT(*) FROM "FinanceJournalLine"
UNION ALL
SELECT 'DELETED', 'FinanceJournalEntry',   COUNT(*) FROM "FinanceJournalEntry"
UNION ALL
SELECT 'DELETED', 'FinanceTransaction',    COUNT(*) FROM "FinanceTransaction"
UNION ALL
SELECT 'DELETED', 'FinancePayslip',        COUNT(*) FROM "FinancePayslip"
UNION ALL
SELECT 'DELETED', 'BillAttachment',        COUNT(*) FROM "BillAttachment"
UNION ALL
SELECT 'DELETED', 'IncomeAttachment',      COUNT(*) FROM "IncomeAttachment"
UNION ALL
SELECT 'DELETED', 'finance_snapshots',     COUNT(*) FROM "finance_snapshots"
UNION ALL
SELECT 'DELETED', 'report_emails',         COUNT(*) FROM "report_emails"
UNION ALL
SELECT '' AS action, '' AS tbl, 0 AS remaining
UNION ALL
SELECT 'RESET',   'FinanceRecurringBill',  COUNT(*) FROM "FinanceRecurringBill"
UNION ALL
SELECT 'RESET',   'FinanceIncomeEntry',    COUNT(*) FROM "FinanceIncomeEntry"
UNION ALL
SELECT '' AS action, '' AS tbl, 0 AS remaining
UNION ALL
SELECT 'KEPT',    'FinanceCategory',       COUNT(*) FROM "FinanceCategory"
UNION ALL
SELECT 'KEPT',    'FinanceVendor',         COUNT(*) FROM "FinanceVendor"
UNION ALL
SELECT 'KEPT',    'FinanceEntity',         COUNT(*) FROM "FinanceEntity"
UNION ALL
SELECT 'KEPT',    'FinanceAccount',        COUNT(*) FROM "FinanceAccount"
UNION ALL
SELECT 'KEPT',    'FinanceBudget',         COUNT(*) FROM "FinanceBudget"
UNION ALL
SELECT 'KEPT',    'FinanceLocation',       COUNT(*) FROM "FinanceLocation"
UNION ALL
SELECT 'KEPT',    'FinanceSavingsGoal',    COUNT(*) FROM "FinanceSavingsGoal";
