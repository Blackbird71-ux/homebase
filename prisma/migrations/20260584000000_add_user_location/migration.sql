-- Opt-in GPS location sharing between family members
ALTER TABLE "User" ADD COLUMN "shareLocation" BOOLEAN NOT NULL DEFAULT false;

-- One last-known location row per user (foreground updates only; web has no background GPS)
CREATE TABLE "UserLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "accuracy" REAL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserLocation_userId_key" ON "UserLocation"("userId");
CREATE INDEX "UserLocation_familyId_idx" ON "UserLocation"("familyId");
