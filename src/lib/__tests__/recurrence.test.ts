import { describe, it, expect } from 'vitest'
import { generateRecurrenceInstances } from '@/lib/recurrence'
import { getLocalHourMinute, dateStringInTz, localMidnightToUtc } from '@/lib/timezone'

// HomeBase family timezone. Australian DST transitions in 2026 (always a Sunday):
//   - fall back:    2026-04-05 03:00 AEDT (UTC+11) → 02:00 AEST (UTC+10)
//   - spring forward: 2026-10-04 02:00 AEST (UTC+10) → 03:00 AEDT (UTC+11)
// The bug these tests guard: stepping a recurring event's start in server UTC
// (old date-fns addDays/addMonths/addYears) drifts its wall-clock ±1h after a
// transition. The tz-aware steppers must keep a 9am event at 9am every day.
const TZ = 'Australia/Sydney'
const HOUR = 60 * 60 * 1000

/** local hour in TZ for an instant */
const localHour = (d: Date) => getLocalHourMinute(d.toISOString(), TZ).hour
const localMinute = (d: Date) => getLocalHourMinute(d.toISOString(), TZ).minute
/** local weekday (0=Sun..6=Sat) in TZ for an instant */
function localDow(d: Date): number {
  const [y, m, day] = dateStringInTz(d, TZ).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay()
}
/** local day-of-month in TZ */
const localDom = (d: Date) => Number(dateStringInTz(d, TZ).split('-')[2])

describe('generateRecurrenceInstances — wall-clock stability across Australian DST', () => {
  it('DAILY keeps 9am across the April fall-back transition', () => {
    // 09:00 Sydney on 2 Apr 2026 (AEDT, UTC+11) = 2026-04-01T22:00:00Z
    const start = new Date('2026-04-01T22:00:00Z')
    expect(localHour(start)).toBe(9) // anchor sanity
    const end = new Date(start.getTime() + HOUR)
    const instances = generateRecurrenceInstances(
      start, end, 'FREQ=DAILY;COUNT=6', null,
      new Date('2026-03-01T00:00:00Z'), new Date('2026-05-01T00:00:00Z'), TZ,
    )
    expect(instances).toHaveLength(6) // Apr 2,3,4,5,6,7 — straddles 5 Apr
    for (const inst of instances) {
      expect(localHour(inst.start)).toBe(9)
      expect(localMinute(inst.start)).toBe(0)
    }
  })

  it('DAILY keeps 9am across the October spring-forward transition', () => {
    // 09:00 Sydney on 1 Oct 2026 (AEST, UTC+10) = 2026-09-30T23:00:00Z
    const start = new Date('2026-09-30T23:00:00Z')
    expect(localHour(start)).toBe(9)
    const end = new Date(start.getTime() + HOUR)
    const instances = generateRecurrenceInstances(
      start, end, 'FREQ=DAILY;COUNT=6', null,
      new Date('2026-09-01T00:00:00Z'), new Date('2026-11-15T00:00:00Z'), TZ,
    )
    expect(instances).toHaveLength(6) // Oct 1..6 — straddles 4 Oct
    for (const inst of instances) {
      expect(localHour(inst.start)).toBe(9)
      expect(localMinute(inst.start)).toBe(0)
    }
  })

  it('WEEKLY (no BYDAY) keeps 9am when a step crosses the October transition', () => {
    // 09:00 Sydney on Wed 23 Sep 2026 (AEST) = 2026-09-22T23:00:00Z → 23,30 Sep, 7,14 Oct
    const start = new Date('2026-09-22T23:00:00Z')
    expect(localHour(start)).toBe(9)
    const end = new Date(start.getTime() + HOUR)
    const instances = generateRecurrenceInstances(
      start, end, 'FREQ=WEEKLY;COUNT=4', null,
      new Date('2026-09-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'), TZ,
    )
    expect(instances).toHaveLength(4)
    for (const inst of instances) expect(localHour(inst.start)).toBe(9)
  })

  it('MONTHLY keeps 9am when a step crosses the October transition', () => {
    // 09:00 Sydney on 15 Sep 2026 (AEST) = 2026-09-14T23:00:00Z → 15 Sep/Oct/Nov/Dec
    const start = new Date('2026-09-14T23:00:00Z')
    expect(localHour(start)).toBe(9)
    const end = new Date(start.getTime() + HOUR)
    const instances = generateRecurrenceInstances(
      start, end, 'FREQ=MONTHLY;COUNT=4', null,
      new Date('2026-09-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'), TZ,
    )
    expect(instances).toHaveLength(4)
    for (const inst of instances) {
      expect(localHour(inst.start)).toBe(9)
      expect(localDom(inst.start)).toBe(15)
    }
  })

  it('WEEKLY+BYDAY keeps 9am on the correct weekdays across the October transition', () => {
    // anchor Mon 21 Sep 2026 09:00 (AEST) = 2026-09-20T23:00:00Z, BYDAY=MO,WE,FR
    const start = new Date('2026-09-20T23:00:00Z')
    expect(localHour(start)).toBe(9)
    expect(localDow(start)).toBe(1) // Monday
    const end = new Date(start.getTime() + HOUR)
    const instances = generateRecurrenceInstances(
      start, end, 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=9', null,
      new Date('2026-09-20T00:00:00Z'), new Date('2026-10-12T00:00:00Z'), TZ,
    )
    expect(instances).toHaveLength(9) // Sep 21,23,25,28,30; Oct 2,5,7,9 — straddles 4 Oct
    for (const inst of instances) {
      expect(localHour(inst.start)).toBe(9)
      expect([1, 3, 5]).toContain(localDow(inst.start)) // Mon/Wed/Fri only
    }
  })
})

