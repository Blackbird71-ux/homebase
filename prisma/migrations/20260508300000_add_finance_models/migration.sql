-- CreateTable: FinanceAccount
CREATE TABLE "FinanceAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'checking',
    "institution" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "currentBalance" REAL NOT NULL DEFAULT 0,
    "creditLimit" REAL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "familyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinanceAccount_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "FinanceAccount_familyId_idx" ON "FinanceAccount"("familyId");
CREATE INDEX IF NOT EXISTS "FinanceAccount_familyId_isActive_idx" ON "FinanceAccount"("familyId", "isActive");

-- CreateTable: FinanceCategory
CREATE TABLE "FinanceCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'expense',
    "parentId" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "familyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinanceCategory_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE,
    CONSTRAINT "FinanceCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FinanceCategory" ("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "FinanceCategory_familyId_name_key" ON "FinanceCategory"("familyId", "name");
CREATE INDEX IF NOT EXISTS "FinanceCategory_familyId_idx" ON "FinanceCategory"("familyId");
CREATE INDEX IF NOT EXISTS "FinanceCategory_parentId_idx" ON "FinanceCategory"("parentId");

-- CreateTable: FinanceTransaction
CREATE TABLE "FinanceTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT,
    "categoryId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'expense',
    "amount" REAL NOT NULL,
    "payee" TEXT,
    "description" TEXT,
    "date" DATETIME NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringBillId" TEXT,
    "tags" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "isCleared" BOOLEAN NOT NULL DEFAULT false,
    "reconciledDate" DATETIME,
    "reference" TEXT,
    "receiptPath" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinanceTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount" ("id") ON DELETE SET NULL,
    CONSTRAINT "FinanceTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory" ("id") ON DELETE SET NULL,
    CONSTRAINT "FinanceTransaction_recurringBillId_fkey" FOREIGN KEY ("recurringBillId") REFERENCES "FinanceRecurringBill" ("id") ON DELETE SET NULL,
    CONSTRAINT "FinanceTransaction_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "FinanceTransaction_familyId_idx" ON "FinanceTransaction"("familyId");
CREATE INDEX IF NOT EXISTS "FinanceTransaction_familyId_date_idx" ON "FinanceTransaction"("familyId", "date" DESC);
CREATE INDEX IF NOT EXISTS "FinanceTransaction_accountId_idx" ON "FinanceTransaction"("accountId");
CREATE INDEX IF NOT EXISTS "FinanceTransaction_categoryId_idx" ON "FinanceTransaction"("categoryId");
CREATE INDEX IF NOT EXISTS "FinanceTransaction_familyId_isCleared_idx" ON "FinanceTransaction"("familyId", "isCleared");
CREATE INDEX IF NOT EXISTS "FinanceTransaction_familyId_isRecurring_idx" ON "FinanceTransaction"("familyId", "isRecurring");
CREATE INDEX IF NOT EXISTS "FinanceTransaction_familyId_type_idx" ON "FinanceTransaction"("familyId", "type");
CREATE INDEX IF NOT EXISTS "FinanceTransaction_recurringBillId_idx" ON "FinanceTransaction"("recurringBillId");

-- CreateTable: FinanceRecurringBill
CREATE TABLE "FinanceRecurringBill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "accountId" TEXT,
    "categoryId" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "dayOfMonth" INTEGER,
    "monthOfYear" INTEGER,
    "nextDueDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoPay" BOOLEAN NOT NULL DEFAULT false,
    "emailReminder" BOOLEAN NOT NULL DEFAULT false,
    "reminderDays" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    "familyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinanceRecurringBill_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount" ("id") ON DELETE SET NULL,
    CONSTRAINT "FinanceRecurringBill_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory" ("id") ON DELETE SET NULL,
    CONSTRAINT "FinanceRecurringBill_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "FinanceRecurringBill_familyId_idx" ON "FinanceRecurringBill"("familyId");
CREATE INDEX IF NOT EXISTS "FinanceRecurringBill_familyId_isActive_idx" ON "FinanceRecurringBill"("familyId", "isActive");
CREATE INDEX IF NOT EXISTS "FinanceRecurringBill_familyId_nextDueDate_idx" ON "FinanceRecurringBill"("familyId", "nextDueDate");

-- CreateTable: FinanceBudget
CREATE TABLE "FinanceBudget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "amount" REAL NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'monthly',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "rollover" BOOLEAN NOT NULL DEFAULT false,
    "alertThreshold" INTEGER NOT NULL DEFAULT 80,
    "emailAlert" BOOLEAN NOT NULL DEFAULT false,
    "familyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinanceBudget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinanceCategory" ("id") ON DELETE CASCADE,
    CONSTRAINT "FinanceBudget_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "FinanceBudget_familyId_idx" ON "FinanceBudget"("familyId");
CREATE INDEX IF NOT EXISTS "FinanceBudget_familyId_startDate_endDate_idx" ON "FinanceBudget"("familyId", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "FinanceBudget_categoryId_idx" ON "FinanceBudget"("categoryId");

-- CreateTable: FinanceSavingsGoal
CREATE TABLE "FinanceSavingsGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "targetAmount" REAL NOT NULL,
    "currentAmount" REAL NOT NULL DEFAULT 0,
    "targetDate" DATETIME,
    "accountId" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "familyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinanceSavingsGoal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount" ("id") ON DELETE SET NULL,
    CONSTRAINT "FinanceSavingsGoal_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "FinanceSavingsGoal_familyId_idx" ON "FinanceSavingsGoal"("familyId");
CREATE INDEX IF NOT EXISTS "FinanceSavingsGoal_familyId_isComplete_idx" ON "FinanceSavingsGoal"("familyId", "isComplete");