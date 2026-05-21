-- Backfill: income entries spawned at receipt time (PATCH handler) before this fix
-- did not have status='draft' or templateId set, causing them to appear on the income
-- page instead of the Drafts inbox.
-- Fix: set status='draft' and copy templateId from parent for all un-received,
-- un-voided entries that were spawned from a parent that has a templateId.
UPDATE "FinanceIncomeEntry"
SET
  "status" = 'draft',
  "templateId" = (
    SELECT "templateId"
    FROM "FinanceIncomeEntry" AS parent
    WHERE parent."id" = "FinanceIncomeEntry"."parentIncomeId"
  )
WHERE "parentIncomeId" IS NOT NULL
  AND "status" IS NULL
  AND "isVoided" = 0
  AND "received" = 0
  AND "invoiceReceived" = 0
  AND (
    SELECT "templateId"
    FROM "FinanceIncomeEntry" AS parent
    WHERE parent."id" = "FinanceIncomeEntry"."parentIncomeId"
  ) IS NOT NULL;
