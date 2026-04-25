-- Create EventCategory model
CREATE TABLE "EventCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "familyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventCategory_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE
);

-- Create index for family lookups
CREATE INDEX "EventCategory_familyId_idx" ON "EventCategory"("familyId");

-- Unique constraint per family
CREATE UNIQUE INDEX "EventCategory_familyId_name_key" ON "EventCategory"("familyId", "name");
