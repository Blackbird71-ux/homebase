-- Create FinanceBillPayment table for tracking partial payments on bills
CREATE TABLE "FinanceBillPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "billId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "paymentDate" DATETIME NOT NULL,
    "accountId" TEXT,
    "glAccountId" TEXT,
    "transactionId" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceBillPayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "FinanceRecurringBill"("id") ON DELETE CASCADE,
    CONSTRAINT "FinanceBillPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL,
    CONSTRAINT "FinanceBillPayment_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL,
    CONSTRAINT "FinanceBillPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinanceTransaction"("id") ON DELETE SET NULL,
    CONSTRAINT "FinanceBillPayment_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "FinanceBillPayment_transactionId_key" ON "FinanceBillPayment"("transactionId");
CREATE INDEX "FinanceBillPayment_billId_idx" ON "FinanceBillPayment"("billId");
CREATE INDEX "FinanceBillPayment_familyId_idx" ON "FinanceBillPayment"("familyId");
CREATE INDEX "FinanceBillPayment_paymentDate_idx" ON "FinanceBillPayment"("paymentDate" DESC);
