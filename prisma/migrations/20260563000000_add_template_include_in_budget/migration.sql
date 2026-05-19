-- AddColumn: FinanceRecurringTemplate.includeInBudget
ALTER TABLE "FinanceRecurringTemplate" ADD COLUMN "includeInBudget" BOOLEAN NOT NULL DEFAULT true;
