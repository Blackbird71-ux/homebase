-- Add invoiceTxId to FinanceRecurringBill
-- This links to the expense transaction created when invoice is received (DR expense / CR AP).
-- The existing transactionId links to the payment transaction (DR AP / CR bank).
-- Note: SQLite does not support UNIQUE on ALTER TABLE ADD COLUMN, so we add
-- the column then create a unique index separately.
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "invoiceTxId" TEXT;
CREATE UNIQUE INDEX "FinanceRecurringBill_invoiceTxId_key" ON "FinanceRecurringBill"("invoiceTxId");

-- Add invoiceTxId to FinanceIncomeEntry
-- This links to the income transaction created when remittance is received (DR AR / CR income).
-- The existing transactionId links to the receipt transaction (DR bank / CR AR).
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "invoiceTxId" TEXT;
CREATE UNIQUE INDEX "FinanceIncomeEntry_invoiceTxId_key" ON "FinanceIncomeEntry"("invoiceTxId");
