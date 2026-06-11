-- SGC posts to the GL (reverses the F8 memo-only decision).
--
-- Employer super on a payslip now posts as a balanced pair appended to the
-- payslip receipt journal:
--   DR <sgcGlAccountId>        (accrued SGC asset, e.g. "Accrued SGC - Mark")
--   CR <sgcIncomeGlAccountId>  (SGC income, e.g. "Super Fund SGC - Mark")
-- The existing sgcGlAccountId field is the debit side (its UI picker already
-- filtered to asset/liability accounts); this adds the missing credit side.
--
-- Additive and safe: nullable on both tables; existing rows keep sgc as
-- memo-only until an income account is configured.

ALTER TABLE "FinancePayslip"          ADD COLUMN "sgcIncomeGlAccountId" TEXT;
ALTER TABLE "FinanceRecurringTemplate" ADD COLUMN "sgcIncomeGlAccountId" TEXT;
