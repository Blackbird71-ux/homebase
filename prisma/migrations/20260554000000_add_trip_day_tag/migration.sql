-- ─────────────────────────────────────────────────────────────────────────────
-- Trip Day Tags: join table linking TripDay to TripTag
-- Allows tags (wifi, fuel, dump point, etc.) to be applied at the day level
-- in addition to the existing activity-level tagging.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "TripDayTag" (
    "dayId"     TEXT     NOT NULL,
    "tagId"     TEXT     NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("dayId", "tagId"),
    CONSTRAINT "TripDayTag_dayId_fkey"
        FOREIGN KEY ("dayId") REFERENCES "TripDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripDayTag_tagId_fkey"
        FOREIGN KEY ("tagId") REFERENCES "TripTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TripDayTag_dayId_idx" ON "TripDayTag"("dayId");
CREATE INDEX "TripDayTag_tagId_idx" ON "TripDayTag"("tagId");
