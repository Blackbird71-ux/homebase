-- AddColumn: FinanceRecurringBill.showOnCalendar
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "showOnCalendar" BOOLEAN NOT NULL DEFAULT true;

-- AddColumn: FinanceIncomeEntry.showOnCalendar
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "showOnCalendar" BOOLEAN NOT NULL DEFAULT true;

-- AddColumn: FinanceRecurringTemplate.showOnCalendar
ALTER TABLE "FinanceRecurringTemplate" ADD COLUMN "showOnCalendar" BOOLEAN NOT NULL DEFAULT true;
