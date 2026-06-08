// src/lib/finance-fy.ts
// Financial year utilities — all FY logic lives here.
// Import this everywhere instead of hardcoding July.
// Both server and client-safe (no Prisma or server-only imports).

/**
 * Given a JS Date and the FY start month (1-12), return the FY start calendar year.
 * Example: month=7 (July), date=2026-03-15 → 2025 (because Mar is before July, so we're in FY2025-26)
 * Example: month=7 (July), date=2026-08-01 → 2026 (because Aug is after July, so we're in FY2026-27)
 */
export function fyStartYear(date: Date, fyStartMonth: number): number {
  const m = date.getMonth() + 1 // convert to 1-based
  return m >= fyStartMonth ? date.getFullYear() : date.getFullYear() - 1
}

/**
 * Timezone-aware variant of fyStartYear. Returns the FY start calendar year for
 * `date` evaluated in the family's IANA timezone.
 *
 * fyStartYear() reads date.getMonth()/getFullYear() in the runtime's timezone
 * (UTC on the NAS, the browser's tz on the client). When that differs from the
 * family tz, a date near a year/FY boundary (e.g. 2026-06-30T15:00:00Z = 1 Jul
 * in Sydney) lands in the wrong FY. This evaluates the calendar month and year
 * in `tz`. Falls back to fyStartYear() if tz is empty/invalid.
 */
export function fyStartYearInTz(date: Date, fyStartMonth: number, tz: string): number {
  if (!tz) return fyStartYear(date, fyStartMonth)
  const parts = getTzFormatter(tz).formatToParts(date)
  const year   = parseInt(parts.find(p => p.type === 'year')!.value, 10)
  const month1 = parseInt(parts.find(p => p.type === 'month')!.value, 10)
  return month1 >= fyStartMonth ? year : year - 1
}

/**
 * Return the start and end Date objects for a financial year using LOCAL time.
 *
 * Use this on the CLIENT (browser) where new Date() is already in the user's tz.
 * On the SERVER use fyDateRangeInTz() instead to avoid NAS timezone drift.
 *
 * fyYear = the calendar year in which the FY begins.
 * Example: fyYear=2025, fyStartMonth=7 → { start: 2025-07-01T00:00:00, end: 2026-06-30T23:59:59 }
 */
export function fyDateRange(
  fyYear: number,
  fyStartMonth: number
): { start: Date; end: Date } {
  const startMonth0 = fyStartMonth - 1 // convert to 0-based for Date constructor
  const start = new Date(fyYear, startMonth0, 1, 0, 0, 0, 0)
  const endMonth0 = startMonth0 === 0 ? 11 : startMonth0 - 1
  const endYear   = startMonth0 === 0 ? fyYear : fyYear + 1
  const end = new Date(endYear, endMonth0 + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

// ── Timezone-aware boundary helpers ──────────────────────────────────────────
//
// The NAS runs on a fixed OS timezone (typically UTC or a system default) which
// may differ from the family's IANA timezone. Using new Date(year, month, day)
// produces boundaries in the SERVER's local timezone, not the family's timezone.
// Transactions near midnight at period boundaries can fall into the wrong period.
//
// These helpers produce UTC Date objects that correspond to midnight (00:00:00)
// or end-of-day (23:59:59.999) in the family's IANA timezone, so Prisma's
// date comparisons (which use UTC) produce correct results regardless of where
// the NAS is configured.

/**
 * Parse a calendar date (year, month 1-based, day) in a given IANA timezone
 * and return the equivalent UTC Date (start of that day in that timezone).
 *
 * Example: tzMidnight(2025, 7, 1, 'Australia/Sydney')
 *   → 2025-06-30T14:00:00.000Z  (AEST = UTC+10, so midnight AEST = 14:00 UTC prev day)
 */
const _tzFmtCache = new Map<string, Intl.DateTimeFormat>()
function getTzFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = _tzFmtCache.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-AU', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })
    _tzFmtCache.set(tz, fmt)
  }
  return fmt
}

function tzMidnight(year: number, month1: number, day: number, tz: string): Date {
  // Build an ISO-like string and interpret it in the target timezone using Intl.
  // Strategy: format a UTC instant and ask Intl what date/time it shows in `tz`,
  // then binary-search for the UTC instant that yields midnight in `tz`.
  //
  // Simpler approach: use the offset from a known reference point.
  // We create an arbitrary UTC Date set to noon on the target day, then use
  // Intl.DateTimeFormat to find the offset, and adjust.
  //
  // Noon avoids DST edge cases (DST transitions happen at 02:00-03:00 in most tz).
  const noonUtc = Date.UTC(year, month1 - 1, day, 12, 0, 0, 0)
  const fmt = getTzFormatter(tz)
  // Find what UTC instant shows as 00:00:00 on this date in the timezone.
  // We use the offset at noon (safe for DST), then fine-correct with a second pass.
  const parts = fmt.formatToParts(new Date(noonUtc))
  const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value)
  const tzYear = get('year'), tzMonth = get('month'), tzDay = get('day')
  const tzHour = get('hour'), tzMinute = get('minute'), tzSecond = get('second')

  // Offset in ms between noon UTC and noon in the tz (positive = tz ahead of UTC)
  const offsetMs = noonUtc - Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond)

  // Midnight in the tz = 00:00:00 local = 00:00:00 UTC shifted by offset
  return new Date(Date.UTC(year, month1 - 1, day, 0, 0, 0, 0) + offsetMs)
}