describe('generateRecurrenceInstances — calendar clamping (matches date-fns running-date semantics)', () => {
  it('MONTHLY from the 31st clamps to the short month and steps from the clamped date', () => {
    // 09:00 Sydney on 31 Jan 2026 (AEDT) = 2026-01-30T22:00:00Z
    const start = new Date('2026-01-30T22:00:00Z')
    expect(localHour(start)).toBe(9)
    expect(localDom(start)).toBe(31)
    const end = new Date(start.getTime() + HOUR)
    const instances = generateRecurrenceInstances(
      start, end, 'FREQ=MONTHLY;COUNT=3', null,
      new Date('2026-01-01T00:00:00Z'), new Date('2026-05-01T00:00:00Z'), TZ,
    )
    // Jan 31 → Feb 28 (clamp) → Mar 28 (steps from the clamped 28th, like date-fns addMonths)
    expect(instances.map(i => localDom(i.start))).toEqual([31, 28, 28])
    for (const inst of instances) expect(localHour(inst.start)).toBe(9)
  })

  it('YEARLY from 29 Feb clamps to 28 Feb in non-leap years', () => {
    // 09:00 Sydney on 29 Feb 2028 (leap, AEDT) = 2028-02-28T22:00:00Z
    const start = new Date('2028-02-28T22:00:00Z')
    expect(localHour(start)).toBe(9)
    expect(localDom(start)).toBe(29)
    const end = new Date(start.getTime() + HOUR)
    const instances = generateRecurrenceInstances(
      start, end, 'FREQ=YEARLY;COUNT=3', null,
      new Date('2028-01-01T00:00:00Z'), new Date('2031-01-01T00:00:00Z'), TZ,
    )
    expect(instances.map(i => localDom(i.start))).toEqual([29, 28, 28]) // 2028 leap, 2029/2030 not
    for (const inst of instances) expect(localHour(inst.start)).toBe(9)
  })
})

describe('generateRecurrenceInstances — open-ended series stay bounded to the window', () => {
  // Guards the window-end break: an open-ended series (no COUNT, no end date)
  // must emit exactly the in-window occurrences — not up to `maxInstances`
  // far-future ones — and the early stop must not drop any valid instance.
  it('YEARLY with no COUNT/end date emits only in-window occurrences', () => {
    // 09:00 Sydney on 1 Jan 2026 (AEDT) = 2025-12-31T22:00:00Z, open-ended yearly.
    const start = new Date('2025-12-31T22:00:00Z')
    const end = new Date(start.getTime() + HOUR)

    // A 30-day mid-2026 window contains no Jan-1 occurrence.
    const none = generateRecurrenceInstances(
      start, end, 'FREQ=YEARLY', null,
      new Date('2026-06-09T00:00:00Z'), new Date('2026-07-09T00:00:00Z'), TZ,
    )
    expect(none).toHaveLength(0)

    // A window spanning two New Years contains exactly two occurrences.
    const two = generateRecurrenceInstances(
      start, end, 'FREQ=YEARLY', null,
      new Date('2025-12-01T00:00:00Z'), new Date('2027-02-01T00:00:00Z'), TZ,
    )
    expect(two).toHaveLength(2)
    for (const inst of two) expect(localDom(inst.start)).toBe(1)
  })

  it('open-ended MONTHLY only emits occurrences inside the window', () => {
    const start = new Date('2026-01-14T22:00:00Z') // 15 Jan 2026 09:00 Sydney
    const end = new Date(start.getTime() + HOUR)
    const rangeStart = new Date('2026-06-09T00:00:00Z')
    const rangeEnd = new Date('2026-07-09T00:00:00Z')
    const inst = generateRecurrenceInstances(
      start, end, 'FREQ=MONTHLY', null, rangeStart, rangeEnd, TZ,
    )
    expect(inst).toHaveLength(1) // only the 15 Jun occurrence
    for (const i of inst) {
      expect(i.start.getTime()).toBeGreaterThanOrEqual(rangeStart.getTime())
      expect(i.start.getTime()).toBeLessThan(rangeEnd.getTime())
      expect(localDom(i.start)).toBe(15)
    }
  })
})

