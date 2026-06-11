// src/lib/ai/finance-period.ts
// Shared period parsing for the finance AI tools ("thisMonth", "lastMonth",
// "thisYear", "last30days", "fy2025"). Previously each tool hand-rolled this
// with a fixed +10h "approx AEST" shift (or no shift at all) and server-local
// Date construction, so period boundaries landed 10–11 hours away from the
// family's real local midnight and ignored DST. All bounds now come from the
// timezone helpers.

import {
  addLocalDays,
  formatInTz,
  monthBoundsForInTz,
  monthBoundsInTz,
  todayBoundsInTz,
  todayStringInTz,
} from '@/lib/timezone'

export interface FinancePeriod {
  start: Date
  end: Date // exclusive
  label: string
}

/**
 * Bounds of an Australian financial year (1 July startYear → 1 July startYear+1)
 * in the given timezone.
 */
export function financialYearBounds(startYear: number, timezone: string): { start: Date; end: Date } {
  return {
    start: monthBoundsForInTz(startYear, 7, timezone).start,
    end: monthBoundsForInTz(startYear + 1, 7, timezone).start,
  }
}

/** Start year of the current Australian financial year in the given timezone. */
export function currentFinancialYearStart(timezone: string): number {
  const [year, month] = todayStringInTz(timezone).split('-').map(Number)
  return month >= 7 ? year : year - 1
}

/**
 * Parse an AI-tool period argument into timezone-aware query bounds and a
 * human-readable label. Unknown or missing periods default to the current month.
 */
export function parseFinancePeriod(period: string | undefined, timezone: string): FinancePeriod {
  if (period?.startsWith('fy')) {
    const yr = parseInt(period.slice(2), 10)
    if (!isNaN(yr)) {
      return { ...financialYearBounds(yr, timezone), label: `FY ${yr}-${yr + 1}` }
    }
  }

  const [year, month] = todayStringInTz(timezone).split('-').map(Number)

  switch (period) {
    case 'lastMonth': {
      const y = month === 1 ? year - 1 : year
      const m = month === 1 ? 12 : month - 1
      const { start, end } = monthBoundsForInTz(y, m, timezone)
      return { start, end, label: `Last month (${monthLabel(start, timezone)})` }
    }
    case 'thisYear': {
      return {
        start: monthBoundsForInTz(year, 1, timezone).start,
        end: monthBoundsForInTz(year + 1, 1, timezone).start,
        label: `Year to date (${year})`,
      }
    }
    case 'last30days': {
      const { start: todayStart, end } = todayBoundsInTz(timezone)
      return { start: addLocalDays(todayStart, -30, timezone), end, label: 'Last 30 days' }
    }
    case 'thisMonth':
    default: {
      const { start, end } = monthBoundsInTz(timezone)
      return { start, end, label: `This month (${monthLabel(start, timezone)})` }
    }
  }
}

function monthLabel(start: Date, timezone: string): string {
  return formatInTz(start, timezone, { month: 'long', year: 'numeric' })
}