/**
 * Return the start and end Date objects for a financial year in the given
 * IANA timezone. The returned Dates are UTC instants corresponding to
 * 00:00:00 (start) and 23:59:59.999 (end) in the family's timezone.
 *
 * Use this on the SERVER (API routes) where the process timezone may not
 * match the family's timezone.
 *
 * Falls back to fyDateRange() (local time) if tz is empty/invalid.
 */
export function fyDateRangeInTz(
  fyYear: number,
  fyStartMonth: number,
  tz: string,
): { start: Date; end: Date } {
  if (!tz) return fyDateRange(fyYear, fyStartMonth)
  try {
    // FY start: first day of fyStartMonth in fyYear at 00:00:00 in tz
    const start = tzMidnight(fyYear, fyStartMonth, 1, tz)

    // FY end: last day of the month before fyStartMonth in fyYear+1
    // i.e. the last day of (fyStartMonth-1) in fyYear+1, or Dec 31 of fyYear if fyStartMonth=1
    const endMonth1 = fyStartMonth === 1 ? 12 : fyStartMonth - 1
    const endYear   = fyStartMonth === 1 ? fyYear : fyYear + 1
    // Last day of endMonth: day 0 of the next month in local calendar
    const lastDay = new Date(endYear, endMonth1, 0).getDate() // 28/29/30/31
    const endStart = tzMidnight(endYear, endMonth1, lastDay, tz)
    const end = new Date(endStart.getTime() + 24 * 60 * 60 * 1000 - 1) // +23:59:59.999

    return { start, end }
  } catch {
    // Unknown/invalid timezone — fall back to local time
    return fyDateRange(fyYear, fyStartMonth)
  }
}

/**
 * Return start/end for a calendar month in the given IANA timezone.
 * Returned Dates are UTC instants.
 */
export function monthRangeInTz(
  year: number,
  month1: number,
  tz: string,
): { start: Date; end: Date } {
  if (!tz) {
    return {
      start: new Date(year, month1 - 1, 1, 0, 0, 0, 0),
      end:   new Date(year, month1, 0, 23, 59, 59, 999),
    }
  }
  try {
    const start = tzMidnight(year, month1, 1, tz)
    const lastDay = new Date(year, month1, 0).getDate()
    const endStart = tzMidnight(year, month1, lastDay, tz)
    const end = new Date(endStart.getTime() + 24 * 60 * 60 * 1000 - 1)
    return { start, end }
  } catch {
    return {
      start: new Date(year, month1 - 1, 1, 0, 0, 0, 0),
      end:   new Date(year, month1, 0, 23, 59, 59, 999),
    }
  }
}

/**
 * Return start/end for a calendar quarter in the given IANA timezone.
 */
export function quarterRangeInTz(
  year: number,
  month1: number, // any month in the quarter
  tz: string,
): { start: Date; end: Date } {
  const q = Math.floor((month1 - 1) / 3)
  const qStartMonth1 = q * 3 + 1
  const qEndMonth1   = q * 3 + 3
  if (!tz) {
    return {
      start: new Date(year, qStartMonth1 - 1, 1, 0, 0, 0, 0),
      end:   new Date(year, qEndMonth1, 0, 23, 59, 59, 999),
    }
  }
  try {
    const start = tzMidnight(year, qStartMonth1, 1, tz)
    const lastDay = new Date(year, qEndMonth1, 0).getDate()
    const endStart = tzMidnight(year, qEndMonth1, lastDay, tz)
    const end = new Date(endStart.getTime() + 24 * 60 * 60 * 1000 - 1)
    return { start, end }
  } catch {
    return {
      start: new Date(year, qStartMonth1 - 1, 1, 0, 0, 0, 0),
      end:   new Date(year, qEndMonth1, 0, 23, 59, 59, 999),
    }
  }
}

/**
 * Return the FY label string for display.
 * Example: fyYear=2025, fyStartMonth=7 → "2025-26"
 * Example: fyYear=2025, fyStartMonth=1 → "2025" (same calendar year)
 */
export function fyLabel(fyYear: number, fyStartMonth: number): string {
  if (fyStartMonth === 1) return String(fyYear) // calendar year FY
  const endYear = fyYear + 1
  return `${fyYear}-${String(endYear).slice(-2)}`
}

/**
 * Parse a FY label string back to a fyYear integer.
 * "2025-26" → 2025, "2025" → 2025
 */
export function parseFyLabel(label: string): number {
  return parseInt(label.split('-')[0])
}

/**
 * Return the ordered list of month labels for this FY, starting from fyStartMonth.
 * Example: fyStartMonth=7 → ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun']
 * Example: fyStartMonth=1 → ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
 */
