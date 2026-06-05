/**
 * Timezone utilities using the native Intl API.
 * All dates are stored as UTC in the database.
 */

/**
 * Fallback IANA timezone used ONLY when a family has no saved timezone.
 * The family's own `timezone` setting always takes precedence — see
 * `getFamilyTimezone` in `src/lib/family.ts`. Do not hardcode this literal
 * at call sites; import this constant so the fallback lives in one place.
 */
export const DEFAULT_TIMEZONE = 'Australia/Sydney'

/**
 * Returns the start and end of "today" in the given timezone as UTC Date objects.
 * Use for DB queries filtering by today in the family's local timezone.
 */
export function todayBoundsInTz(timezone: string): { start: Date; end: Date } {
  const now = new Date()
  // Get today's date string in the local timezone (YYYY-MM-DD)
  const localDate = now.toLocaleDateString('en-CA', { timeZone: timezone })
  // Parse as local midnight by constructing a date string with the timezone offset
  // We find what UTC time corresponds to midnight in this timezone
  const start = localMidnightToUtc(localDate, timezone)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

/**
 * Truncate any instant to UTC midnight of its UTC calendar date.
 *
 * Finance day-precision dates are stored as UTC midnight (YYYY-MM-DDT00:00:00.000Z)
 * and every downstream extractor reads them via UTC components
 * (toISOString().slice(0,10), calendar-day slicing, idempotency windows). Use this
 * to normalise any computed/stepped occurrence date back to that convention so a
 * wall-clock instant (e.g. 2026-06-01T21:17Z) can never be persisted.
 *
 * Uses getUTC* so the result is independent of the runtime timezone — important on
 * a UTC+10 dev box where date-fns stepping can drift off exact UTC midnight across
 * a DST boundary. Do NOT normalise to *local* midnight: for a polluted instant like
 * 2026-06-01T21:17Z that would wrongly yield 2 June in Sydney.
 */
export function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Convert a YYYY-MM-DD string (interpreted as midnight in the given timezone) to a UTC Date.
 */
export function localMidnightToUtc(dateStr: string, timezone: string): Date {
  // Use Intl to find the UTC offset at this date in this timezone
  // Strategy: format epoch 0 in the target timezone, parse offset
  const testDate = new Date(`${dateStr}T12:00:00Z`) // Use noon UTC to avoid DST edge cases at midnight
  const utcParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(testDate)
  const localParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(testDate)

  function partsToMs(parts: Intl.DateTimeFormatPart[]): number {
    const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0')
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  }

  const offsetMs = partsToMs(localParts) - partsToMs(utcParts)
  // Midnight UTC of the given date, adjusted for timezone offset
  return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() - offsetMs)
}

/**
 * Convert a YYYY-MM-DD string to the UTC Date representing 23:59:59.999 of that
 * calendar day in the given timezone. Used by finance report "as at" cutoffs so
 * "as at 31 May" means end-of-day in the family's local zone, not UTC midnight.
 *
 * On malformed input returns `new Date()` (current instant) and on an unknown
 * timezone falls back to end of the UTC day — both preserved from the inline
 * copies this consolidates (trial-balance / balance-sheet / AP / AR).
 */
export function endOfLocalDayUtc(dateStr: string, timezone: string): Date {
  const [year, month1, day] = dateStr.split('-').map(Number)
  if (!year || !month1 || !day) return new Date()
  try {
    const noonUtc = Date.UTC(year, month1 - 1, day, 12, 0, 0, 0)
    const fmt = new Intl.DateTimeFormat('en-AU', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(new Date(noonUtc))
    const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value)
    const tzY = get('year'), tzM = get('month'), tzD = get('day')
    const tzH = get('hour'), tzMin = get('minute'), tzS = get('second')
    const offsetMs = noonUtc - Date.UTC(tzY, tzM - 1, tzD, tzH, tzMin, tzS)
    const midnightUtc = Date.UTC(year, month1 - 1, day, 0, 0, 0, 0) + offsetMs
    return new Date(midnightUtc + 24 * 60 * 60 * 1000 - 1)
  } catch {
    const d = new Date(`${dateStr}T00:00:00.000Z`)
    d.setUTCHours(23, 59, 59, 999)
    return d
  }
}

