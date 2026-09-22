-- Dashboard sticky note: one shared note per family (ownerKey = 'shared') plus one personal note per user (ownerKey = userId)
CREATE TABLE "StickyNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StickyNote_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StickyNote_familyId_ownerKey_key" ON "StickyNote"("familyId", "ownerKey");
