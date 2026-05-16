/**
 * chore-helpers.ts — Single source of truth for all chore date/schedule logic.
 *
 * WHY THIS FILE EXISTS:
 * Date calculation for chores was previously duplicated inline across four
 * different files (route.ts, [id]/route.ts, [id]/complete/route.ts, home/page.tsx).
 * Each copy drifted independently, causing bugs where a fix in one place didn't
 * apply to the others. All logic now lives here; routes and pages import and call
 * these functions — they contain no inline date logic of their own.
 *
 * EXPORTS:
 *   frequencyToMonths           — maps a frequency string to the number of months to advance
 *   calculateInitialDueDate     — used when creating a new chore (POST /api/chores)
 *   calculateNextDueDate        — used after completing a chore (POST /api/chores/[id]/complete)
 *   calculateNextDueDateFromNow — used when editing schedule fields (PATCH /api/chores/[id])
 *   buildChoreSchedule          — groups a list of chores into a day-by-day schedule array
 *   choreIsCompletable          — single rule for whether a chore can be ticked off right now
 */

import { utcMidnightToLocalMidnight } from '@/lib/timezone'
import type { ChoreScheduleDay, ChoreScheduleItem } from '@/types'

// ─── Shared types ─────────────────────────────────────────────────────────────

export type ChoreForSchedule = {
  frequency: string
  dayOfWeek: number | null
  dayOfMonth: number | null
  triggerOnComplete: boolean
  allowEarlyStart: boolean
  endDate: Date | null
  nextDueDate: Date | null
}

// ─── Frequency → months map ───────────────────────────────────────────────────

/**
 * Returns the number of calendar months that correspond to the given frequency.
 * Returns 0 for non-month-based frequencies (daily, weekly, biweekly).
 */
export function frequencyToMonths(frequency: string): number {
  switch (frequency) {
    case 'monthly':    return 1
    case 'bimonthly':  return 2
    case 'quarterly':  return 3
    case 'halfyearly': return 6
    case 'yearly':     return 12
    default:           return 0
  }
}

// ─── Core: advance a UTC-midnight base date by one frequency interval ─────────

/**
 * Advance `base` (a Date at UTC midnight) by exactly one frequency interval,
 * honouring dayOfWeek / dayOfMonth pin where set.
 *
 * Returns a Date still at UTC midnight — call utcMidnightToLocalMidnight on
 * the result before storing to the DB.
 */
function advanceByFrequency(
  base: Date,
  frequency: string,
  dayOfWeek: number | null,
  dayOfMonth: number | null
): Date {
  const next = new Date(base)
  next.setUTCHours(0, 0, 0, 0)

  switch (frequency) {
    case 'daily': {
      next.setUTCDate(next.getUTCDate() + 1)
      break
    }
    case 'weekly': {
      if (dayOfWeek !== null) {
        const currentDay = next.getUTCDay()
        let daysUntil = dayOfWeek - currentDay
        if (daysUntil <= 0) daysUntil += 7
        next.setUTCDate(next.getUTCDate() + daysUntil)
      } else {
        next.setUTCDate(next.getUTCDate() + 7)
      }
      break
    }
    case 'biweekly': {
      next.setUTCDate(next.getUTCDate() + 14)
      break
    }
    default: {
      // monthly / bimonthly / quarterly / halfyearly / yearly
      const months = frequencyToMonths(frequency)
      if (months > 0) {
        next.setUTCMonth(next.getUTCMonth() + months)
        if (dayOfMonth !== null) {
          const lastDay = new Date(
            Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
          ).getUTCDate()
          next.setUTCDate(Math.min(dayOfMonth, lastDay))
        }
      } else {
        // Unknown frequency — fall back to weekly so chores don't vanish
        next.setUTCDate(next.getUTCDate() + 7)
      }
    }
  }

  return next
}

// ─── calculateInitialDueDate ──────────────────────────────────────────────────

/**
 * Calculate the first nextDueDate when a chore is created.
 *
 * Uses `startDate` (or today) as the base and pins to the specified
 * dayOfWeek / dayOfMonth where applicable.
 *
 * For weekly chores: if the start date IS the target day, that same day
 * is returned (daysUntil >= 0 allows same-day, unlike the post-completion
 * calculation which uses > 0).
 *
 * Returns the UTC Date representing midnight in the user's local timezone.
 */
