-- Create Trip model
CREATE TABLE "Trip" (
    "id"             TEXT     NOT NULL PRIMARY KEY,
    "title"          TEXT     NOT NULL,
    "destination"    TEXT     NOT NULL,
    "startDate"      DATETIME NOT NULL,
    "endDate"        DATETIME NOT NULL,
    "accommodation"  TEXT,
    "transport"      TEXT,
    "notes"          TEXT,
    "status"         TEXT     NOT NULL DEFAULT 'planning',
    "color"          TEXT,
    "icon"           TEXT,
    "packingListId"  TEXT     UNIQUE,
    "createdBy"      TEXT     NOT NULL,
    "familyId"       TEXT     NOT NULL,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Trip_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Trip_packingListId_fkey" FOREIGN KEY ("packingListId") REFERENCES "List" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Trip_familyId_idx" ON "Trip"("familyId");
CREATE INDEX "Trip_familyId_startDate_idx" ON "Trip"("familyId", "startDate");
