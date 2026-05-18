-- Create BudgetPlannerItem table for the Simple Budget Planner feature
CREATE TABLE "BudgetPlannerItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL CHECK("type" IN ('income', 'expense')),
    "category" TEXT NOT NULL,
    "subcategory" TEXT NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    "frequency" TEXT NOT NULL DEFAULT 'monthly' CHECK("frequency" IN ('weekly', 'fortnightly', 'monthly', 'yearly')),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "BudgetPlannerItem_userId_type_idx" ON "BudgetPlannerItem"("userId", "type");
CREATE INDEX "BudgetPlannerItem_userId_idx" ON "BudgetPlannerItem"("userId");
