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
--   ✓ FinanceAccount         → openingBalance/Date/TxId nulled (rows kept)
--
-- What's PRESERVED (untouched):
--   ✓ FinanceCategory        (GL chart of accounts)
--   ✓ FinanceVendor          (contacts / payers)
--   ✓ FinanceEntity          (personal, super fund, trust, etc.)
--   ✓ FinanceBudget          (budget rules)
--   ✓ FinanceLocation        (property / location records)
--   ✓ FinanceSavingsGoal     (goal definitions)
--   ✓ Family / User settings
--
-- SCOPE — family-scoped. Every DELETE/UPDATE below is restricted to the family id(s)
--   in the _wipe_target temp table (step 0). This DB has two families:
--     The Liddles     cmo3yb55h000001ldlk4w6p37   ← finance data lives here (target)
--     Liddle Ahlberg  cmphrixj8000401qar6uxa9uw   ← untouched
--   Edit step 0 to change the target. A non-matching id is a safe no-op (deletes nothing).
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

-- ─── 0. Target family — EDIT to choose whose finance data to wipe ──────────────
-- Every DELETE/UPDATE below is scoped to the id(s) in _wipe_target. This DB has:
--   The Liddles      cmo3yb55h000001ldlk4w6p37   ← finance data lives here (target)
--   Liddle Ahlberg   cmphrixj8000401qar6uxa9uw   ← leave untouched
-- A non-matching id wipes nothing (safe no-op).
DROP TABLE IF EXISTS _wipe_target;
CREATE TEMP TABLE _wipe_target (fid TEXT PRIMARY KEY);
INSERT INTO _wipe_target (fid) VALUES ('cmo3yb55h000001ldlk4w6p37');  -- The Liddles

-- ─── 1. Transactional children (FK dependencies first) ─────────────────────────

-- Partial payments on bills
DELETE FROM "FinanceBillPayment" WHERE familyId IN (SELECT fid FROM _wipe_target);

-- Journal lines (no familyId — scope via parent entry; runs before the entries are deleted)
DELETE FROM "FinanceJournalLine"
WHERE journalEntryId IN (SELECT id FROM "FinanceJournalEntry" WHERE familyId IN (SELECT fid FROM _wipe_target));

-- Journal entries
DELETE FROM "FinanceJournalEntry" WHERE familyId IN (SELECT fid FROM _wipe_target);

-- All transactions (expense, income, transfer, opening_balance)
DELETE FROM "FinanceTransaction" WHERE familyId IN (SELECT fid FROM _wipe_target);

-- Payslip breakdowns linked to income entries
DELETE FROM "FinancePayslip" WHERE familyId IN (SELECT fid FROM _wipe_target);

-- Document attachments
DELETE FROM "BillAttachment" WHERE familyId IN (SELECT fid FROM _wipe_target);
DELETE FROM "IncomeAttachment" WHERE familyId IN (SELECT fid FROM _wipe_target);

-- Cached report data (report_emails has no familyId — scope via parent snapshot; runs first)
DELETE FROM "report_emails"
WHERE snapshotId IN (SELECT id FROM "finance_snapshots" WHERE familyId IN (SELECT fid FROM _wipe_target));
DELETE FROM "finance_snapshots" WHERE familyId IN (SELECT fid FROM _wipe_target);

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
  voidNote              = NULL
WHERE familyId IN (SELECT fid FROM _wipe_target);

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
  voidNote                = NULL
WHERE familyId IN (SELECT fid FROM _wipe_target);

-- ─── 4. Reset account opening-balance pointers ─────────────────────────────────
-- The opening_balance transactions and journals were deleted above, but each
-- FinanceAccount still points at the now-deleted transaction via openingBalanceTxId.
-- If left set, setOpeningBalance() takes its UPDATE path against a missing row and
-- throws (P2025) when you re-enter opening balances. Null them so re-entry takes the
-- clean create path.
UPDATE "FinanceAccount" SET
  openingBalance     = NULL,
  openingBalanceDate = NULL,
  openingBalanceTxId = NULL
WHERE familyId IN (SELECT fid FROM _wipe_target);

PRAGMA foreign_keys = ON;

-- ─── 5. Verification ──────────────────────────────────────────────────────────

-- All counts below are scoped to _wipe_target. DELETED rows should read 0; RESET/KEPT
-- rows show what remains for the target family.
SELECT 'DELETED' AS action, 'FinanceBillPayment'    AS tbl, COUNT(*) AS remaining FROM "FinanceBillPayment" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT 'DELETED', 'FinanceJournalLine',    COUNT(*) FROM "FinanceJournalLine" WHERE journalEntryId IN (SELECT id FROM "FinanceJournalEntry" WHERE familyId IN (SELECT fid FROM _wipe_target))
UNION ALL
SELECT 'DELETED', 'FinanceJournalEntry',   COUNT(*) FROM "FinanceJournalEntry" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT 'DELETED', 'FinanceTransaction',    COUNT(*) FROM "FinanceTransaction" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT 'DELETED', 'FinancePayslip',        COUNT(*) FROM "FinancePayslip" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT 'DELETED', 'BillAttachment',        COUNT(*) FROM "BillAttachment" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT 'DELETED', 'IncomeAttachment',      COUNT(*) FROM "IncomeAttachment" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT 'DELETED', 'finance_snapshots',     COUNT(*) FROM "finance_snapshots" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT 'DELETED', 'report_emails',         COUNT(*) FROM "report_emails" WHERE snapshotId IN (SELECT id FROM "finance_snapshots" WHERE familyId IN (SELECT fid FROM _wipe_target))
UNION ALL
SELECT '' AS action, '' AS tbl, 0 AS remaining
UNION ALL
SELECT 'RESET',   'FinanceRecurringBill',  COUNT(*) FROM "FinanceRecurringBill" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT 'RESET',   'FinanceIncomeEntry',    COUNT(*) FROM "FinanceIncomeEntry" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '' AS action, '' AS tbl, 0 AS remaining
UNION ALL
SELECT 'KEPT',    'FinanceCategory',       COUNT(*) FROM "FinanceCategory" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT 'KEPT',    'FinanceVendor',         COUNT(*) FROM "FinanceVendor" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT 'KEPT',    'FinanceEntity',         COUNT(*) FROM "FinanceEntity" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT 'KEPT',    'FinanceAccount',        COUNT(*) FROM "FinanceAccount" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT 'KEPT',    'FinanceBudget',         COUNT(*) FROM "FinanceBudget" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT 'KEPT',    'FinanceLocation',       COUNT(*) FROM "FinanceLocation" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT 'KEPT',    'FinanceSavingsGoal',    COUNT(*) FROM "FinanceSavingsGoal" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '' AS action, '' AS tbl, 0 AS remaining
UNION ALL
SELECT 'CHECK',   'Accounts w/ stale OB ptr', COUNT(*) FROM "FinanceAccount" WHERE "openingBalanceTxId" IS NOT NULL AND familyId IN (SELECT fid FROM _wipe_target);
