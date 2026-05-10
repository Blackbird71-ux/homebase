-- Fix opening balance transaction amounts to store the signed value directly.
--
-- Previously, setOpeningBalance() called Math.abs(amount) before storing the
-- transaction, so liability accounts (negative openingBalance) had their
-- opening_balance transaction stored as a positive number. This caused
-- deriveAccountBalance() to show credit cards and loans as having a positive
-- balance instead of the correct negative balance.
--
-- This migration corrects any existing opening_balance transactions where the
-- account has a negative openingBalance but the transaction amount is positive.
--
-- Safe to run multiple times: the WHERE clause only matches rows that are
-- still incorrect (account.openingBalance < 0 AND tx.amount > 0).

UPDATE "FinanceTransaction"
SET "amount" = (
  SELECT "openingBalance"
  FROM "FinanceAccount"
  WHERE "FinanceAccount"."openingBalanceTxId" = "FinanceTransaction"."id"
)
WHERE
  "type" = 'opening_balance'
  AND EXISTS (
    SELECT 1
    FROM "FinanceAccount"
    WHERE "FinanceAccount"."openingBalanceTxId" = "FinanceTransaction"."id"
      AND "FinanceAccount"."openingBalance" IS NOT NULL
      AND "FinanceAccount"."openingBalance" < 0
      AND "FinanceTransaction"."amount" > 0
  );
