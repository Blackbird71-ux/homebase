import {
  dateStringInTz,
  localMidnightToUtc,
  addLocalDaysPreservingTime,
  addLocalMonthsPreservingTime,
  addLocalYearsPreservingTime,
} from '@/lib/timezone'

export interface RecurrenceInstance {
  start: Date
  end: Date
  originalEventId: string
}

/**
 * Parse a simple RRULE string and generate recurrence instances within a date range.
 * Supports: FREQ=DAILY, FREQ=WEEKLY, FREQ=MONTHLY, FREQ=YEARLY
 * Optional: INTERVAL=n, BYDAY=MO,TU,WE,TH,FR,SA,SU (for WEEKLY), COUNT=n
 */
export function parseRRule(rruleStr: string): {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  byDay: string[] | null
  count: number | null
} | null {
  if (!rruleStr) return null

  const parts = rruleStr.split(';')
  let freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | null = null
  let interval = 1
  let byDay: string[] | null = null
  let count: number | null = null

  for (const part of parts) {
    const [key, value] = part.split('=')
    switch (key) {
      case 'FREQ':
        if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(value)) {
          freq = value as 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
        }
        break
      case 'INTERVAL':
        interval = parseInt(value, 10) || 1
        break
      case 'BYDAY':
        byDay = value.split(',')
        break
      case 'COUNT':
        count = parseInt(value, 10) || null
        break
    }
  }

  if (!freq) return null
  return { freq, interval, byDay, count }
}

/**
 * Get the day-of-week number (0=Sunday, 1=Monday, etc.) from a BYDAY string
 */
function byDayToDayOfWeek(byDay: string): number {
  const map: Record<string, number> = {
    SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
  }
  return map[byDay] ?? -1
}

/**
 * Generate recurrence instances for a recurring event within a given date range.
 */
export function generateRecurrenceInstances(
  eventStart: Date,
  eventEnd: Date,
  recurrenceRule: string,
  recurrenceEndDate: Date | null,
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string,
  maxInstances = 365
): RecurrenceInstance[] {
  const parsed = parseRRule(recurrenceRule)
  if (!parsed) return []

  const { freq, interval, byDay, count } = parsed
  const duration = eventEnd.getTime() - eventStart.getTime()
  const instances: RecurrenceInstance[] = []

  // For WEEKLY+BYDAY, anchor each instance at the event's local time-of-day:
  // ms elapsed from the event's local midnight (in the user's tz) to its start.
  const localTimeOfDayMs =
    freq === 'WEEKLY' && byDay && byDay.length > 0
      ? eventStart.getTime() - localMidnightToUtc(dateStringInTz(eventStart, timezone), timezone).getTime()
      : 0

  // For COUNT-based rules, we need to generate up to COUNT instances
  const maxToGenerate = count || maxInstances

  let currentStart = new Date(eventStart)
  let instanceCount = 0

  // Safety: limit iterations to prevent infinite loops
  const maxIterations = Math.min(maxToGenerate * 2, 1000)
  let iterations = 0

  while (instanceCount < maxToGenerate && iterations < maxIterations) {
    iterations++

    // For WEEKLY with BYDAY, generate each selected day — computed in the
    // user's local timezone so the weekday and wall-clock time are correct
    // for users east/west of UTC (AGENTS.md §Timezone).
    if (freq === 'WEEKLY' && byDay && byDay.length > 0) {
      // Stop once the whole week has moved past the series end date.
      if (recurrenceEndDate && currentStart.getTime() > recurrenceEndDate.getTime()) break

      // The local calendar date of the current week position and its weekday.
      const weekDateStr = dateStringInTz(currentStart, timezone)
      const [wy, wm, wd] = weekDateStr.split('-').map(Number)
      const weekDayOfWeek = new Date(Date.UTC(wy, wm - 1, wd)).getUTCDay()

      // For each day in the BYDAY list
      for (const dayStr of byDay) {
        const targetDay = byDayToDayOfWeek(dayStr)
        if (targetDay < 0) continue

        // Calculate days to add to get to the target local weekday
        let daysToAdd = targetDay - weekDayOfWeek
        if (daysToAdd < 0) daysToAdd += 7

        // Local calendar date of this instance → its local midnight in UTC,
        // then offset by the event's local time-of-day.
        const instanceDateStr = new Date(Date.UTC(wy, wm - 1, wd + daysToAdd)).toISOString().slice(0, 10)
        const instanceStart = new Date(localMidnightToUtc(instanceDateStr, timezone).getTime() + localTimeOfDayMs)
        const instanceEnd = new Date(instanceStart.getTime() + duration)

        // Honour the series end date (the non-BYDAY path checks this below).
        if (recurrenceEndDate && instanceStart.getTime() > recurrenceEndDate.getTime()) continue

        // Check if this instance is within the requested view range
        if (instanceEnd.getTime() > rangeStart.getTime() && instanceStart.getTime() < rangeEnd.getTime()) {
          instances.push({
            start: instanceStart,
            end: instanceEnd,
            originalEventId: '',
          })
        }

        instanceCount++
        if (instanceCount >= maxToGenerate) break
      }

      // Move to next week (advance the anchor by interval weeks). Preserve the
      // local time-of-day so the week's calendar date stays correct across a DST
      // transition (the anchor is only read via dateStringInTz below).
      currentStart = addLocalDaysPreservingTime(currentStart, interval * 7, timezone)
      continue
    }

    // For non-BYDAY frequencies, generate one instance at currentStart
    const instanceEnd = new Date(currentStart.getTime() + duration)

    // Check if this instance is within range
    if (instanceEnd.getTime() > rangeStart.getTime() && currentStart.getTime() < rangeEnd.getTime()) {
      instances.push({
        start: new Date(currentStart),
        end: instanceEnd,
        originalEventId: '',
      })
    }

    instanceCount++

    // Stop if we've passed the end date
    if (recurrenceEndDate && currentStart.getTime() > recurrenceEndDate.getTime()) {
      break
    }

    // Advance to next occurrence — step the local calendar date and re-attach the
    // event's local time-of-day, so a recurring event keeps its wall-clock time
    // across an Australian DST transition (flat UTC stepping drifted it ±1h).
    switch (freq) {
      case 'DAILY':
        currentStart = addLocalDaysPreservingTime(currentStart, interval, timezone)
        break
      case 'WEEKLY':
        currentStart = addLocalDaysPreservingTime(currentStart, interval * 7, timezone)
        break
      case 'MONTHLY':
        currentStart = addLocalMonthsPreservingTime(currentStart, interval, timezone)
        break
      case 'YEARLY':
        currentStart = addLocalYearsPreservingTime(currentStart, interval, timezone)
        break
    }
  }

  return instances
}
