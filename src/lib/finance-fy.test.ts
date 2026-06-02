import { describe, it, expect } from 'vitest'
import {
  fyColumnYearMonth,
  fyColumnMonthKey,
  monthRangeInTz,
  fyDateRangeInTz,
  fyMonthIndexInTz,
} from '@/lib/finance-fy'
import { localMidnightToUtc } from '@/lib/timezone'

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

describe('FY window is timezone-aware at the boundary (tax-report + Annual P&L batch)', () => {
  // The Australian FY 2025-26 runs 1 Jul 2025 → 30 Jun 2026 in Sydney local time.
  // The server runs in UTC, so the window must be anchored to the family tz, not
  // UTC midnight — otherwise entries within the UTC offset of the boundary (Sydney
  // is UTC+10) fall into the wrong financial year, or are dropped from the report.
  const TZ_SYD = 'Australia/Sydney'
  const { start, end } = fyDateRangeInTz(2025, 7, TZ_SYD)

  it('FY start = Sydney midnight 1 Jul = 2025-06-30T14:00:00Z (NOT 2025-07-01T00:00Z)', () => {
    expect(start.toISOString()).toBe('2025-06-30T14:00:00.000Z')
  })

  it('FY end = Sydney 23:59:59.999 on 30 Jun = 2026-06-30T13:59:59.999Z', () => {
    expect(end.toISOString()).toBe('2026-06-30T13:59:59.999Z')
  })

  it('REGRESSION (tax-report Bug A): an entry on the last FY day after Sydney 10:00 stays IN the FY', () => {
    // 2026-06-30T05:00Z = 15:00 Sydney on the final FY day — a real in-FY entry.
    const lastDayTimed = new Date('2026-06-30T05:00:00.000Z')
    expect(lastDayTimed.getTime()).toBeLessThanOrEqual(end.getTime())
    // The old UTC-midnight upper bound (new Date('2026-06-30')) WOULD have dropped it:
    expect(lastDayTimed.getTime()).toBeGreaterThan(new Date('2026-06-30').getTime())
  })

  it('REGRESSION (batch Bug B): rangeEnd = localMidnightToUtc + 1 day − 1ms covers the whole last FY day', () => {
    // This pins the exact expression used in /api/finance/pnl/batch.
    const rangeEnd = new Date(localMidnightToUtc('2026-06-30', TZ_SYD).getTime() + 86_400_000 - 1)
    expect(rangeEnd.toISOString()).toBe('2026-06-30T13:59:59.999Z')
    const lastDayTimed = new Date('2026-06-30T05:00:00.000Z')
    expect(lastDayTimed.getTime()).toBeLessThanOrEqual(rangeEnd.getTime())
  })
})

describe('fyMonthIndexInTz — Annual P&L export buckets each entry by its Sydney month', () => {
  // The Excel / print / email export builders (financeReport.ts) place each posted
  // journal line into an FY month column. That bucketing must use the family tz, not
  // the server's UTC month — otherwise an entry stored late in a UTC day lands one
  // month early (or in the wrong FY) on the exported report.
  // FY 2025-26, July start → month indices: Jul=0, Aug=1 … May=10, Jun=11.

  it('buckets clean mid-month entries into their own month', () => {
    expect(fyMonthIndexInTz(new Date('2025-07-15T00:00:00Z'), 2025, 7, TZ)).toBe(0)  // Jul
    expect(fyMonthIndexInTz(new Date('2026-05-15T00:00:00Z'), 2025, 7, TZ)).toBe(10) // May
  })

  it('REGRESSION: 2026-05-31T15:00Z is 1 Jun 01:00 Sydney → June (11), not May (10)', () => {
    // A UTC-naive month read of this instant says May; in Sydney it is already June.
    expect(fyMonthIndexInTz(new Date('2026-05-31T15:00:00.000Z'), 2025, 7, TZ)).toBe(11)
  })

  it('REGRESSION: FY start boundary is decided in Sydney days', () => {
    // 2025-06-30T15:00Z = 1 Jul 01:00 Sydney → first day of FY 2025-26 → Jul (0).
    expect(fyMonthIndexInTz(new Date('2025-06-30T15:00:00.000Z'), 2025, 7, TZ)).toBe(0)
    // 2025-06-30T13:00Z = 30 Jun 23:00 Sydney → still last FY → excluded (-1).
    expect(fyMonthIndexInTz(new Date('2025-06-30T13:00:00.000Z'), 2025, 7, TZ)).toBe(-1)
  })

  it('REGRESSION: FY end boundary is decided in Sydney days', () => {
    // 2026-06-30T05:00Z = 30 Jun 15:00 Sydney → last day of FY → Jun (11).
    expect(fyMonthIndexInTz(new Date('2026-06-30T05:00:00.000Z'), 2025, 7, TZ)).toBe(11)
    // 2026-06-30T15:00Z = 1 Jul 01:00 Sydney → next FY → excluded (-1).
    expect(fyMonthIndexInTz(new Date('2026-06-30T15:00:00.000Z'), 2025, 7, TZ)).toBe(-1)
  })
})
