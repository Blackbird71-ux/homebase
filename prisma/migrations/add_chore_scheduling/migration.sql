-- Add scheduling fields to Chore model
ALTER TABLE "Chore" ADD COLUMN "startDate" DATETIME;
ALTER TABLE "Chore" ADD COLUMN "endDate" DATETIME;
ALTER TABLE "Chore" ADD COLUMN "nextDueDate" DATETIME;
ALTER TABLE "Chore" ADD COLUMN "triggerOnComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Chore" ADD COLUMN "autoRotateOnComplete" BOOLEAN NOT NULL DEFAULT false;
