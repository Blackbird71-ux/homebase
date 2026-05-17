-- ─────────────────────────────────────────────────────────────────────────────
-- Trip Tags: family-scoped emoji tags for trips (wifi, fuel, dump point, etc.)
-- Separate from the existing recipe Tag system.
-- ─────────────────────────────────────────────────────────────────────────────

-- Trip-level tag definitions (per family)
CREATE TABLE "TripTag" (
    "id"        TEXT     NOT NULL PRIMARY KEY,
    "familyId"  TEXT     NOT NULL,
    "name"      TEXT     NOT NULL,
    "emoji"     TEXT,
    "color"     TEXT,
    "sortOrder" INTEGER  NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripTag_familyId_fkey"
        FOREIGN KEY ("familyId") REFERENCES "Family" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TripTag_familyId_idx" ON "TripTag"("familyId");
CREATE UNIQUE INDEX "TripTag_familyId_name_key" ON "TripTag"("familyId", "name");

-- Join: which tags are on which activities
CREATE TABLE "TripActivityTag" (
    "activityId" TEXT NOT NULL,
    "tagId"      TEXT NOT NULL,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("activityId", "tagId"),
    CONSTRAINT "TripActivityTag_activityId_fkey"
        FOREIGN KEY ("activityId") REFERENCES "TripActivity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripActivityTag_tagId_fkey"
        FOREIGN KEY ("tagId") REFERENCES "TripTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TripActivityTag_activityId_idx" ON "TripActivityTag"("activityId");
CREATE INDEX "TripActivityTag_tagId_idx"      ON "TripActivityTag"("tagId");

-- Multiple packing lists per trip: replace the single packingListId FK
-- with a join table so a trip can have Mark / Michelle / Shared lists.
CREATE TABLE "TripPackingList" (
    "id"        TEXT     NOT NULL PRIMARY KEY,
    "tripId"    TEXT     NOT NULL,
    "listId"    TEXT     NOT NULL,
    "label"     TEXT,                   -- "Mark", "Michelle", "Shared", etc.
    "sortOrder" INTEGER  NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripPackingList_tripId_fkey"
        FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripPackingList_listId_fkey"
        FOREIGN KEY ("listId") REFERENCES "List" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TripPackingList_tripId_idx" ON "TripPackingList"("tripId");
CREATE UNIQUE INDEX "TripPackingList_tripId_listId_key" ON "TripPackingList"("tripId", "listId");

-- Migrate any existing single packing lists into the new join table
-- so no data is lost when we drop the old column.
INSERT INTO "TripPackingList" ("id", "tripId", "listId", "label", "sortOrder", "createdAt")
SELECT
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    lower(substr(hex(randomblob(2)),2)) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(6))),   -- cuid-ish id
    "id",
    "packingListId",
    'Packing List',
    0,
    CURRENT_TIMESTAMP
FROM "Trip"
WHERE "packingListId" IS NOT NULL;
