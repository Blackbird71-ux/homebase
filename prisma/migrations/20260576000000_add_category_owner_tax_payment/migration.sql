-- Per-person tax attribution on GL accounts (FINANCE_AUDIT.md §3).
--
-- The Tax Report's per-person Actuals roll-up keys off each journal line's owner
-- (memberId) and a tax_payment classification. Posted journal lines carry neither
-- — member identity lived only in the account *name* (e.g. "Gross Wages - Mark"),
-- and no field distinguished PAYG/tax-payment accounts. The tax-report API now
-- derives both from the line's GL account, so the owner + tax-payment flag are set
-- once per account here.
--
-- Additive and safe: memberId is nullable (null = shared/joint); isTaxPayment
-- defaults false (existing accounts are unaffected until explicitly configured).

ALTER TABLE "FinanceCategory" ADD COLUMN "memberId"     TEXT;
ALTER TABLE "FinanceCategory" ADD COLUMN "isTaxPayment" BOOLEAN NOT NULL DEFAULT false;
