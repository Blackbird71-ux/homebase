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
