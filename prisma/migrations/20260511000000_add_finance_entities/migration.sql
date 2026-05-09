-- ============================================================
-- Migration: add_finance_entities
-- 1. FinanceEntity table – named entities (Personal, Super, etc.)
-- 2. entityId on FinanceBudget (budget rules scoped to an entity)
-- 3. entityId on FinanceRecurringBill (bills assigned to an entity)
-- ============================================================

-- 1. Entity table
CREATE TABLE "FinanceEntity" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "name"        TEXT NOT NULL,
    "type"        TEXT NOT NULL DEFAULT 'personal',  -- personal | superfund | trust | business | investment | other
    "description" TEXT,
    "color"       TEXT,
    "icon"        TEXT,
    "isDefault"   INTEGER NOT NULL DEFAULT 0,         -- 1 = the "Personal/Family" entity shown by default
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "isActive"    INTEGER NOT NULL DEFAULT 1,
    "familyId"    TEXT NOT NULL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceEntity_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinanceEntity_familyId_name_key" ON "FinanceEntity"("familyId", "name");
CREATE INDEX "FinanceEntity_familyId_idx"            ON "FinanceEntity"("familyId");
CREATE INDEX "FinanceEntity_familyId_isActive_idx"   ON "FinanceEntity"("familyId", "isActive");

-- 2. entityId on FinanceBudget
ALTER TABLE "FinanceBudget" ADD COLUMN "entityId" TEXT REFERENCES "FinanceEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "FinanceBudget_entityId_idx" ON "FinanceBudget"("entityId");

-- 3. entityId on FinanceRecurringBill
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "entityId" TEXT REFERENCES "FinanceEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "FinanceRecurringBill_entityId_idx" ON "FinanceRecurringBill"("entityId");
