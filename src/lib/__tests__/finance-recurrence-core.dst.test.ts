process.env.TZ = 'Australia/Sydney'

import { describe, it, expect } from 'vitest'
import { applyDayOfMonth, stepOccurrence } from '@/lib/finance-recurrence-core'

// DST regression guard for the date-fns → UTC-calendar stepping migration.
//
// The production container runs TZ=Australia/Sydney (Dockerfile/compose). The
// date-fns functions this module used (addMonths/addWeeks/addDays/setDate) step
// using the *runtime* timezone's wall clock. Recurrence/spawn dates are stored as
// UTC midnight (see utcMidnight). When the OLD code stepped a UTC-midnight AEST
// date (e.g. 2026-09-15T00:00:00Z) by one month under TZ=Sydney, it produced a
// local Oct-15 wall time that — Oct being AEDT (+11) — resolved to
// 2026-10-14T23:00:00Z, which utcMidnight then floored to **Oct 14**: one
// calendar day early across the early-October spring-forward boundary.
//
// The UTC-calendar steppers (addUtc*) operate on getUTC*/Date.UTC only, so the
// result is identical regardless of the ambient timezone. This file runs under
// TZ=Australia/Sydney, feeds true UTC-midnight inputs (Date.UTC) — exactly what
// the server feeds — and asserts the correct UTC-midnight outputs, proving the
// drift is gone (AGENTS.md §Timezone rule 9: test across DST boundaries).
//
// Australia/Sydney 2026/27 DST: starts Sun 4 Oct 2026 (+10→+11), ends Sun 5 Apr
// 2027 (+11→+10).
const iso = (d: Date | null) => (d == null ? null : d.toISOString())

describe('stepOccurrence — spring-forward (Sun 4 Oct 2026, +10→+11)', () => {
  it('monthly from an AEST source into AEDT lands on the same day-of-month (was Oct 14, now Oct 15)', () => {
    const from = new Date(Date.UTC(2026, 8, 15)) // 2026-09-15 UTC midnight
    expect(iso(stepOccurrence(from, 'monthly', 1, null, null))).toBe('2026-10-15T00:00:00.000Z')
  })

  it('monthly with dayOfMonth snap clamps in the target month across the boundary', () => {
    const from = new Date(Date.UTC(2026, 8, 30)) // 2026-09-30
    expect(iso(stepOccurrence(from, 'monthly', 1, 31, null))).toBe('2026-10-31T00:00:00.000Z')
  })

  it('weekly +7 across the Oct 4 boundary stays on UTC midnight', () => {
    const from = new Date(Date.UTC(2026, 9, 1)) // 2026-10-01 (before transition)
    expect(iso(stepOccurrence(from, 'weekly', 1, null, null))).toBe('2026-10-08T00:00:00.000Z')
  })

  it('fortnightly +14 across the boundary stays on UTC midnight', () => {
    const from = new Date(Date.UTC(2026, 8, 28)) // 2026-09-28
    expect(iso(stepOccurrence(from, 'fortnightly', 1, null, null))).toBe('2026-10-12T00:00:00.000Z')
  })

  it('custom day-count step across the boundary stays on UTC midnight', () => {
    const from = new Date(Date.UTC(2026, 8, 30)) // 2026-09-30
    expect(iso(stepOccurrence(from, 'custom', 10, null, null))).toBe('2026-10-10T00:00:00.000Z')
  })

  it('quarterly from before the boundary lands on the correct day in AEDT', () => {
    const from = new Date(Date.UTC(2026, 6, 15)) // 2026-07-15
    expect(iso(stepOccurrence(from, 'quarterly', 1, null, null))).toBe('2026-10-15T00:00:00.000Z')
  })
})

describe('stepOccurrence — fall-back (Sun 5 Apr 2027, +11→+10)', () => {
  it('monthly from an AEDT source into AEST lands on the same day-of-month', () => {
    const from = new Date(Date.UTC(2027, 2, 15)) // 2027-03-15 (AEDT)
    expect(iso(stepOccurrence(from, 'monthly', 1, null, null))).toBe('2027-04-15T00:00:00.000Z')
  })

  it('weekly +7 across the Apr 5 boundary stays on UTC midnight', () => {
    const from = new Date(Date.UTC(2027, 3, 1)) // 2027-04-01
    expect(iso(stepOccurrence(from, 'weekly', 1, null, null))).toBe('2027-04-08T00:00:00.000Z')
  })
})

describe('stepOccurrence — yearly is timezone-independent', () => {
  it('yearly preserves month/day across a year that spans both DST transitions', () => {
    const from = new Date(Date.UTC(2026, 8, 15)) // 2026-09-15
    expect(iso(stepOccurrence(from, 'yearly', 1, null, null))).toBe('2027-09-15T00:00:00.000Z')
  })

  it('yearly with monthOfYear resets the day to the 1st (server semantics) under TZ=Sydney', () => {
    const from = new Date(Date.UTC(2026, 8, 15))
    expect(iso(stepOccurrence(from, 'yearly', 1, null, 3))).toBe('2027-03-01T00:00:00.000Z')
  })
})

describe('applyDayOfMonth is timezone-independent under TZ=Sydney', () => {
  it('clamps day 31 to non-leap February without drifting off UTC midnight', () => {
    expect(iso(applyDayOfMonth(new Date(Date.UTC(2026, 1, 10)), 31))).toBe('2026-02-28T00:00:00.000Z')
  })

  it('snaps within an AEDT month to UTC midnight', () => {
    // October is AEDT (+11); confirm the snap result is still UTC midnight.
    expect(iso(applyDayOfMonth(new Date(Date.UTC(2026, 9, 5)), 20))).toBe('2026-10-20T00:00:00.000Z')
  })
})
