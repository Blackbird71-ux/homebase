// Singleton cron scheduler — initialised once via instrumentation.ts

import cron from 'node-cron'
import { processAllReminders, processTimedChoreReminders, processHabitReminders } from '@/lib/reminders'
import { sendDailyBriefings } from '@/lib/daily-briefing'
import { keepGoogleTokensAlive } from '@/lib/google-sync'

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
    try {
      await processHabitReminders()
    } catch (err) {
      console.error('[scheduler] Habit reminder processing failed:', err)
    }
  })

  console.log(`[scheduler] Timed chore reminder cron scheduled: ${timedSchedule}`)

  // Daily briefing push digest — 7am local (container TZ). Dedup inside
  // sendDailyBriefings makes re-fires within the same local day harmless.
  const briefingSchedule = process.env.BRIEFING_CRON_SCHEDULE ?? '0 7 * * *'

  if (!cron.validate(briefingSchedule)) {
    console.warn(`[scheduler] Invalid BRIEFING_CRON_SCHEDULE "${briefingSchedule}", defaulting to "0 7 * * *"`)
  }

  cron.schedule(cron.validate(briefingSchedule) ? briefingSchedule : '0 7 * * *', async () => {
    try {
      await sendDailyBriefings()
    } catch (err) {
      console.error('[scheduler] Daily briefing failed:', err)
    }
  })

  console.log(`[scheduler] Daily briefing cron scheduled: ${briefingSchedule}`)

  // Google OAuth keep-alive — weekly refresh-token exchange so Google doesn't
  // flag the OAuth client as inactive (5 months) and delete it.
  if (process.env.GOOGLE_CLIENT_ID) {
    const googleSchedule = process.env.GOOGLE_KEEPALIVE_CRON_SCHEDULE ?? '0 3 * * 1'

    if (!cron.validate(googleSchedule)) {
      console.warn(`[scheduler] Invalid GOOGLE_KEEPALIVE_CRON_SCHEDULE "${googleSchedule}", defaulting to "0 3 * * 1"`)
    }

    cron.schedule(cron.validate(googleSchedule) ? googleSchedule : '0 3 * * 1', async () => {
      try {
        await keepGoogleTokensAlive()
      } catch (err) {
        console.error('[scheduler] Google token keep-alive failed:', err)
      }
    })

    console.log(`[scheduler] Google token keep-alive cron scheduled: ${googleSchedule}`)
  }
}
