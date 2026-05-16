-- Add billDate (GL recognition date) to FinanceRecurringBill.
--
-- billDate = the occurrence date from the recurring template — the date the
-- liability is incurred (expense hits the P&L, entry appears in AP).
-- nextDueDate remains as the payment due date (occurrence + defaultDueOffsetDays).
--
-- Backfill: set billDate = nextDueDate for all existing rows. This is safe
-- because all templates in use had defaultDueOffsetDays = 0, so
-- nextDueDate == occurrenceDate for every existing draft/bill.

ALTER TABLE "FinanceRecurringBill" ADD COLUMN "billDate" DATETIME;

UPDATE "FinanceRecurringBill" SET "billDate" = "nextDueDate";