describe('generateRecurrenceInstances — open-ended series whose start is far before the window', () => {
  // Regression for the maxInstances-exhaustion bug: an open-ended (no COUNT, no
  // end date) series whose start is more than `maxInstances` (365) occurrences
  // before the view window used to exhaust the safety budget *before* reaching the
  // window and emit nothing — silently dropping real events. The fast-forward must
  // jump the cursor to the window so the in-window occurrences are emitted, while
  // leaving wall-clock, weekday and clamping semantics unchanged.
  const winStart = localMidnightToUtc('2026-06-09', TZ) // local-midnight bounds → clean counts
  const winEnd = localMidnightToUtc('2026-07-09', TZ)

  it('DAILY started ~2.4 years before the window still emits every in-window day at 9am', () => {
    // 09:00 Sydney on 1 Jan 2024 (AEDT) = 2023-12-31T22:00:00Z — ~888 days before the window.
    const start = new Date('2023-12-31T22:00:00Z')
    expect(localHour(start)).toBe(9)
    const end = new Date(start.getTime() + HOUR)
    const inst = generateRecurrenceInstances(start, end, 'FREQ=DAILY', null, winStart, winEnd, TZ)
    // 9 Jun..8 Jul 2026 inclusive = 30 days. Before the fix this was 0 (budget exhausted).
    expect(inst).toHaveLength(30)
    expect(localDom(inst[0].start)).toBe(9)
    for (const i of inst) {
      expect(localHour(i.start)).toBe(9)
      expect(i.start.getTime()).toBeGreaterThanOrEqual(winStart.getTime())
      expect(i.start.getTime()).toBeLessThan(winEnd.getTime())
    }
  })

  it('WEEKLY started ~2.4 years before the window still emits the correct weekday at 9am', () => {
    // 1 Jan 2024 was a Monday; 09:00 Sydney = 2023-12-31T22:00:00Z.
    const start = new Date('2023-12-31T22:00:00Z')
    expect(localDow(start)).toBe(1) // Monday
    const end = new Date(start.getTime() + HOUR)
    const inst = generateRecurrenceInstances(start, end, 'FREQ=WEEKLY', null, winStart, winEnd, TZ)
    expect(inst).toHaveLength(4) // Mondays 15, 22, 29 Jun and 6 Jul 2026
    for (const i of inst) {
      expect(localDow(i.start)).toBe(1)
      expect(localHour(i.start)).toBe(9)
    }
  })

  it('MONTHLY from the 31st keeps the clamped day-of-month after fast-forwarding to the window', () => {
    // 09:00 Sydney on 31 Jan 2026 (AEDT) = 2026-01-30T22:00:00Z. The running date
    // clamps Jan31→Feb28 and stays on 28 thereafter, so the June occurrence is 28
    // (a closed-form month jump would wrongly yield 30/31 — this guards the choice
    // to *step* MONTHLY/YEARLY in the fast-forward).
    const start = new Date('2026-01-30T22:00:00Z')
    expect(localDom(start)).toBe(31)
    const end = new Date(start.getTime() + HOUR)
    const inst = generateRecurrenceInstances(start, end, 'FREQ=MONTHLY', null, winStart, winEnd, TZ)
    expect(inst).toHaveLength(1) // 28 Jun 2026
    expect(localDom(inst[0].start)).toBe(28)
    expect(localHour(inst[0].start)).toBe(9)
  })

  it('does NOT fast-forward a COUNT series: an ended series emits nothing in a later window', () => {
    // DAILY COUNT=5 from 1 Jan 2026 ends on 5 Jan — a June window must be empty.
    // (If the fast-forward ignored COUNT it would extend the series and emit June
    // occurrences.) 09:00 Sydney on 1 Jan 2026 = 2025-12-31T22:00:00Z.
    const start = new Date('2025-12-31T22:00:00Z')
    const end = new Date(start.getTime() + HOUR)
    const inst = generateRecurrenceInstances(start, end, 'FREQ=DAILY;COUNT=5', null, winStart, winEnd, TZ)
    expect(inst).toHaveLength(0)
  })
})

describe('generateRecurrenceInstances — baseline (no DST involved)', () => {
  it('DAILY in June produces consecutive 9am instances with preserved duration', () => {
    // 09:00 Sydney on 1 Jun 2026 (AEST) = 2026-05-31T23:00:00Z
    const start = new Date('2026-05-31T23:00:00Z')
    const end = new Date(start.getTime() + 90 * 60 * 1000) // 90-minute event
    const instances = generateRecurrenceInstances(
      start, end, 'FREQ=DAILY;COUNT=5', null,
      new Date('2026-05-01T00:00:00Z'), new Date('2026-07-01T00:00:00Z'), TZ,
    )
    expect(instances).toHaveLength(5)
    const days = instances.map(i => localDom(i.start))
    expect(days).toEqual([1, 2, 3, 4, 5])
    for (const inst of instances) {
      expect(localHour(inst.start)).toBe(9)
      expect(inst.end.getTime() - inst.start.getTime()).toBe(90 * 60 * 1000) // duration preserved
    }
  })
})
