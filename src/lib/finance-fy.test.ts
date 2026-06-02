import { describe, it, expect } from 'vitest'
import {
  fyColumnYearMonth,
  fyColumnMonthKey,
  monthRangeInTz,
  fyDateRangeInTz,
} from '@/lib/finance-fy'

const TZ = 'Australia/Sydney'

// These tests pin the two timezone bugs that caused a single bank-interest
// transaction (Unitrak MQ Savings, dated 2026-05) to appear in three months
// across the Monthly and Annual P&L. If either bug is reintroduced, a test fails.

describe('fyColumnYearMonth / fyColumnMonthKey — Annual P&L column → calendar month', () => {
  // Australian FY 2025-26: fyStartMonth = 7 (July), 1-based.
  it('maps each column to the correct month with no 1-based/0-based off-by-one', () => {
    expect(fyColumnYearMonth(2025, 7, 0)).toEqual({ year: 2025, month1: 7 })   // Jul
    expect(fyColumnYearMonth(2025, 7, 5)).toEqual({ year: 2025, month1: 12 })  // Dec
    expect(fyColumnYearMonth(2025, 7, 6)).toEqual({ year: 2026, month1: 1 })   // Jan (year rolls)
    expect(fyColumnYearMonth(2025, 7, 11)).toEqual({ year: 2026, month1: 6 })  // Jun (last column)
  })

  it('REGRESSION (Bug A): column 10 is May 2026, NOT April — the Unitrak interest bug', () => {
    expect(fyColumnYearMonth(2025, 7, 10)).toEqual({ year: 2026, month1: 5 })
    expect(fyColumnMonthKey(2025, 7, 10)).toBe('2026-05')
    // April is its own distinct column — the bug made May data read the April key.
    expect(fyColumnMonthKey(2025, 7, 9)).toBe('2026-04')
  })

  it('handles a January-start (calendar-year) FY without drift', () => {
    expect(fyColumnMonthKey(2025, 1, 0)).toBe('2025-01')
    expect(fyColumnMonthKey(2025, 1, 11)).toBe('2025-12')
  })
})

describe('Monthly P&L windows partition the FY exactly — no overlap, no gap, no omission', () => {
  // The 12 month windows must tile the whole FY: any overlap double-counts a
  // transaction on a boundary day (Bug B); any gap omits one. Verified against the
  // tz-aware boundary helpers, including the Oct/Apr DST transitions in Sydney.
  const windows = Array.from({ length: 12 }, (_, col) => {
    const { year, month1 } = fyColumnYearMonth(2025, 7, col)
    return monthRangeInTz(year, month1, TZ)
  })
  const fy = fyDateRangeInTz(2025, 7, TZ)

  it('first window starts at FY start; last window ends at FY end (exhaustive)', () => {
    expect(windows[0].start.getTime()).toBe(fy.start.getTime())
    expect(windows[11].end.getTime()).toBe(fy.end.getTime())
  })

  it('REGRESSION (Bug B): each window ends exactly 1ms before the next begins (contiguous, non-overlapping)', () => {
    for (let i = 0; i < 11; i++) {
      expect(windows[i + 1].start.getTime() - windows[i].end.getTime()).toBe(1)
    }
  })

  it('every window is well-formed (start strictly before end)', () => {
    for (const w of windows) expect(w.start.getTime()).toBeLessThan(w.end.getTime())
  })
})
