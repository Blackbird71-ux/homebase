import {
  fyLabel, fyStartYearInTz,
  monthRangeInTz, quarterRangeInTz, fyDateRangeInTz,
} from '@/lib/finance-fy'
import { DEFAULT_TIMEZONE, dateStringInTz, addMonthsInTz, formatInTz } from '@/lib/timezone'

export type PeriodMode = 'month' | 'quarter' | 'year'

/**
 * Convert a recurring amount to the total for a given period length.
 * Weekly and fortnightly are annualised to a per-month rate first.
 */
export function toPeriodAmount(amount: number, frequency: string, periodMonths: number): number {
  let tpm: number
  if (frequency === 'weekly')           tpm = 52 / 12
  else if (frequency === 'fortnightly') tpm = 26 / 12
  else                                   tpm = 1
  return amount * tpm * periodMonths
}

/** Returns true for frequencies that represent a single annual-ish payment rather than a repeating one. */
export function isLumpSum(frequency: string): boolean {
  return frequency === 'yearly' || frequency === 'halfyearly' || frequency === 'quarterly'
}

/**
 * Return the start/end dates and display label for a period mode centred on
 * anchor, with all boundaries computed in the family's IANA timezone.
 *
 * `start`/`end` are UTC instants corresponding to 00:00:00 (start) and
 * 23:59:59.999 (end) in `timezone` — the end is INCLUSIVE end-of-day, matching
 * the date-fns endOfMonth/endOfQuarter semantics this replaced (consumers compare
 * `<= end.getTime()`). The anchor's own calendar position is read in `timezone`.
 */
export function getPeriodBounds(
  mode: PeriodMode,
  anchor: Date,
  fyStartMonth: number = 7,
  timezone: string = DEFAULT_TIMEZONE,
): { start: Date; end: Date; label: string } {
  const [year, month1] = dateStringInTz(anchor, timezone).split('-').map(Number)
  if (mode === 'month') {
    const { start, end } = monthRangeInTz(year, month1, timezone)
    return { start, end, label: formatInTz(start, timezone, { month: 'long', year: 'numeric' }) }
  }
  if (mode === 'quarter') {
    const { start, end } = quarterRangeInTz(year, month1, timezone)
    const q = Math.floor((month1 - 1) / 3) + 1
    return { start, end, label: `Q${q} ${year}` }
  }
  const fYear = fyStartYearInTz(anchor, fyStartMonth, timezone)
  const { start, end } = fyDateRangeInTz(fYear, fyStartMonth, timezone)
  return { start, end, label: fyLabel(fYear, fyStartMonth) }
}

/** Move the anchor date forward or backward by one period unit, in the family tz. */
export function navigateAnchor(
  mode: PeriodMode,
  anchor: Date,
  dir: -1 | 1,
  timezone: string = DEFAULT_TIMEZONE,
): Date {
  const months = mode === 'month' ? 1 : mode === 'quarter' ? 3 : 12
  return addMonthsInTz(anchor, dir * months, timezone)
}
