-- AlterTable: add isPrivate column to Note
-- SQLite does not support ALTER COLUMN, so we ADD with a default
ALTER TABLE "Note" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
