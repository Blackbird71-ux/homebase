-- Habit email reminders: daily email to the owner (from reminderHour, local) if not yet ticked
ALTER TABLE "Habit" ADD COLUMN "emailReminder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Habit" ADD COLUMN "reminderHour" INTEGER NOT NULL DEFAULT 8;
