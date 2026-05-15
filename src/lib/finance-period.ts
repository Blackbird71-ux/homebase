import {
  format,
  startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter,
  subMonths, addMonths,
  subQuarters, addQuarters,
  subYears, addYears,
  getQuarter, getYear,
} from 'date-fns'
import { fyStartYear, fyLabel, fyDateRange } from '@/lib/finance-fy'

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

/** Return the start/end dates and display label for a period mode centred on anchor. */
export function getPeriodBounds(
  mode: PeriodMode,
  anchor: Date,
  fyStartMonth: number = 7,
): { start: Date; end: Date; label: string } {
  if (mode === 'month')   return { start: startOfMonth(anchor),   end: endOfMonth(anchor),   label: format(anchor, 'MMMM yyyy') }
  if (mode === 'quarter') return { start: startOfQuarter(anchor), end: endOfQuarter(anchor), label: `Q${getQuarter(anchor)} ${getYear(anchor)}` }
  const fYear = fyStartYear(anchor, fyStartMonth)
  const { start, end } = fyDateRange(fYear, fyStartMonth)
  return { start, end, label: fyLabel(fYear, fyStartMonth) }
}

/** Move the anchor date forward or backward by one period unit. */
export function navigateAnchor(mode: PeriodMode, anchor: Date, dir: -1 | 1): Date {
  if (mode === 'month')   return dir === -1 ? subMonths(anchor, 1)   : addMonths(anchor, 1)
  if (mode === 'quarter') return dir === -1 ? subQuarters(anchor, 1) : addQuarters(anchor, 1)
  return dir === -1 ? subYears(anchor, 1) : addYears(anchor, 1)
}
