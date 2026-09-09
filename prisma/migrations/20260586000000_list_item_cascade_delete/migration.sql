-- Deleting a list failed whenever it still had items: ListItem.listId was
-- ON DELETE RESTRICT, so prisma.list.delete() threw a FK error (500) and the
-- list silently stayed put. Items belong to their list, so the correct action
-- is CASCADE — this is the only change here; columns and indexes are recreated
-- exactly as they are today.
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
    "unitPrice" REAL,
    "quantity" INTEGER,
    "createdBy" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "listId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientMutationId" TEXT,
    CONSTRAINT "ListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ListItem" ("assignedToUserId", "category", "clientMutationId", "content", "createdAt", "createdBy", "dueDate", "id", "isCompleted", "isLocked", "listId", "quantity", "recipeId", "recipeName", "sortOrder", "unitPrice") SELECT "assignedToUserId", "category", "clientMutationId", "content", "createdAt", "createdBy", "dueDate", "id", "isCompleted", "isLocked", "listId", "quantity", "recipeId", "recipeName", "sortOrder", "unitPrice" FROM "ListItem";
DROP TABLE "ListItem";
ALTER TABLE "new_ListItem" RENAME TO "ListItem";
CREATE INDEX "ListItem_assignedToUserId_idx" ON "ListItem"("assignedToUserId");
CREATE UNIQUE INDEX "ListItem_clientMutationId_key" ON "ListItem"("clientMutationId");
CREATE INDEX "ListItem_listId_idx" ON "ListItem"("listId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
