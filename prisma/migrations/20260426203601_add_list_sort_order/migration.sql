-- CreateTable
CREATE TABLE "IngredientMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "ingredient" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IngredientMapping_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EventCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "familyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventCategory_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_EventCategory" ("color", "createdAt", "familyId", "id", "isSystem", "name", "sortOrder") SELECT "color", "createdAt", "familyId", "id", "isSystem", "name", "sortOrder" FROM "EventCategory";
DROP TABLE "EventCategory";
ALTER TABLE "new_EventCategory" RENAME TO "EventCategory";
CREATE INDEX "EventCategory_familyId_idx" ON "EventCategory"("familyId");
CREATE UNIQUE INDEX "EventCategory_familyId_name_key" ON "EventCategory"("familyId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "IngredientMapping_familyId_ingredient_key" ON "IngredientMapping"("familyId", "ingredient");
