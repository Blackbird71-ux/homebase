-- =============================================================================
-- HomeBase Finance — Complete Transactional Data Wipe
--
-- Deletes ALL financial transaction data while preserving:
--   ✓ FinanceCategory       (GL chart of accounts — user-created and system)
--   ✓ FinanceVendor         (contacts / payers)
--   ✓ FinanceEntity         (personal, super fund, trust, etc.)
--   ✓ FinanceBudget         (budget rules)
--   ✓ FinanceAccount        (bank accounts — opening-balance pointers reset; see step 4)
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
--   ✗ FinancePayslip        (per-occurrence PAYG/SGC payslip breakdowns)
--   ✗ IncomeAttachment      (uploaded income document records)
--   ✗ BillAttachment        (uploaded bill document records)
--   ✗ finance_snapshots     (report snapshots)
--   ✗ report_emails         (snapshot email records)
--
-- SCOPE — family-scoped. Every DELETE/UPDATE below is restricted to the family id(s)
--   in the _wipe_target temp table (step 0). This DB has two families:
--     The Liddles     cmo3yb55h000001ldlk4w6p37   ← finance data lives here (wipe target)
--     Liddle Ahlberg  cmphrixj8000401qar6uxa9uw   ← untouched
--   Edit step 0 to change the target. A non-matching id is a safe no-op (deletes nothing).
--
-- Usage (SSH into NAS first, then run inside container):
--   # Option A — pipe via docker exec:
--   docker exec -i homebase-app sqlite3 /data/homebase.db < scripts/finance-data-wipe.sql
--
--   # Option B — from host shell with cat:
--   cat scripts/finance-data-wipe.sql | docker exec -i homebase-app sqlite3 /data/homebase.db
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

-- Partial payments on bills (FK→FinanceTransaction, FinanceJournalEntry)
DELETE FROM "FinanceBillPayment" WHERE familyId IN (SELECT fid FROM _wipe_target);

-- Journal lines (no familyId — scope via parent entry; runs before the entries are deleted)
DELETE FROM "FinanceJournalLine"
WHERE journalEntryId IN (SELECT id FROM "FinanceJournalEntry" WHERE familyId IN (SELECT fid FROM _wipe_target));

-- Journal entries (FK→FinanceTransaction via sourceTransactionId; set nulls handled)
DELETE FROM "FinanceJournalEntry" WHERE familyId IN (SELECT fid FROM _wipe_target);

-- All transactions (FK→almost everything; set nulls handled)
DELETE FROM "FinanceTransaction" WHERE familyId IN (SELECT fid FROM _wipe_target);

-- Payslip breakdowns linked to income entries (PAYG/SGC per occurrence)
DELETE FROM "FinancePayslip" WHERE familyId IN (SELECT fid FROM _wipe_target);

-- Document attachments (FK→FinanceIncomeEntry, FinanceRecurringBill; CASCADE)
DELETE FROM "IncomeAttachment" WHERE familyId IN (SELECT fid FROM _wipe_target);
DELETE FROM "BillAttachment" WHERE familyId IN (SELECT fid FROM _wipe_target);

-- Report snapshot data (report_emails has no familyId — scope via parent snapshot; runs first)
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

-- All counts below are scoped to _wipe_target. [DELETE] rows should read 0; [KEEP]
-- rows show what remains for the target family.
SELECT '[DELETE] FinanceBillPayment'    AS tbl, COUNT(*) AS remaining FROM "FinanceBillPayment" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[DELETE] FinanceJournalLine',    COUNT(*) FROM "FinanceJournalLine" WHERE journalEntryId IN (SELECT id FROM "FinanceJournalEntry" WHERE familyId IN (SELECT fid FROM _wipe_target))
UNION ALL
SELECT '[DELETE] FinanceJournalEntry',   COUNT(*) FROM "FinanceJournalEntry" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[DELETE] FinanceTransaction',    COUNT(*) FROM "FinanceTransaction" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[DELETE] FinancePayslip',        COUNT(*) FROM "FinancePayslip" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[DELETE] IncomeAttachment',      COUNT(*) FROM "IncomeAttachment" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[DELETE] BillAttachment',        COUNT(*) FROM "BillAttachment" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[DELETE] finance_snapshots',     COUNT(*) FROM "finance_snapshots" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[DELETE] report_emails',         COUNT(*) FROM "report_emails" WHERE snapshotId IN (SELECT id FROM "finance_snapshots" WHERE familyId IN (SELECT fid FROM _wipe_target))
UNION ALL
SELECT ''                               AS tbl, 0 AS remaining
UNION ALL
SELECT '[KEEP]  FinanceRecurringBill',   COUNT(*) FROM "FinanceRecurringBill" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[KEEP]  FinanceIncomeEntry',     COUNT(*) FROM "FinanceIncomeEntry" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[KEEP]  FinanceCategory',        COUNT(*) FROM "FinanceCategory" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[KEEP]  FinanceVendor',          COUNT(*) FROM "FinanceVendor" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[KEEP]  FinanceEntity',          COUNT(*) FROM "FinanceEntity" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[KEEP]  FinanceAccount',         COUNT(*) FROM "FinanceAccount" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[KEEP]  FinanceBudget',          COUNT(*) FROM "FinanceBudget" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[KEEP]  FinanceLocation',        COUNT(*) FROM "FinanceLocation" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[KEEP]  FinanceSavingsGoal',     COUNT(*) FROM "FinanceSavingsGoal" WHERE familyId IN (SELECT fid FROM _wipe_target)
UNION ALL
SELECT '[CHECK] Accounts w/ stale OB ptr', COUNT(*) FROM "FinanceAccount" WHERE "openingBalanceTxId" IS NOT NULL AND familyId IN (SELECT fid FROM _wipe_target);
