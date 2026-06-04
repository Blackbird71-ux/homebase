// Singleton cron scheduler — initialised once via instrumentation.ts

import cron from 'node-cron'
import { processAllReminders, processTimedChoreReminders } from '@/lib/reminders'

declare global {
  // eslint-disable-next-line no-var
  var __reminderSchedulerInitialized: boolean | undefined
}

export function initScheduler(): void {
  if (global.__reminderSchedulerInitialized) return
  global.__reminderSchedulerInitialized = true

  const schedule = process.env.REMINDER_CRON_SCHEDULE ?? '0 8 * * *'

  if (!cron.validate(schedule)) {
    console.warn(`[scheduler] Invalid REMINDER_CRON_SCHEDULE "${schedule}", defaulting to "0 8 * * *"`)
  }

  cron.schedule(cron.validate(schedule) ? schedule : '0 8 * * *', async () => {
    try {
      await processAllReminders()
    } catch (err) {
      console.error('[scheduler] Reminder processing failed:', err)
    }
  })

  console.log(`[scheduler] Reminder cron scheduled: ${schedule}`)

  // Timed chores (those with a due time) need an hourly check so the
  // "X hours before" reminder can land in its 1-hour window. Kept separate
  // from the daily job above so its blast radius stays isolated.
  const timedSchedule = process.env.TIMED_REMINDER_CRON_SCHEDULE ?? '0 * * * *'

  if (!cron.validate(timedSchedule)) {
    console.warn(`[scheduler] Invalid TIMED_REMINDER_CRON_SCHEDULE "${timedSchedule}", defaulting to "0 * * * *"`)
  }

  cron.schedule(cron.validate(timedSchedule) ? timedSchedule : '0 * * * *', async () => {
    try {
      await processTimedChoreReminders()
    } catch (err) {
      console.error('[scheduler] Timed chore reminder processing failed:', err)
    }
  })

  console.log(`[scheduler] Timed chore reminder cron scheduled: ${timedSchedule}`)
}
