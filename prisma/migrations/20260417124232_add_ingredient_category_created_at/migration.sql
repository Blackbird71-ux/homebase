-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_IngredientCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IngredientCategory_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_IngredientCategory" ("category", "familyId", "id", "key", "updatedAt") SELECT "category", "familyId", "id", "key", "updatedAt" FROM "IngredientCategory";
DROP TABLE "IngredientCategory";
ALTER TABLE "new_IngredientCategory" RENAME TO "IngredientCategory";
CREATE UNIQUE INDEX "IngredientCategory_familyId_key_key" ON "IngredientCategory"("familyId", "key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
