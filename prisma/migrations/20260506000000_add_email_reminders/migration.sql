-- AlterTable: Chore - email reminder fields
ALTER TABLE "Chore" ADD COLUMN "emailReminder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Chore" ADD COLUMN "emailReminderDays" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: Event - email reminder fields
ALTER TABLE "Event" ADD COLUMN "emailReminder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "emailReminderHours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "Event" ADD COLUMN "emailReminderEmails" TEXT;

-- AlterTable: Document - email reminder toggle
ALTER TABLE "Document" ADD COLUMN "emailReminder" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: EmailReminderLog (deduplication guard)
CREATE TABLE "EmailReminderLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "reminderKey" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailReminderLog_reminderKey_key" ON "EmailReminderLog"("reminderKey");
CREATE INDEX "EmailReminderLog_entityType_idx" ON "EmailReminderLog"("entityType");
