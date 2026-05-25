-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "contactId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "notes" TEXT,
    "estimatedPrice" REAL,
    "occasion" TEXT,
    "isPurchased" BOOLEAN NOT NULL DEFAULT false,
    "purchasedById" TEXT,
    "suggestedById" TEXT,
    "purchasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WishlistItem_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WishlistItem_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "HouseholdContact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WishlistItem_purchasedById_fkey" FOREIGN KEY ("purchasedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WishlistItem_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WishlistItem_familyId_idx" ON "WishlistItem"("familyId");

-- CreateIndex
CREATE INDEX "WishlistItem_contactId_idx" ON "WishlistItem"("contactId");

-- CreateIndex
CREATE INDEX "WishlistItem_familyId_isPurchased_idx" ON "WishlistItem"("familyId", "isPurchased");
