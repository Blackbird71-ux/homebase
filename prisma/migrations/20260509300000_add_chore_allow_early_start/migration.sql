-- Add allowEarlyStart column to Chore table
-- When true, a new occurrence can be created (via complete) even if the last one is not yet due
ALTER TABLE "Chore" ADD COLUMN "allowEarlyStart" BOOLEAN NOT NULL DEFAULT false;
