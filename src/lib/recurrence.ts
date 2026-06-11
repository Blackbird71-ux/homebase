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
 * Parse the Event.recurrenceExceptions JSON column (array of occurrence-start
 * ISO strings) into a set of epoch-ms instants for exact matching. Malformed
 * JSON or entries are ignored — an unreadable exception must never hide or
 * duplicate occurrences.
 */
export function parseRecurrenceExceptions(json: string | null | undefined): Set<number> {
  const result = new Set<number>()
  if (!json) return result
  try {
    const arr = JSON.parse(json)
    if (Array.isArray(arr)) {
      for (const entry of arr) {
        const ms = new Date(entry).getTime()
        if (!isNaN(ms)) result.add(ms)
      }
    }
  } catch { /* ignore malformed JSON */ }
  return result
}

/**
 * Return the recurrenceExceptions JSON with `occurrence` appended (normalized
 * to ISO, deduplicated) — the single place that knows the column's format.
 */
export function addRecurrenceException(json: string | null, occurrence: Date): string {
  const existing = parseRecurrenceExceptions(json)
  existing.add(occurrence.getTime())
  return JSON.stringify([...existing].sort((a, b) => a - b).map(ms => new Date(ms).toISOString()))
}

/**
 * Generate recurrence instances for a recurring event within a given date range.
 * Occurrences whose start matches an entry in `recurrenceExceptions` (the
 * Event column — single-occurrence deletes) are omitted; like RFC 5545 EXDATE,
 * an excluded occurrence still consumes its COUNT slot.
 */
export function generateRecurrenceInstances(
  eventStart: Date,
  eventEnd: Date,
  recurrenceRule: string,
  recurrenceEndDate: Date | null,
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string,
  recurrenceExceptions: string | null = null,
  maxInstances = 365
): RecurrenceInstance[] {
  const parsed = parseRRule(recurrenceRule)
  if (!parsed) return []

  const exceptions = parseRecurrenceExceptions(recurrenceExceptions)

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

  // ── Fast-forward an open-ended series up to the view window ──────────────────
  // A series with no COUNT has `maxToGenerate = maxInstances` — a *safety* cap,
  // not a semantic limit. Stepping from a long-past `eventStart` would spend that
  // cap (and the `maxIterations` ceiling) just reaching the window, so a series
  // whose start is more than `maxInstances` occurrences before the window would
  // exhaust the budget and emit *nothing* — silently dropping real in-window
  // events (e.g. a DAILY event started >365 days ago). Skip the occurrences that
  // end before the window so the budget is spent inside it.
  //
  // Two exclusions:
  //  • COUNT: RRULE COUNT counts from occurrence 1, so pre-window occurrences are
  //    significant (they consume the COUNT). Never fast-forward a COUNT series.
  //  • A series that ends before the window (recurrenceEndDate < rangeStart) has
  //    no in-window occurrences; skipping the fast-forward lets the loop's own end
  //    -date break fire correctly instead of us jumping past the end and emitting
  //    phantom occurrences. The un-jumped loop reaches 0 cheaply (budget/end-date).
  if (!count && (!recurrenceEndDate || recurrenceEndDate.getTime() >= rangeStart.getTime())) {
    const dayMs = 24 * 60 * 60 * 1000
    if (freq === 'DAILY' || freq === 'WEEKLY') {
      // DAILY/WEEKLY advance by a fixed calendar stride with no day-of-month
      // clamping, so the k-th occurrence == addLocalDaysPreservingTime(start,
      // k*stride): jump in closed form with the same stepper the loop uses, so the
      // emitted instants are byte-identical. Land at least one stride + the event's
      // duration before the window, so the loop's own `instanceEnd > rangeStart`
      // check selects the true first in-window occurrence (covers long events and,
      // for WEEKLY+BYDAY, the up-to-6-day intra-week spread).
      const strideDays = (freq === 'WEEKLY' ? 7 : 1) * interval
      const startDateMs = Date.parse(`${dateStringInTz(eventStart, timezone)}T00:00:00Z`)
      const rangeStartDateMs = Date.parse(`${dateStringInTz(rangeStart, timezone)}T00:00:00Z`)
      const durationDays = Math.ceil(duration / dayMs)
      const skippableDays = Math.floor((rangeStartDateMs - startDateMs) / dayMs) - durationDays - strideDays
      if (skippableDays > strideDays) {
        const k = Math.floor(skippableDays / strideDays)
        currentStart = addLocalDaysPreservingTime(eventStart, k * strideDays, timezone)
      }
    } else {
      // MONTHLY/YEARLY day-of-month can clamp path-dependently (31→28→28…), so the
      // k-th occurrence has no closed form — step with the real stepper until the
      // occurrence reaches the window. A realistic start is only a few dozen
      // periods away; the guard just bounds a pathologically old start. Stepping
      // (not jumping) is what preserves the running-date clamp the tests pin.
      let guard = 0
      while (guard++ < 1000) {
        if (currentStart.getTime() + duration > rangeStart.getTime()) break
        const next = freq === 'MONTHLY'
          ? addLocalMonthsPreservingTime(currentStart, interval, timezone)
          : addLocalYearsPreservingTime(currentStart, interval, timezone)
        if (next.getTime() >= rangeEnd.getTime()) break
        currentStart = next
      }
    }
  }

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

      // Window guard (same as the non-BYDAY path below): once the week anchor is
      // at/after rangeEnd, every day this week and later is too, so none can fall
      // in range. Occurrences only move forward, so it is safe to stop here.
      if (currentStart.getTime() >= rangeEnd.getTime()) break

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
        if (
          instanceEnd.getTime() > rangeStart.getTime() &&
          instanceStart.getTime() < rangeEnd.getTime() &&
          !exceptions.has(instanceStart.getTime())
        ) {
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
    if (
      instanceEnd.getTime() > rangeStart.getTime() &&
      currentStart.getTime() < rangeEnd.getTime() &&
      !exceptions.has(currentStart.getTime())
    ) {
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

    // Stop once occurrences advance past the requested window. Occurrences only
    // move forward in time, so nothing further can fall within [rangeStart,
    // rangeEnd]. Without this, an open-ended series (no COUNT and no end date)
    // generates up to `maxInstances` far-future instances per event and discards
    // nearly all of them — the dominant cost when many recurring events are
    // expanded (dashboard / calendar / /api/events). Output is unchanged: every
    // in-window instance is still emitted before the loop stops.
    if (currentStart.getTime() >= rangeEnd.getTime()) break
  }

  return instances
}
