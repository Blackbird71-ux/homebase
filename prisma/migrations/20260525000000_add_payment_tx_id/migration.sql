-- Add paymentTxId to FinanceRecurringBill
-- This is the SECOND leg of the AP double-entry:
--   invoiceTxId  → DR expense / notation only (created when invoice received)
--   paymentTxId  → DR Accounts Payable / CR bank account (created when bill paid)
-- The existing transactionId is kept for backwards compatibility and points to
-- whichever transaction was created (payment tx when both legs exist, otherwise
-- the invoice tx). paymentTxId is the authoritative payment-leg record.
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "paymentTxId" TEXT;
CREATE UNIQUE INDEX "FinanceRecurringBill_paymentTxId_key" ON "FinanceRecurringBill"("paymentTxId");

-- Add receiptTxId to FinanceIncomeEntry
-- This is the SECOND leg of the AR double-entry:
--   invoiceTxId  → DR Accounts Receivable / CR income account (created when remittance received)
--   receiptTxId  → DR bank account / CR Accounts Receivable (created when cash received)
-- The existing transactionId points to whichever transaction was created first.
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "receiptTxId" TEXT;
CREATE UNIQUE INDEX "FinanceIncomeEntry_receiptTxId_key" ON "FinanceIncomeEntry"("receiptTxId");
