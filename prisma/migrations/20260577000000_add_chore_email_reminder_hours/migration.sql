-- Hours-based reminder lead time for chores that carry a due time (startTime).
--
-- Chore reminders were day-based only (emailReminderDays). Chores with a due
-- time now mirror the calendar's hours-before reminder: processTimedChoreReminders
-- fires emailReminderHours before the due instant. emailReminderDays is retained
-- for the untimed path (startTime IS NULL).
--
-- Additive and safe: NOT NULL DEFAULT 24, and existing rows have startTime = NULL
-- so none switch to the timed reminder path until a due time is set.

ALTER TABLE "Chore" ADD COLUMN "emailReminderHours" INTEGER NOT NULL DEFAULT 24;
