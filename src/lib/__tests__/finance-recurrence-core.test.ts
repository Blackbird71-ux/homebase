process.env.TZ = 'UTC'

import { describe, it, expect } from 'vitest'
import { applyDayOfMonth, stepOccurrence } from '@/lib/finance-recurrence-core'

// All dates are constructed with new Date(year, monthIndex, day); with TZ=UTC
// these are UTC midnight, so toISOString() is a precise, readable assertion.
const iso = (d: Date | null) => (d == null ? null : d.toISOString())

describe('applyDayOfMonth', () => {
  it('snaps to the target day within the month', () => {
    expect(iso(applyDayOfMonth(new Date(2026, 0, 15), 5))).toBe('2026-01-05T00:00:00.000Z')
    expect(iso(applyDayOfMonth(new Date(2026, 0, 15), 31))).toBe('2026-01-31T00:00:00.000Z')
  })

  it('clamps to the last day of a short month (non-leap Feb)', () => {
    expect(iso(applyDayOfMonth(new Date(2026, 1, 10), 31))).toBe('2026-02-28T00:00:00.000Z')
  })

  it('clamps to the last day of a leap February', () => {
    expect(iso(applyDayOfMonth(new Date(2028, 1, 10), 31))).toBe('2028-02-29T00:00:00.000Z')
  })

  it('clamps out-of-range targets to the valid 1–maxDay range', () => {
    expect(iso(applyDayOfMonth(new Date(2026, 0, 15), 0))).toBe('2026-01-01T00:00:00.000Z')
    expect(iso(applyDayOfMonth(new Date(2026, 0, 15), 100))).toBe('2026-01-31T00:00:00.000Z')
  })
})

describe('stepOccurrence — non-monthly frequencies (no snapping)', () => {
  const from = new Date(2026, 0, 15) // 2026-01-15

  it('weekly steps interval weeks', () => {
    expect(iso(stepOccurrence(from, 'weekly', 1, null, null))).toBe('2026-01-22T00:00:00.000Z')
    expect(iso(stepOccurrence(from, 'weekly', 2, null, null))).toBe('2026-01-29T00:00:00.000Z')
  })

  it('fortnightly steps 2× interval weeks', () => {
    expect(iso(stepOccurrence(from, 'fortnightly', 1, null, null))).toBe('2026-01-29T00:00:00.000Z')
  })

  it('custom steps interval days', () => {
    expect(iso(stepOccurrence(from, 'custom', 10, null, null))).toBe('2026-01-25T00:00:00.000Z')
  })

  it('does not snap weekly even when dayOfMonth is set', () => {
    expect(iso(stepOccurrence(from, 'weekly', 1, 1, null))).toBe('2026-01-22T00:00:00.000Z')
  })
})

describe('stepOccurrence — monthly family', () => {
  const from = new Date(2026, 0, 15) // 2026-01-15

  it('monthly steps interval months with no snap', () => {
    expect(iso(stepOccurrence(from, 'monthly', 1, null, null))).toBe('2026-02-15T00:00:00.000Z')
  })

  it('monthly snaps to dayOfMonth', () => {
    expect(iso(stepOccurrence(from, 'monthly', 1, 20, null))).toBe('2026-02-20T00:00:00.000Z')
  })

  it('monthly dayOfMonth clamps to a short month', () => {
    expect(iso(stepOccurrence(from, 'monthly', 1, 31, null))).toBe('2026-02-28T00:00:00.000Z')
  })

  it('bimonthly / quarterly / halfyearly step the right number of months', () => {
    expect(iso(stepOccurrence(from, 'bimonthly', 1, null, null))).toBe('2026-03-15T00:00:00.000Z')
    expect(iso(stepOccurrence(from, 'quarterly', 1, null, null))).toBe('2026-04-15T00:00:00.000Z')
    expect(iso(stepOccurrence(from, 'halfyearly', 1, null, null))).toBe('2026-07-15T00:00:00.000Z')
  })
})

describe('stepOccurrence — yearly', () => {
  const from = new Date(2026, 0, 15) // 2026-01-15

  it('yearly with no monthOfYear keeps the from month/day', () => {
    expect(iso(stepOccurrence(from, 'yearly', 1, null, null))).toBe('2027-01-15T00:00:00.000Z')
  })

  it('yearly with monthOfYear resets the day to the 1st (server semantics)', () => {
    expect(iso(stepOccurrence(from, 'yearly', 1, null, 3))).toBe('2027-03-01T00:00:00.000Z')
  })

  it('yearly with monthOfYear + dayOfMonth lands on that month and day', () => {
    expect(iso(stepOccurrence(from, 'yearly', 1, 15, 3))).toBe('2027-03-15T00:00:00.000Z')
  })

  it('yearly with monthOfYear + dayOfMonth clamps to the month length', () => {
    // February target, day 31 → clamps to Feb 28 (2027 is not a leap year)
    expect(iso(stepOccurrence(from, 'yearly', 1, 31, 2))).toBe('2027-02-28T00:00:00.000Z')
  })
})

describe('stepOccurrence — unknown frequency', () => {
  it('returns null for an unrecognised frequency', () => {
    expect(stepOccurrence(new Date(2026, 0, 15), 'banana', 1, null, null)).toBeNull()
  })
})
