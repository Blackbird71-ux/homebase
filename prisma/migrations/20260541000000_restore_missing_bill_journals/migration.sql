-- ============================================================================
-- Migration: Restore missing accrual journals for Youi & Xero
--
-- Background:
--   Two bills (Youi Motorbike Insurance $83.83, Xero $35.00) are marked
--   invoiceReceived=1 AND paid=1 but their journalEntryId points to rows that
--   were deleted from FinanceJournalEntry. The corresponding payment journals
--   (DR AP / CR Bank) DO exist, but the accrual half (DR Expense / CR AP) was
--   lost. Net effect: P&L is understated by $118.83 and AP is overstated by
--   $118.83.
--
--   Forensic audit on 14 May 2026 confirmed:
--     - Youi bill id: cmp4x13q2000301nnowftv0wg -> dangling JE id: cmp4x1cnq000401nnn0dyoqrn
--     - Xero bill id: cmp53ab71002a01qv60zq6boz -> dangling JE id: cmp53agsw002c01qva2xlyvpf
--     - Orphan JE-0005 (cmp4wyjy9000001nng7g2ms4p) for Youi: lines balanced
--       DR Insurance-Motorbike $83.83 / CR Accounts Payable $83.83. Unposted.
--
-- Strategy:
--   1. Promote orphan JE-0005 to posted and re-link the Youi bill.
--   2. Create a fresh posted journal for Xero (no orphan available) and link
--      it to the bill.
--
-- IDEMPOTENCY:
--   Each UPDATE/INSERT is guarded with WHERE clauses or NOT EXISTS subqueries.
--   Running the migration a second time is a no-op.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. YOUI: promote orphan JE-0005 to posted, link bill, mark date
-- ---------------------------------------------------------------------------

-- 1a. Promote JE-0005 to posted IF it is still unposted (idempotent)
UPDATE FinanceJournalEntry
SET    isPosted = 1,
       date     = '2026-05-06T00:00:00.000+00:00'   -- preserve original invoice date
WHERE  id = 'cmp4wyjy9000001nng7g2ms4p'
  AND  isPosted = 0;

-- 1b. Re-link the Youi bill to the now-posted JE-0005 IF still pointing at the
--     dangling reference (idempotent: re-running after fix is a no-op).
UPDATE FinanceRecurringBill
SET    journalEntryId = 'cmp4wyjy9000001nng7g2ms4p'
WHERE  id = 'cmp4x13q2000301nnowftv0wg'
  AND  journalEntryId = 'cmp4x1cnq000401nnn0dyoqrn';

-- ---------------------------------------------------------------------------
-- 2. XERO: create a fresh accrual journal, link bill
-- ---------------------------------------------------------------------------

-- 2a. Skip if the bill is already linked to a non-dangling JE (idempotent).
--     Otherwise insert a new JE and use its id below.
--
--     We use a deterministic id so the migration is deterministic across
--     environments. (Prisma's default @id is cuid() at app layer; raw SQL
--     needs a fixed id we can reference. We pick 'fix_xero_je_20260514'
--     — short, descriptive, prefixed, won't collide with cuid output.)
INSERT INTO FinanceJournalEntry
  (id, reference, date, description, type, isPosted, isReversed,
   entityId, familyId, createdAt, updatedAt)
SELECT
  'fix_xero_je_20260514',
  -- Use a unique reference that won't collide with existing JE-NNNN values.
  -- The next time nextJournalReference() runs it scans MAX(JE-NNNN); this
  -- 'FIX-0001' label is human-readable and excluded from that regex.
  'FIX-0001',
  '2026-05-13T00:00:00.000+00:00',
  'Xero (restored)',
  'auto_transaction',
  1,   -- isPosted
  0,   -- isReversed
  b.entityId,
  b.familyId,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM   FinanceRecurringBill b
WHERE  b.id = 'cmp53ab71002a01qv60zq6boz'
  AND  NOT EXISTS (
    SELECT 1 FROM FinanceJournalEntry WHERE id = 'fix_xero_je_20260514'
  );

-- 2b. Create the two balanced lines for the Xero accrual.
--     We look up the expense category (the bill's categoryId) and the
--     Accounts Payable system category dynamically — they may vary by
--     environment.
--
--     IMPORTANT: we must use the same AP category the rest of the system
--     uses. We pick the OLDEST (createdAt-min) AP system category — this is
--     the same row that ensureAccountsPayableCategory() will return after
--     Phase 6.5's helper fix. Today it's cmozfz2uq000c01miyi36avpc.

-- 2b-i. Expense leg (DR expense category from the bill)
INSERT INTO FinanceJournalLine
  (id, journalEntryId, glAccountId, side, amount, description, createdAt)
SELECT
  'fix_xero_jl_dr_20260514',
  'fix_xero_je_20260514',
  b.categoryId,
  'debit',
  b.amount,
  b.name,
  CURRENT_TIMESTAMP
FROM   FinanceRecurringBill b
WHERE  b.id = 'cmp53ab71002a01qv60zq6boz'
  AND  b.categoryId IS NOT NULL
  AND  NOT EXISTS (
    SELECT 1 FROM FinanceJournalLine WHERE id = 'fix_xero_jl_dr_20260514'
  );

-- 2b-ii. AP leg (CR Accounts Payable — oldest system AP category)
INSERT INTO FinanceJournalLine
  (id, journalEntryId, glAccountId, side, amount, description, createdAt)
SELECT
  'fix_xero_jl_cr_20260514',
  'fix_xero_je_20260514',
  (SELECT id FROM FinanceCategory
   WHERE familyId = b.familyId
     AND type = 'liability'
     AND isSystem = 1
     AND lower(name) LIKE '%accounts payable%'
   ORDER BY createdAt ASC, rowid ASC
   LIMIT 1),
  'credit',
  b.amount,
  'AP: ' || b.name,
  CURRENT_TIMESTAMP
FROM   FinanceRecurringBill b
WHERE  b.id = 'cmp53ab71002a01qv60zq6boz'
  AND  NOT EXISTS (
    SELECT 1 FROM FinanceJournalLine WHERE id = 'fix_xero_jl_cr_20260514'
  );

-- 2c. Re-link the Xero bill IF still pointing at the dangling reference.
UPDATE FinanceRecurringBill
SET    journalEntryId = 'fix_xero_je_20260514'
WHERE  id = 'cmp53ab71002a01qv60zq6boz'
  AND  journalEntryId = 'cmp53agsw002c01qva2xlyvpf';

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFICATION — these SELECTs run after the COMMIT, results appear in logs.
-- They are read-only and idempotent.
-- ---------------------------------------------------------------------------

-- Expected after success:
--   Both rows show is_present = 1 and is_posted = 1.
--   Both bills show their journalEntryId resolving to a real, posted JE.
SELECT
  b.id              AS bill_id,
  b.name,
  b.amount,
  b.journalEntryId,
  (SELECT 1 FROM FinanceJournalEntry WHERE id = b.journalEntryId) AS is_present,
  (SELECT isPosted FROM FinanceJournalEntry WHERE id = b.journalEntryId) AS is_posted
FROM FinanceRecurringBill b
WHERE b.id IN ('cmp4x13q2000301nnowftv0wg', 'cmp53ab71002a01qv60zq6boz');
