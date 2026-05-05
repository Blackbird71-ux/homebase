-- Add pinHash field to Note, HouseholdContact, and Document for secure PIN protection
ALTER TABLE "Note" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "HouseholdContact" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "Document" ADD COLUMN "pinHash" TEXT;