/**
 * Convert a Date that was calculated as midnight in the server's timezone (UTC)
 * to the UTC Date that represents midnight in the *user's* timezone on the same
 * calendar day.
 *
 * Example:
 *   date = 2026-05-15T00:00:00Z  (Friday midnight UTC)
 *   timezone = 'Australia/Sydney' (UTC+10)
 *   → Sydney local date = 2026-05-15
 *   → returns 2026-05-14T14:00:00Z  (midnight 2026-05-15 in Sydney)
 *
 * This is the key fix for the "before-10am" bug: by storing nextDueDate as the
 * UTC equivalent of midnight in the *user's* timezone (not the server's),
 * all simple Date comparisons (nextDueDate <= todayEnd) work correctly
 * regardless of UTC offset.
 */
export function utcMidnightToLocalMidnight(date: Date, timezone: string): Date {
  const localDateStr = date.toLocaleDateString('en-CA', { timeZone: timezone })
  return localMidnightToUtc(localDateStr, timezone)
}

/**
 * Format a date for display in the given timezone.
 */
export function formatInTz(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    ...options,
  }).format(date)
}

/**
 * Get today's date string (YYYY-MM-DD) in the given timezone.
 */
export function todayStringInTz(timezone: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone })
}

/**
 * Returns the start and end of the current calendar month in the given timezone as UTC Dates.
 * Use for DB queries filtering by this month in the family's local timezone.
 */
export function monthBoundsInTz(timezone: string): { start: Date; end: Date } {
  const localDate = new Date().toLocaleDateString('en-CA', { timeZone: timezone }) // YYYY-MM-DD
  const [year, month] = localDate.split('-').map(Number)
  const firstDayStr = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const firstOfNextStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return {
    start: localMidnightToUtc(firstDayStr, timezone),
    end:   localMidnightToUtc(firstOfNextStr, timezone),
  }
}

/**
 * Returns the UTC Date that is n days after local midnight in the given timezone.
 * Use for query window ends instead of inline new Date(todayStart + N * 86_400_000).
 */
export function nDaysFromTodayInTz(n: number, timezone: string): Date {
  const { start: todayStart } = todayBoundsInTz(timezone)
  return new Date(todayStart.getTime() + n * 86_400_000)
}

/**
 * Add a whole number of *calendar* days to a UTC instant that represents local
 * midnight in the given timezone, returning the UTC instant of local midnight on
 * the resulting calendar day.
 *
 * Unlike `base.getTime() + days * 86_400_000`, this is DST-correct: across an
 * Australian spring-forward (23h) or fall-back (25h) day the flat-millisecond
 * stride drifts an hour off true local midnight, which mis-buckets day-precision
 * dates (e.g. chore-schedule rows landing on the wrong calendar day, or a chore at
 * the far edge of the fetch window being missed). Stepping by calendar date and
 * re-resolving local midnight avoids that drift.
 *
 * `base` is expected to already be local midnight (e.g. from `todayBoundsInTz`).
 */
export function addLocalDays(base: Date, days: number, timezone: string): Date {
  const [y, m, d] = dateStringInTz(base, timezone).split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  const shiftedStr = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
  return localMidnightToUtc(shiftedStr, timezone)
}

/**
 * Returns the YYYY-MM-DD calendar date string for a Date in the given timezone.
 * Use for day-range comparisons where the calendar date (not UTC date) is what matters.
 */
export function dateStringInTz(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone })
}

/**
 * Extract the hour (0–23) and minute (0–59) from a UTC ISO string
 * as they appear in the given local timezone.
 * Never use new Date(iso).getHours() — that returns the JS runtime timezone
 * (UTC on the server, browser-local in the client — both unreliable for UTC+10).
 */
export function getLocalHourMinute(
  isoStr: string,
  timezone: string,
): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(isoStr))
  const hour   = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0', 10)
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
  return { hour: hour === 24 ? 0 : hour, minute }
}

/**
 * Convert an HH:MM time string (e.g. "09:30") to the ISO string used
 * to store a chore's start time: 2000-01-01T{HH}:{MM}:00.000Z
 * The date portion is a fixed sentinel; only UTC hours/minutes are read back.
 */
export function localTimeToStoredDateTime(timeStr: string): string {
  return `2000-01-01T${timeStr}:00.000Z`
}

