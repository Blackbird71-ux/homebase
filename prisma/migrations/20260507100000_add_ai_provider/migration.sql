-- AlterTable: add aiProvider column to User (geminiApiKey column kept, mapped to aiApiKey in Prisma)
ALTER TABLE "User" ADD COLUMN "aiProvider" TEXT DEFAULT 'gemini';
