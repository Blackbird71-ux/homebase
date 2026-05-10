-- Add opening balance tx link to FinanceAccount (openingBalance + openingBalanceDate already added in partial run)
ALTER TABLE "FinanceAccount" ADD COLUMN "openingBalanceTxId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "FinanceAccount_openingBalanceTxId_key" ON "FinanceAccount"("openingBalanceTxId");

-- Add system opening balances category reference to Family
ALTER TABLE "Family" ADD COLUMN "openingBalancesCategoryId" TEXT;