const ALL_MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function fyMonthLabels(fyStartMonth: number): string[] {
  const start0 = fyStartMonth - 1 // 0-based
  return [
    ...ALL_MONTH_LABELS.slice(start0),
    ...ALL_MONTH_LABELS.slice(0, start0),
  ]
}

/**
 * Calendar (year, 1-based month) for column `col` (0-based, 0 = first month of the
 * FY) of the financial year starting in `fyStartYear`. `fyStartMonth` is 1-based
 * (July = 7), matching family.financeYearStartMonth / fyMonthLabels / fyDateRange.
 *
 * Single source of truth for mapping an Annual-P&L column to its calendar month.
 * It exists so the 1-based→0-based conversion lives in ONE tested place: feeding a
 * 1-based fyStartMonth straight into 0-based month arithmetic makes every column
 * land one month late (the Annual P&L "off-by-one" bug — Unitrak interest dated
 * 2026-05 showed under April). See finance-fy.test.ts.
 */
export function fyColumnYearMonth(
  fyStartYear: number,
  fyStartMonth: number,
  col: number,
): { year: number; month1: number } {
  const startMonth0 = fyStartMonth - 1
  const month0 = (startMonth0 + col) % 12
  const year = startMonth0 + col >= 12 ? fyStartYear + 1 : fyStartYear
  return { year, month1: month0 + 1 }
}

/**
 * "YYYY-MM" key for Annual-P&L column `col`, used to match the per-month buckets
 * returned by /api/finance/pnl/batch. Derived from fyColumnYearMonth so the
 * column→month mapping cannot drift between the Date array and the batch key.
 */
export function fyColumnMonthKey(
  fyStartYear: number,
  fyStartMonth: number,
  col: number,
): string {
  const { year, month1 } = fyColumnYearMonth(fyStartYear, fyStartMonth, col)
  return `${year}-${String(month1).padStart(2, '0')}`
}

/**
 * Return the 0-based index (0 = first month of FY) for a given Date within a FY.
 * Returns -1 if the date falls outside the FY.
 */
export function fyMonthIndex(date: Date, fyYear: number, fyStartMonth: number): number {
  const { start, end } = fyDateRange(fyYear, fyStartMonth)
  if (date < start || date > end) return -1
  const m0 = date.getMonth() // 0-based calendar month
  const s0 = fyStartMonth - 1 // 0-based FY start month
  if (m0 >= s0) return m0 - s0
  return 12 - s0 + m0
}

/**
 * Timezone-aware variant of fyMonthIndex. Returns the 0-based FY month index for
 * `date` evaluated in the family's IANA timezone, or -1 if outside the FY.
 *
 * fyMonthIndex() reads date.getMonth()/getFullYear() in the SERVER's timezone
 * (UTC on the NAS). An entry stored at e.g. 2026-05-31T15:00:00Z is 1 Jun in
 * Sydney (UTC+10), but getMonth() reports May — so on the FY exports it lands in
 * the wrong month column and, within the UTC offset of the FY boundary, can be
 * dropped from the report (and its FY total) entirely. This evaluates both the
 * FY bounds and the calendar month in `tz`, so the Excel/Print/Email columns
 * match the on-screen tz-aware Monthly P&L (pnl/batch).
 */
export function fyMonthIndexInTz(
  date: Date,
  fyYear: number,
  fyStartMonth: number,
  tz: string,
): number {
  if (!tz) return fyMonthIndex(date, fyYear, fyStartMonth)
  const { start, end } = fyDateRangeInTz(fyYear, fyStartMonth, tz)
  if (date < start || date > end) return -1
  // Calendar month of `date` in the family tz (1-based)
  const parts = getTzFormatter(tz).formatToParts(date)
  const month1 = parseInt(parts.find(p => p.type === 'month')!.value, 10)
  const m0 = month1 - 1
  const s0 = fyStartMonth - 1
  if (m0 >= s0) return m0 - s0
  return 12 - s0 + m0
}

/**
 * Return how many months of the current FY are complete (including the current month).
 */
export function fyMonthsComplete(now: Date, fyYear: number, fyStartMonth: number): number {
  const idx = fyMonthIndex(now, fyYear, fyStartMonth)
  if (idx < 0) return 12 // outside FY = full year complete
  return Math.min(idx + 1, 12)
}

/**
 * Timezone-aware variant of fyMonthsComplete — evaluates "today" in the family
 * tz so the number of report columns matches the tz-aware month bucketing.
 */
export function fyMonthsCompleteInTz(now: Date, fyYear: number, fyStartMonth: number, tz: string): number {
  const idx = fyMonthIndexInTz(now, fyYear, fyStartMonth, tz)
  if (idx < 0) return 12 // outside FY = full year complete
  return Math.min(idx + 1, 12)
}

/**
 * Convenience: return the current FY start year given a JS Date.
 */
export function currentFyYear(fyStartMonth: number): number {
  return fyStartYear(new Date(), fyStartMonth)
}
