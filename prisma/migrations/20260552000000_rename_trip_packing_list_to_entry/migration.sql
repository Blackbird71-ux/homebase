-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260552000000_rename_trip_packing_list_to_entry
--
-- Fix: Migration 20260551000000_add_trip_tags created the join table as
-- "TripPackingList" but the Prisma schema defines the model as
-- TripPackingEntry (no @@map), so Prisma generates queries against
-- "TripPackingEntry". This mismatch causes a hard SSR crash on /trips/[id].
--
-- SQLite does not support ALTER TABLE RENAME TO with FK references in the
-- same way as Postgres, but it DOES support it directly. We also need to
-- recreate the indexes under their new names.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Rename the table
ALTER TABLE "TripPackingList" RENAME TO "TripPackingEntry";

-- Step 2: Recreate indexes with correct names matching Prisma expectations
-- (SQLite keeps old index names after a rename — drop and recreate them)
DROP INDEX IF EXISTS "TripPackingList_tripId_idx";
DROP INDEX IF EXISTS "TripPackingList_tripId_listId_key";

CREATE INDEX "TripPackingEntry_tripId_idx" ON "TripPackingEntry"("tripId");
CREATE UNIQUE INDEX "TripPackingEntry_tripId_listId_key" ON "TripPackingEntry"("tripId", "listId");
