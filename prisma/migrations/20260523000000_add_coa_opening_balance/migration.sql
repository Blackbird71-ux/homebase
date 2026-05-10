-- Add opening balance fields to FinanceCategory (Chart of Accounts)
-- These allow asset, liability, and equity accounts to record a starting balance.
-- Income and expense accounts typically have zero opening balance (they reset each year).

ALTER TABLE "FinanceCategory" ADD COLUMN "glCode"             TEXT;
ALTER TABLE "FinanceCategory" ADD COLUMN "openingBalance"     REAL;
ALTER TABLE "FinanceCategory" ADD COLUMN "openingBalanceDate" DATETIME;
