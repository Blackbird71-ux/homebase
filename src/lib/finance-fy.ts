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
 * Return the start and end Date objects for a financial year.
 * fyYear = the calendar year in which the FY begins.
 * Example: fyYear=2025, fyStartMonth=7 → { start: 2025-07-01, end: 2026-06-30 }
 * Example: fyYear=2025, fyStartMonth=1 → { start: 2025-01-01, end: 2025-12-31 }
 */
export function fyDateRange(
  fyYear: number,
  fyStartMonth: number
): { start: Date; end: Date } {
  // fyStartMonth is 1-based (7 = July).
  const startMonth0 = fyStartMonth - 1 // convert to 0-based for Date constructor

  // FY start: first day of fyStartMonth in fyYear
  const start = new Date(fyYear, startMonth0, 1, 0, 0, 0, 0)

  // FY end: last moment of the month before fyStartMonth in fyYear+1
  // i.e. one millisecond before the next FY start
  const endMonth0 = startMonth0 === 0 ? 11 : startMonth0 - 1
  const endYear   = startMonth0 === 0 ? fyYear : fyYear + 1
  // Last day of endMonth in endYear: use day 0 of the following month
  const end = new Date(endYear, endMonth0 + 1, 0, 23, 59, 59, 999)

  return { start, end }
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
 * Return how many months of the current FY are complete (including the current month).
 */
export function fyMonthsComplete(now: Date, fyYear: number, fyStartMonth: number): number {
  const idx = fyMonthIndex(now, fyYear, fyStartMonth)
  if (idx < 0) return 12 // outside FY = full year complete
  return Math.min(idx + 1, 12)
}

/**
 * Convenience: return the current FY start year given a JS Date.
 */
export function currentFyYear(fyStartMonth: number): number {
  return fyStartYear(new Date(), fyStartMonth)
}