// ── Calendar grid helpers (timezone-aware) ──────────────────────────────────
// These return UTC instants representing LOCAL MIDNIGHT in `timezone`, so the
// day-cells they produce render and bucket correctly via formatInTz /
// dateStringInTz / eventFallsOnDay (which all interpret their Date argument in
// the family timezone). They replace the date-fns grid functions (startOfWeek,
// endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameMonth,
// addMonths, addWeeks), which operate in the JS runtime timezone — wrong
// whenever the browser's zone differs from the family's (the "wrong day" bug).

/** Format a Date's UTC components as YYYY-MM-DD (used to normalise stepped dates). */
function utcYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Start of the week (local midnight) containing `date`, in the given timezone. */
export function startOfWeekInTz(date: Date, timezone: string, weekStartsOn: 0 | 1 = 0): Date {
  const [y, m, d] = dateStringInTz(date, timezone).split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const diff = (dow - weekStartsOn + 7) % 7
  return localMidnightToUtc(utcYmd(new Date(Date.UTC(y, m - 1, d - diff))), timezone)
}

/** End of the week (local midnight of the last day) containing `date`. */
export function endOfWeekInTz(date: Date, timezone: string, weekStartsOn: 0 | 1 = 0): Date {
  return addLocalDays(startOfWeekInTz(date, timezone, weekStartsOn), 6, timezone)
}

/** First day of the month (local midnight) containing `date`. */
export function startOfMonthInTz(date: Date, timezone: string): Date {
  const [y, m] = dateStringInTz(date, timezone).split('-').map(Number)
  return localMidnightToUtc(`${y}-${String(m).padStart(2, '0')}-01`, timezone)
}

/** Last day of the month (local midnight) containing `date`. */
export function endOfMonthInTz(date: Date, timezone: string): Date {
  const [y, m] = dateStringInTz(date, timezone).split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return localMidnightToUtc(`${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`, timezone)
}

/** Inclusive array of local-midnight instants for every calendar day from `start` to `end`. */
export function eachDayInTz(start: Date, end: Date, timezone: string): Date[] {
  const endStr = dateStringInTz(end, timezone)
  const days: Date[] = []
  let cur = localMidnightToUtc(dateStringInTz(start, timezone), timezone)
  while (dateStringInTz(cur, timezone) <= endStr) {
    days.push(cur)
    cur = addLocalDays(cur, 1, timezone)
  }
  return days
}

/** True if `date` falls on today's calendar date in the given timezone. */
export function isTodayInTz(date: Date, timezone: string): boolean {
  return dateStringInTz(date, timezone) === todayStringInTz(timezone)
}

/** True if `a` and `b` fall in the same calendar month in the given timezone. */
export function isSameMonthInTz(a: Date, b: Date, timezone: string): boolean {
  return dateStringInTz(a, timezone).slice(0, 7) === dateStringInTz(b, timezone).slice(0, 7)
}

/**
 * Add `n` months to the local calendar date of `date`, returning local midnight.
 * The day-of-month is clamped to the target month's last day (matching date-fns
 * addMonths: 31 Jan + 1 month → 28/29 Feb).
 */