export function calculateInitialDueDate(
  frequency: string,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  startDate: Date | null,
  timezone: string
): Date {
  // Convert start date (or now) to UTC midnight of the same LOCAL calendar day.
  const rawBase = startDate ? new Date(startDate) : new Date()
  const baseDateLocalStr = rawBase.toLocaleDateString('en-CA', { timeZone: timezone })
  const base = new Date(`${baseDateLocalStr}T00:00:00Z`)

  let result: Date

  switch (frequency) {
    case 'daily':
    case 'biweekly': {
      result = base
      break
    }
    case 'weekly': {
      if (dayOfWeek !== null) {
        const currentDay = base.getUTCDay()
        let daysUntil = dayOfWeek - currentDay
        // Allow same-day (daysUntil === 0 is fine for initial creation)
        if (daysUntil < 0) daysUntil += 7
        const next = new Date(base)
        next.setUTCDate(base.getUTCDate() + daysUntil)
        result = next
      } else {
        result = base
      }
      break
    }
    default: {
      // monthly / bimonthly / quarterly / halfyearly / yearly
      const months = frequencyToMonths(frequency)
      if (months > 0 && dayOfMonth !== null) {
        const lastDay = new Date(
          Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)
        ).getUTCDate()
        const targetDay = Math.min(dayOfMonth, lastDay)
        if (base.getUTCDate() > targetDay) {
          // Target day already passed this month — move to next period
          base.setUTCMonth(base.getUTCMonth() + 1)
          const nextLastDay = new Date(
            Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)
          ).getUTCDate()
          base.setUTCDate(Math.min(dayOfMonth, nextLastDay))
        } else {
          base.setUTCDate(targetDay)
        }
      }
      result = base
      break
    }
  }

  return utcMidnightToLocalMidnight(result, timezone)
}

// ─── calculateNextDueDate ─────────────────────────────────────────────────────

/**
 * Calculate the next due date after a chore is **completed**.
 *
 * Base-date selection rule (the golden rule — must never drift):
 *   • triggerOnComplete=true  → base from completedAt  (user wants schedule to float)
 *   • otherwise               → base from nextDueDate   (schedule stays anchored)
 *
 * This means completing a monthly chore 4 days late still schedules the next
 * occurrence 1 month from the original due date, not 1 month from today.
 * Same for halfyearly: completing in month 4 still schedules month 7, not month 10.
 *
 * Returns null if the next occurrence would exceed endDate (caller should
 * deactivate the chore).
 * Returns the UTC Date representing midnight in the user's local timezone.
 */
export function calculateNextDueDate(
  chore: ChoreForSchedule,
  completedAt: Date,
  timezone: string
): Date | null {
  // Anchor: advance from the scheduled due date, not from "now"
  let baseDate: Date
  if (chore.triggerOnComplete) {
    baseDate = completedAt
  } else if (chore.nextDueDate) {
    baseDate = chore.nextDueDate
  } else {
    baseDate = completedAt
  }

  // baseDate may be a local-midnight timestamp (e.g. 2026-05-16T14:00:00Z for UTC+10)
  // or an arbitrary completedAt time. Convert to UTC midnight of the same LOCAL calendar
  // day before passing to advanceByFrequency, which performs UTC-based date arithmetic.
  const baseDateLocalStr = baseDate.toLocaleDateString('en-CA', { timeZone: timezone })
  const baseDateUTCMidnight = new Date(`${baseDateLocalStr}T00:00:00Z`)

  const next = advanceByFrequency(baseDateUTCMidnight, chore.frequency, chore.dayOfWeek, chore.dayOfMonth)

  if (chore.endDate && next > chore.endDate) {
    return null // signal caller to deactivate
  }

  return utcMidnightToLocalMidnight(next, timezone)
}

// ─── calculateNextDueDateFromNow ──────────────────────────────────────────────

/**
 * Calculate a new next due date when a chore's **schedule fields are edited**
 * (frequency / dayOfWeek / dayOfMonth changed via PATCH).
 *
 * Unlike calculateNextDueDate, this intentionally bases off "now" — the user
 * changed the schedule so the old anchor is no longer meaningful.
 *
 * Returns null → next occurrence exceeds endDate; caller should deactivate.
 * Returns Date → new nextDueDate to store.
 */
