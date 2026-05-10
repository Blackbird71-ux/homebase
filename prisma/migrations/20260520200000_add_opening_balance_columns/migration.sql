-- Add openingBalance and openingBalanceDate columns to FinanceAccount
-- These were previously added in a "partial run" only on the dev database,
-- so they need a proper migration for production environments.

ALTER TABLE "FinanceAccount" ADD COLUMN "openingBalance" REAL;
ALTER TABLE "FinanceAccount" ADD COLUMN "openingBalanceDate" DATETIME;
