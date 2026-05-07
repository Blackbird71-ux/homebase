-- AlterTable
ALTER TABLE "Chore" ADD COLUMN "note" TEXT;

-- AlterTable
ALTER TABLE "ListItem" ADD COLUMN "assignedToUserId" TEXT;
CREATE INDEX IF NOT EXISTS "ListItem_assignedToUserId_idx" ON "ListItem"("assignedToUserId");