export function addMonthsInTz(date: Date, n: number, timezone: string): Date {
  const [y, m, d] = dateStringInTz(date, timezone).split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + n, 1))
  const ty = target.getUTCFullYear()
  const tm = target.getUTCMonth() // 0-based
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  return localMidnightToUtc(`${ty}-${String(tm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, timezone)
}

/** Add `n` weeks (= n×7 calendar days) to `date`, returning local midnight. */
export function addWeeksInTz(date: Date, n: number, timezone: string): Date {
  return addLocalDays(date, n * 7, timezone)
}

// ── Time-of-day-PRESERVING steppers (timezone-aware) ─────────────────────────
// Unlike the grid helpers above (which snap to local midnight), these keep the
// LOCAL wall-clock time-of-day of `instant` as seen in `timezone`. They read the
// instant's local h:m:s, step its local calendar date, then RE-RESOLVE the UTC
// instant for that same wall-clock time on the new date — so a 9am recurring
// event stays exactly 9am every day, including the two Australian DST transition
// days. Flat UTC stepping (date-fns addDays/addMonths on the instant) instead
// drifts the wall-clock ±1h permanently after a transition. (A fixed
// "ms-since-local-midnight" offset would fix the permanent drift but still render
// the transition day itself ±1h off; re-resolving the wall-clock avoids even that.)

/**
 * The zone's UTC offset (ms east of UTC) at a given instant: the difference
 * between the instant's local wall-clock (read in `timezone`) and the instant.
 */
function zoneOffsetMsAt(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(instant)
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0', 10)
  let gh = get('hour'); if (gh === 24) gh = 0
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), gh, get('minute'), get('second'))
  return asUtc - instant.getTime()
}

/**
 * Resolve a local wall-clock datetime (in `timezone`) to its UTC instant.
 * Two-pass offset resolution: sample the offset at the wall-clock-as-if-UTC
 * guess, apply it, then RE-sample at the candidate instant and apply that. The
 * single-pass form is wrong for wall-clock times near a DST transition, where
 * the guess instant can land on the *other* side of the transition and pick up
 * the wrong offset (e.g. 00:45 on the Oct spring-forward day resolved 1h off).
 */
function resolveLocalWallClock(
  y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number, timezone: string,
): Date {
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, s, ms)
  const off1 = zoneOffsetMsAt(new Date(wallAsUtc), timezone)
  const off2 = zoneOffsetMsAt(new Date(wallAsUtc - off1), timezone)
  return new Date(wallAsUtc - off2)
}

/** Read the local wall-clock components of `instant` in `timezone`. */
function localPartsInTz(instant: Date, timezone: string): {
  y: number; mo: number; d: number; h: number; mi: number; s: number; ms: number
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(instant)
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0', 10)
  let h = get('hour'); if (h === 24) h = 0
  return { y: get('year'), mo: get('month'), d: get('day'), h, mi: get('minute'), s: get('second'), ms: instant.getUTCMilliseconds() }
}

/**
 * Format a UTC instant as a `<input type="datetime-local">` value
 * ("YYYY-MM-DDTHH:mm") showing the wall-clock time as it appears in `timezone`.
 * Inverse of `dateTimeLocalToUtc`. Use to populate a datetime-local field so it
 * shows the family's local time regardless of the browser's timezone.
 */
export function toDateTimeLocalInTz(date: Date, timezone: string): string {
  const datePart = dateStringInTz(date, timezone) // YYYY-MM-DD in tz
  const { hour, minute } = getLocalHourMinute(date.toISOString(), timezone)
  return `${datePart}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * Parse a `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm", read as a
 * wall-clock time in `timezone`) to the UTC instant it represents. Inverse of
 * `toDateTimeLocalInTz`. Use when saving a datetime-local field so the stored
 * instant matches the family's local time, not the browser's. Resolves the
 * zone's UTC offset at the target wall-clock time (DST-correct).
 */
export function dateTimeLocalToUtc(localStr: string, timezone: string): Date {
  const [datePart, timePart = '00:00'] = localStr.split('T')
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)
  return resolveLocalWallClock(y, mo, d, h ?? 0, mi ?? 0, 0, 0, timezone)
}

/** Add `n` calendar days to `instant`, preserving its local time-of-day in `timezone`. */
export function addLocalDaysPreservingTime(instant: Date, n: number, timezone: string): Date {
  const { y, mo, d, h, mi, s, ms } = localPartsInTz(instant, timezone)
  const stepped = new Date(Date.UTC(y, mo - 1, d + n))
  return resolveLocalWallClock(stepped.getUTCFullYear(), stepped.getUTCMonth() + 1, stepped.getUTCDate(), h, mi, s, ms, timezone)
}

/**
 * Add `n` months to `instant`, preserving its local time-of-day, clamping the
 * day-of-month to the target month's last day (like date-fns addMonths:
 * 31 Jan + 1 month → 28/29 Feb).
 */
export function addLocalMonthsPreservingTime(instant: Date, n: number, timezone: string): Date {
  const { y, mo, d, h, mi, s, ms } = localPartsInTz(instant, timezone)
  const target = new Date(Date.UTC(y, mo - 1 + n, 1))
  const ty = target.getUTCFullYear()
  const tm = target.getUTCMonth() // 0-based
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  return resolveLocalWallClock(ty, tm + 1, day, h, mi, s, ms, timezone)
}

/**
 * Add `n` years to `instant`, preserving its local time-of-day, clamping
 * 29 Feb → 28 Feb in a non-leap target year (like date-fns addYears).
 */
export function addLocalYearsPreservingTime(instant: Date, n: number, timezone: string): Date {
  const { y, mo, d, h, mi, s, ms } = localPartsInTz(instant, timezone)
  const ty = y + n
  const lastDay = new Date(Date.UTC(ty, mo, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  return resolveLocalWallClock(ty, mo, day, h, mi, s, ms, timezone)
}
