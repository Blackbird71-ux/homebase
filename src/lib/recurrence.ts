import { addDays, addWeeks, addMonths, addYears, isBefore, isAfter, differenceInMilliseconds } from 'date-fns'

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
  maxInstances = 365
): RecurrenceInstance[] {
  const parsed = parseRRule(recurrenceRule)
  if (!parsed) return []

  const { freq, interval, byDay, count } = parsed
  const duration = differenceInMilliseconds(eventEnd, eventStart)
  const instances: RecurrenceInstance[] = []

  // For COUNT-based rules, we need to generate up to COUNT instances
  const maxToGenerate = count || maxInstances

  let currentStart = new Date(eventStart)
  let instanceCount = 0

  // Safety: limit iterations to prevent infinite loops
  const maxIterations = Math.min(maxToGenerate * 2, 1000)
  let iterations = 0

  while (instanceCount < maxToGenerate && iterations < maxIterations) {
    iterations++

    // For WEEKLY with BYDAY, we need to generate each day of the week
    if (freq === 'WEEKLY' && byDay && byDay.length > 0) {
      // Compute UTC midnight of the current position and its day-of-week
      const weekMidnight = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth(), currentStart.getUTCDate()))
      const dayOfWeek = currentStart.getUTCDay()

      // For each day in the BYDAY list
      for (const dayStr of byDay) {
        const targetDay = byDayToDayOfWeek(dayStr)
        if (targetDay < 0) continue

        // Calculate days to add to get to the target day
        let daysToAdd = targetDay - dayOfWeek
        if (daysToAdd < 0) daysToAdd += 7

        const instanceStart = new Date(weekMidnight.getTime() + daysToAdd * 86400000)
        instanceStart.setHours(eventStart.getHours(), eventStart.getMinutes(), eventStart.getSeconds(), eventStart.getMilliseconds())

        const instanceEnd = new Date(instanceStart.getTime() + duration)

        // Check if this instance is within range
        if (isAfter(instanceEnd, rangeStart) && isBefore(instanceStart, rangeEnd)) {
          instances.push({
            start: instanceStart,
            end: instanceEnd,
            originalEventId: '',
          })
        }

        instanceCount++
        if (instanceCount >= maxToGenerate) break
      }

      // Move to next week
      currentStart = addWeeks(weekMidnight, interval)
      continue
    }

    // For non-BYDAY frequencies, generate one instance at currentStart
    const instanceEnd = new Date(currentStart.getTime() + duration)

    // Check if this instance is within range
    if (isAfter(instanceEnd, rangeStart) && isBefore(currentStart, rangeEnd)) {
      instances.push({
        start: new Date(currentStart),
        end: instanceEnd,
        originalEventId: '',
      })
    }

    instanceCount++

    // Stop if we've passed the end date
    if (recurrenceEndDate && isAfter(currentStart, recurrenceEndDate)) {
      break
    }

    // Advance to next occurrence
    switch (freq) {
      case 'DAILY':
        currentStart = addDays(currentStart, interval)
        break
      case 'WEEKLY':
        currentStart = addWeeks(currentStart, interval)
        break
      case 'MONTHLY':
        currentStart = addMonths(currentStart, interval)
        break
      case 'YEARLY':
        currentStart = addYears(currentStart, interval)
        break
    }
  }

  return instances
}
