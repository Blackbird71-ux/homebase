-- Add glAccountId to FinanceTransaction
-- Records WHICH Chart-of-Accounts asset/liability GL category was debited or
-- credited when a bill is paid or income is received, replacing the flat
-- FinanceAccount bank-record selector in the bill/income pay dialogs.
--
-- Accounting flow (corrected):
--   Bill paid:       DR <expense category>   CR <glAccountId = asset GL e.g. "ANZ Cheque">
--   Income received: DR <glAccountId = asset GL>   CR <income category>
--
-- The legacy accountId (→ FinanceAccount) column is retained for backward
-- compatibility and for the Accounts page balance derivation where the user
-- has explicitly linked a bill/income stream to a bank account record.
-- glAccountId takes precedence in balance-sheet and P&L calculations when set.

ALTER TABLE "FinanceTransaction" ADD COLUMN "glAccountId" TEXT
    REFERENCES "FinanceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "FinanceTransaction_glAccountId_idx"
    ON "FinanceTransaction"("glAccountId");
