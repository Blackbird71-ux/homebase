-- Pocket money: per-completion chore rewards + standalone ledger.
-- Deliberately NOT part of the finance module / GL — simple tracked balance only.
ALTER TABLE "Chore" ADD COLUMN "rewardAmount" REAL;

CREATE TABLE "PocketMoneyEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "familyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "choreCompletionId" TEXT,
    "wishlistItemId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PocketMoneyEntry_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PocketMoneyEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PocketMoneyEntry_choreCompletionId_fkey" FOREIGN KEY ("choreCompletionId") REFERENCES "ChoreCompletion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PocketMoneyEntry_wishlistItemId_fkey" FOREIGN KEY ("wishlistItemId") REFERENCES "WishlistItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PocketMoneyEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PocketMoneyEntry_choreCompletionId_key" ON "PocketMoneyEntry"("choreCompletionId");
CREATE INDEX "PocketMoneyEntry_familyId_idx" ON "PocketMoneyEntry"("familyId");
CREATE INDEX "PocketMoneyEntry_userId_createdAt_idx" ON "PocketMoneyEntry"("userId", "createdAt");
