-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ListItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATETIME,
    "recipeId" TEXT,
    "recipeName" TEXT,
    "createdBy" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ListItem" ("category", "content", "createdAt", "createdBy", "dueDate", "id", "isCompleted", "listId", "recipeId", "recipeName", "sortOrder") SELECT "category", "content", "createdAt", "createdBy", "dueDate", "id", "isCompleted", "listId", "recipeId", "recipeName", "sortOrder" FROM "ListItem";
DROP TABLE "ListItem";
ALTER TABLE "new_ListItem" RENAME TO "ListItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
