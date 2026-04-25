ALTER TABLE "Event" ADD COLUMN "recurrenceRule" TEXT;
ALTER TABLE "Event" ADD COLUMN "recurrenceEndDate" DATETIME;
ALTER TABLE "Event" ADD COLUMN "recurrenceExceptions" TEXT;
ALTER TABLE "Event" ADD COLUMN "seriesId" TEXT;
ALTER TABLE "Event" ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false;
