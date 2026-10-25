-- Family-wide catalogue of todo/packing list categories (separate from shopping IngredientCategory)
CREATE TABLE "ListCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "familyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListCategory_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ListCategory_familyId_name_key" ON "ListCategory"("familyId", "name");
CREATE INDEX "ListCategory_familyId_idx" ON "ListCategory"("familyId");
