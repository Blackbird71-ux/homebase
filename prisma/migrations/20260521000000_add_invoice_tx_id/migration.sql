-- Add invoiceTxId to FinanceRecurringBill
-- This links to the expense transaction created when invoice is received (DR expense / CR AP).
-- The existing transactionId links to the payment transaction (DR AP / CR bank).
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "invoiceTxId" TEXT UNIQUE;

-- Add invoiceTxId to FinanceIncomeEntry
-- This links to the income transaction created when remittance is received (DR AR / CR income).
-- The existing transactionId links to the receipt transaction (DR bank / CR AR).
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "invoiceTxId" TEXT UNIQUE;