export function calculateNextDueDateFromNow(
  chore: ChoreForSchedule,
  timezone: string
): Date | null {
  // Use UTC midnight of the LOCAL calendar today, not UTC midnight of the UTC date.
  const todayLocalStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  const baseDateUTCMidnight = new Date(`${todayLocalStr}T00:00:00Z`)

  const next = advanceByFrequency(baseDateUTCMidnight, chore.frequency, chore.dayOfWeek, chore.dayOfMonth)

  if (chore.endDate && next > chore.endDate) {
    return null
  }

  return utcMidnightToLocalMidnight(next, timezone)
}

// ─── choreIsCompletable ───────────────────────────────────────────────────────

/**
 * Single rule for whether a chore can be ticked off by the user right now.
 *
 *   • Overdue chores (nextDueDate < todayStart)    → always completable
 *   • Due today (nextDueDate within today's window) → always completable
 *   • Future chores                                 → only if allowEarlyStart=true
 *
 * "todayEnd" is the UTC Date representing the end of today in the user's
 * timezone (i.e. todayStart + 24 h), as returned by todayBoundsInTz().
 */
export function choreIsCompletable(
  nextDueDate: Date | null,
  allowEarlyStart: boolean,
  todayEnd: Date
): boolean {
  if (!nextDueDate) return true           // null = due now
  if (nextDueDate <= todayEnd) return true // overdue or due today
  return allowEarlyStart                   // future: only if flag set
}

// ─── buildChoreSchedule ───────────────────────────────────────────────────────

type RawChore = {
  id: string
  title: string
  frequency: string
  note: string | null
  nextDueDate: Date | null
  allowEarlyStart: boolean
  currentAssignee: { id: string; name: string } | null
  completions: Array<{
    completedAt: Date
    completedBy: { id: string; name: string } | null
  }>
}

/**
 * Groups a flat list of chore DB records into a ChoreScheduleDay[] array
 * suitable for the dashboard and schedule API responses.
 *
 * The first element of the array will be an "Overdue" pseudo-day if any
 * chores are past due. Following elements cover `days` calendar days
 * starting from today.
 *
 * This is the single place where the schedule shape is constructed —
 * both home/page.tsx and schedule/route.ts import and call this.
 */
export function buildChoreSchedule(
  chores: RawChore[],
  todayStart: Date,
  todayEnd: Date,
  timezone: string,
  days: number = 30
): ChoreScheduleDay[] {
  if (!chores?.length) return []

  const schedule: ChoreScheduleDay[] = []

  // ── Overdue section ───────────────────────────────────────────────────────
  const overdueChores = chores.filter(
    (c) => c.nextDueDate && c.nextDueDate < todayStart
  )
  if (overdueChores.length > 0) {
    schedule.push({
      day: 'Overdue',
      date: '',
      chores: overdueChores.map((c): ChoreScheduleItem => ({
        id: c.id,
        title: c.title,
        frequency: c.frequency,
        note: c.note,
        currentAssignee: c.currentAssignee ?? null,
        lastCompletedBy: c.completions[0]?.completedBy ?? null,
        lastCompletedAt: c.completions[0]?.completedAt?.toISOString() ?? null,
        isOverdue: true,
        // Overdue chores are always completable — they are past due.
        isCompletable: true,
      })),
    })
  }

  // ── Day-by-day sections ───────────────────────────────────────────────────
  for (let i = 0; i < days; i++) {
    const dayStart = new Date(todayStart.getTime() + i * 86_400_000)
    const dayEnd   = new Date(todayStart.getTime() + (i + 1) * 86_400_000)
    // Use the midpoint of the local day to reliably get day name/date string
    const midDay   = new Date(dayStart.getTime() + 12 * 3_600_000)

    const dayChores = chores.filter(
      (c) => c.nextDueDate && c.nextDueDate >= dayStart && c.nextDueDate < dayEnd
    )

    schedule.push({
      day:  new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(midDay),
      date: new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(midDay),
      chores: dayChores.map((c): ChoreScheduleItem => ({
        id: c.id,
        title: c.title,
        frequency: c.frequency,
        note: c.note,
        currentAssignee: c.currentAssignee ?? null,
        lastCompletedBy: c.completions[0]?.completedBy ?? null,
        lastCompletedAt: c.completions[0]?.completedAt?.toISOString() ?? null,
        isOverdue: false,
        isCompletable: choreIsCompletable(c.nextDueDate, c.allowEarlyStart, todayEnd),
      })),
    })
  }

  return schedule
}
