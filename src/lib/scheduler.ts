// Singleton cron scheduler — initialised once via instrumentation.ts

import cron from 'node-cron'
import { processAllReminders } from '@/lib/reminders'

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
}
