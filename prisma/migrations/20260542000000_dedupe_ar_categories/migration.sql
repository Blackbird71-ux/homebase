-- ============================================================================
-- Migration: Deduplicate "Accounts Receivable" categories
--
-- Background:
--   The previous fix (20260533) updated isSystem on the original AR. Before
--   that fix landed, ensureAccountsReceivableCategory() had already created a
--   duplicate. Both rows now have isSystem=1 and the helper picks whichever
--   appears first.
--
--   Verified state on 14 May 2026:
--     id cmozfyqwo000b01mio4knh0kc  name="0 Accounts Receivable"  4 journal lines, $1,332.56 x 2 each side
--     id cmp4y099e000h01nnzjzkgy76  name="Accounts Receivable"    0 lines (empty)
--
-- Strategy:
--   1. Rename the EMPTY AR with a deprecation suffix and hide it.
--   2. Rename the active AR from "0 Accounts Receivable" -> "Accounts Receivable".
--   3. Leave the empty row in place (preserves any historical references and
--      keeps cuid-stable for diagnostics).
--
-- IDEMPOTENCY: All UPDATEs are guarded by id and current name; running twice
-- is a no-op.
--
-- ORDER MATTERS: the unique constraint is (familyId, name). We must rename
-- the empty row FIRST (away from "Accounts Receivable") before renaming the
-- active row INTO "Accounts Receivable". Otherwise the second UPDATE would
-- violate the unique index.
-- ============================================================================

BEGIN;

-- Step 1: Mark the EMPTY AR as deprecated and hidden.
UPDATE FinanceCategory
SET    name            = 'Accounts Receivable (deprecated)',
       hideFromReports = 1,
       isSystem        = 0
WHERE  id = 'cmp4y099e000h01nnzjzkgy76'
  AND  name = 'Accounts Receivable';   -- guard: only rename if currently the clean name

-- Step 2: Now safe to rename the active AR.
UPDATE FinanceCategory
SET    name = 'Accounts Receivable'
WHERE  id = 'cmozfyqwo000b01mio4knh0kc'
  AND  name = '0 Accounts Receivable';   -- guard: idempotent

COMMIT;

-- VERIFICATION:
SELECT id, name, isSystem, hideFromReports
FROM   FinanceCategory
WHERE  type = 'asset'
  AND  lower(name) LIKE '%accounts receivable%'
ORDER  BY rowid;
-- Expected:
--   cmozfyqwo000b01mio4knh0kc  Accounts Receivable               1  0
--   cmp4y099e000h01nnzjzkgy76  Accounts Receivable (deprecated)  0  1
