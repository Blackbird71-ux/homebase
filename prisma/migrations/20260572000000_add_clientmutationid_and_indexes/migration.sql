-- AlterTable
ALTER TABLE "ListItem" ADD COLUMN "clientMutationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ListItem_clientMutationId_key" ON "ListItem"("clientMutationId");

-- CreateIndex
CREATE INDEX "ListItem_listId_idx" ON "ListItem"("listId");

-- CreateIndex
CREATE INDEX "Event_familyId_start_idx" ON "Event"("familyId", "start");

-- CreateIndex
CREATE INDEX "Event_seriesId_idx" ON "Event"("seriesId");

-- CreateIndex
CREATE INDEX "List_familyId_idx" ON "List"("familyId");

-- CreateIndex
CREATE INDEX "Recipe_familyId_idx" ON "Recipe"("familyId");

-- CreateIndex
CREATE INDEX "Note_familyId_idx" ON "Note"("familyId");
