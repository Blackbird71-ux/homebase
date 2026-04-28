-- Create HouseholdContact model for family address book
CREATE TABLE IF NOT EXISTS "HouseholdContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',  -- doctor | school | tradesperson | emergency | other
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "familyId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HouseholdContact_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "HouseholdContact_familyId_idx" ON "HouseholdContact"("familyId");
CREATE INDEX IF NOT EXISTS "HouseholdContact_category_idx" ON "HouseholdContact"("category");
