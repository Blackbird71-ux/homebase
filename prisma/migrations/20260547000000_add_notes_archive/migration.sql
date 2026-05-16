-- AlterTable: Add isArchived column to Note
ALTER TABLE "Note" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
