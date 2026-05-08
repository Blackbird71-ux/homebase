-- AlterTable: FinanceRecurringBill - add bill enhancement fields
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "billType" TEXT NOT NULL DEFAULT 'recurring';
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "recurrenceInterval" TEXT;
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "invoiceReceived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "invoiceReceivedDate" DATETIME;
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "paid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "paidDate" DATETIME;
CREATE INDEX IF NOT EXISTS "FinanceRecurringBill_familyId_paid_idx" ON "FinanceRecurringBill"("familyId", "paid");