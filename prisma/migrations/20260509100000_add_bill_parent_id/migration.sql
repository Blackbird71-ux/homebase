-- AlterTable: FinanceRecurringBill - add parentBillId for recurring-bill occurrence tracking
-- When a recurring bill is paid a new occurrence is spawned; the child stores the paid bill's id.
-- This allows "undo payment" to cleanly delete the orphaned future occurrence.
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "parentBillId" TEXT;

-- FK constraint (self-referential, nullable, SetNull on delete so child survives if parent is deleted)
-- SQLite does not enforce FK constraints unless PRAGMA foreign_keys = ON, but we add them for Prisma compatibility.
-- No separate ALTER COLUMN ADD CONSTRAINT syntax in SQLite; FK is implicit via Prisma.

CREATE INDEX IF NOT EXISTS "FinanceRecurringBill_parentBillId_idx" ON "FinanceRecurringBill"("parentBillId");
