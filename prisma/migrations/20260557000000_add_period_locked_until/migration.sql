-- Add periodLockedUntil to Family for finance period locking feature
ALTER TABLE "Family" ADD COLUMN "periodLockedUntil" DATETIME;
