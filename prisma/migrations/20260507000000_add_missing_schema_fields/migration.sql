-- AlterTable: add missing geminiApiKey and aiModel columns to User table
-- These were added to schema.prisma without a corresponding migration
ALTER TABLE "User" ADD COLUMN "geminiApiKey" TEXT;
ALTER TABLE "User" ADD COLUMN "aiModel" TEXT DEFAULT 'gemini-2.0-flash';
