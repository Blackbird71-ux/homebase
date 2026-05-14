/**
 * Timezone utilities using the native Intl API.
 * All dates are stored as UTC in the database.
 */

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
