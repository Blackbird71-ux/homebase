-- ─────────────────────────────────────────────────────────────────────────────
-- Consolidate Trip Tags into the unified Tag model
--
-- Before: TripTag (separate table) + TripActivityTag + TripDayTag join tables
-- After:  Tag.scope = 'trip' + Tag.emoji + Tag.sortOrder
--         ActivityTag join table (TripActivity → Tag)
--         DayTag join table (TripDay → Tag)
--
-- Migration steps:
--   1. Add emoji + sortOrder columns to Tag
--   2. Migrate existing TripTag rows into Tag (scope='trip')
--   3. Create new ActivityTag join table and migrate TripActivityTag rows
--   4. Create new DayTag join table and migrate TripDayTag rows
--   5. Drop old TripActivityTag, TripDayTag, TripTag tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Extend Tag table with emoji and sortOrder
ALTER TABLE "Tag" ADD COLUMN "emoji"     TEXT;
ALTER TABLE "Tag" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Step 2: Migrate TripTag rows → Tag (scope='trip')
-- We use INSERT OR IGNORE to handle any name collisions gracefully.
INSERT OR IGNORE INTO "Tag" ("id", "name", "color", "emoji", "scope", "sortOrder", "familyId", "createdAt")
SELECT "id", "name", "color", "emoji", 'trip', "sortOrder", "familyId", "createdAt"
FROM "TripTag";

-- Step 3: New ActivityTag join table (TripActivity → Tag)
CREATE TABLE "ActivityTag" (
    "activityId" TEXT     NOT NULL,
    "tagId"      TEXT     NOT NULL,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("activityId", "tagId"),
    CONSTRAINT "ActivityTag_activityId_fkey"
        FOREIGN KEY ("activityId") REFERENCES "TripActivity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityTag_tagId_fkey"
        FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ActivityTag_activityId_idx" ON "ActivityTag"("activityId");
CREATE INDEX "ActivityTag_tagId_idx"      ON "ActivityTag"("tagId");

-- Migrate TripActivityTag rows to ActivityTag
-- tagId is the same (TripTag.id was copied to Tag.id above)
INSERT OR IGNORE INTO "ActivityTag" ("activityId", "tagId", "createdAt")
SELECT "activityId", "tagId", "createdAt"
FROM "TripActivityTag";

-- Step 4: New DayTag join table (TripDay → Tag)
CREATE TABLE "DayTag" (
    "dayId"     TEXT     NOT NULL,
    "tagId"     TEXT     NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("dayId", "tagId"),
    CONSTRAINT "DayTag_dayId_fkey"
        FOREIGN KEY ("dayId") REFERENCES "TripDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DayTag_tagId_fkey"
        FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DayTag_dayId_idx" ON "DayTag"("dayId");
CREATE INDEX "DayTag_tagId_idx" ON "DayTag"("tagId");

-- Migrate TripDayTag rows to DayTag
INSERT OR IGNORE INTO "DayTag" ("dayId", "tagId", "createdAt")
SELECT "dayId", "tagId", "createdAt"
FROM "TripDayTag";

-- Step 5: Drop old tables (cascade handles any remaining FK references)
DROP TABLE IF EXISTS "TripDayTag";
DROP TABLE IF EXISTS "TripActivityTag";
DROP TABLE IF EXISTS "TripTag";
