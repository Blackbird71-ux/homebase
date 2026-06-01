-- Finance chart-of-accounts cleanup (forensic audit findings F4 + F11).
--
-- F4: a one-time bulk insert created 39 unparented isSystem=1 duplicate categories
-- (id LIKE 'cmphrjqup%'), all of which are zero-referenced. The idempotent live
-- seed (finance-seed.ts) cannot remove them. Delete them — but ONLY rows that are
-- still zero-referenced at run time. The NOT EXISTS guards below ARE the run-time
-- re-verification: any row that has acquired a reference is left untouched (no
-- silent SetNull data loss, no Restrict failure). All FinanceCategory back-relations
-- are covered: FinanceTransaction.categoryId/glAccountId, FinanceBudget.categoryId,
-- FinanceRecurringBill.categoryId, FinanceIncomeEntry.categoryId,
-- FinanceBillPayment.glAccountId, FinanceVendor.defaultCategoryId,
-- FinanceJournalLine.glAccountId, FinanceRecurringTemplateLine.glAccountId,
-- FinanceCategory.parentId (children), Family.openingBalancesCategoryId.
--
-- No posted journal line references these rows, so the trial balance is unchanged.
DELETE FROM "FinanceCategory"
WHERE "isSystem" = 1
  AND "parentId" IS NULL
  AND "id" LIKE 'cmphrjqup%'
  AND NOT EXISTS (SELECT 1 FROM "FinanceTransaction"          t  WHERE t."categoryId"          = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceTransaction"          tg WHERE tg."glAccountId"         = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceBudget"               b  WHERE b."categoryId"           = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceRecurringBill"        rb WHERE rb."categoryId"          = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceIncomeEntry"          ie WHERE ie."categoryId"          = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceBillPayment"          bp WHERE bp."glAccountId"         = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceVendor"               v  WHERE v."defaultCategoryId"    = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceJournalLine"          jl WHERE jl."glAccountId"         = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceRecurringTemplateLine" tl WHERE tl."glAccountId"        = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceCategory"             ch WHERE ch."parentId"            = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "Family"                      f  WHERE f."openingBalancesCategoryId" = "FinanceCategory"."id");

-- F11: archive the lingering non-system 'Accounts Receivable (deprecated)' account
-- (hide from reports & pickers rather than delete, to preserve any historical FK).
-- Same zero-reference guard; idempotent (no-op if already hidden or already gone).
-- The ACTIVE 'Accounts Receivable' control account (isSystem=1) is untouched.
UPDATE "FinanceCategory"
SET "hideFromReports" = 1
WHERE "name" = 'Accounts Receivable (deprecated)'
  AND "isSystem" = 0
  AND "hideFromReports" = 0
  AND NOT EXISTS (SELECT 1 FROM "FinanceTransaction"          t  WHERE t."categoryId"          = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceTransaction"          tg WHERE tg."glAccountId"         = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceBudget"               b  WHERE b."categoryId"           = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceRecurringBill"        rb WHERE rb."categoryId"          = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceIncomeEntry"          ie WHERE ie."categoryId"          = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceBillPayment"          bp WHERE bp."glAccountId"         = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceVendor"               v  WHERE v."defaultCategoryId"    = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceJournalLine"          jl WHERE jl."glAccountId"         = "FinanceCategory"."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceRecurringTemplateLine" tl WHERE tl."glAccountId"        = "FinanceCategory"."id");
