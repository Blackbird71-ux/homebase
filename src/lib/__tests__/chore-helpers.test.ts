process.env.TZ = 'UTC'

import { describe, it, expect } from 'vitest'
import { calculateNextDueDate, type ChoreForSchedule } from '@/lib/chore-helpers'

const TZ = 'Australia/Sydney' // UTC+10 (no DST around June)

function makeChore(overrides: Partial<ChoreForSchedule> = {}): ChoreForSchedule {
  return {
    frequency: 'weekly',
    dayOfWeek: null,
    daysOfWeek: null,
    dayOfMonth: null,
    triggerOnComplete: false,
    allowEarlyStart: false,
    startDate: null,
    endDate: null,
    nextDueDate: null,
    ...overrides,
  }
}

// nextDueDate is stored as the UTC instant of LOCAL midnight on the due day.
// For Sydney (UTC+10) the local midnight of 6 Jun 2026 is 2026-06-05T14:00:00Z.
function localMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+10:00`)
}

/** Render a stored nextDueDate back to its LOCAL calendar day (YYYY-MM-DD). */
function localDay(d: Date | null): string | null {
  return d ? d.toLocaleDateString('en-CA', { timeZone: TZ }) : null
}

describe('calculateNextDueDate — early completion (triggerOnComplete)', () => {
  // The reported bug: Check Lawn — weekly, Saturday, triggerOnComplete, early completion.
  // Due Sat 6 Jun, completed early Fri 5 Jun → next must be Sat 13 Jun, not Sat 6 Jun.
  it('weekly fixed-weekday: completing early rolls to the NEXT occurrence, not this one', () => {
    const chore = makeChore({
      frequency: 'weekly',
      dayOfWeek: 6, // Saturday
      triggerOnComplete: true,
      allowEarlyStart: true,
      nextDueDate: localMidnight('2026-06-06'), // Sat 6 Jun
    })
    const completedEarly = new Date('2026-06-05T08:00:00Z') // Fri 5 Jun ~18:00 Sydney
    expect(localDay(calculateNextDueDate(chore, completedEarly, TZ))).toBe('2026-06-13')
  })

  it('weekly fixed-weekday: completing ON the due day still floats to next week', () => {
    const chore = makeChore({
      frequency: 'weekly',
      dayOfWeek: 6,
      triggerOnComplete: true,
      nextDueDate: localMidnight('2026-06-06'),
    })
    const onTime = new Date('2026-06-06T02:00:00Z') // Sat 6 Jun 12:00 Sydney
    expect(localDay(calculateNextDueDate(chore, onTime, TZ))).toBe('2026-06-13')
  })

  it('weekly fixed-weekday: completing LATE floats from the completion day', () => {
    const chore = makeChore({
      frequency: 'weekly',
      dayOfWeek: 6,
      triggerOnComplete: true,
      nextDueDate: localMidnight('2026-06-06'),
    })
    const late = new Date('2026-06-08T02:00:00Z') // Mon 8 Jun Sydney → next Sat = 13 Jun
    expect(localDay(calculateNextDueDate(chore, late, TZ))).toBe('2026-06-13')
  })

  it('biweekly (floating): completing early advances 14 days from the completion day', () => {
    const chore = makeChore({
      frequency: 'biweekly',
      triggerOnComplete: true,
      allowEarlyStart: true,
      nextDueDate: localMidnight('2026-06-06'),
    })
    const completedEarly = new Date('2026-06-05T08:00:00Z') // Fri 5 Jun ~18:00 Sydney
    // Biweekly has no pinned calendar slot, so it floats from the completion
    // date: 5 Jun + 14 days = 19 Jun (NOT 6 Jun + 14 = 20 Jun). Rolling forward
    // from the due date would skip a day, the same defect as daily chores.
    expect(localDay(calculateNextDueDate(chore, completedEarly, TZ))).toBe('2026-06-19')
  })

  it('daily (floating): completing a day early advances one day, not two', () => {
    const chore = makeChore({
      frequency: 'daily',
      triggerOnComplete: true,
      allowEarlyStart: true,
      nextDueDate: localMidnight('2026-06-06'), // due Sat 6 Jun
    })
    const completedEarly = new Date('2026-06-05T09:00:00Z') // Fri 5 Jun ~19:00 Sydney
    // Must land on Sat 6 Jun (completion + 1), NOT Sun 7 Jun (due + 1).
    expect(localDay(calculateNextDueDate(chore, completedEarly, TZ))).toBe('2026-06-06')
  })

  it('biweekly: completing late advances 14 days from the completion day', () => {
    const chore = makeChore({
      frequency: 'biweekly',
      triggerOnComplete: true,
      nextDueDate: localMidnight('2026-06-06'),
    })
    const late = new Date('2026-06-09T08:00:00Z') // Tue 9 Jun Sydney
    expect(localDay(calculateNextDueDate(chore, late, TZ))).toBe('2026-06-23')
  })

  it('monthly with dayOfMonth: completing early advances one month from the due date', () => {
    const chore = makeChore({
      frequency: 'monthly',
      dayOfMonth: 15,
      triggerOnComplete: true,
      allowEarlyStart: true,
      nextDueDate: localMidnight('2026-06-15'),
    })
    const completedEarly = new Date('2026-06-10T08:00:00Z') // 10 Jun, before the 15th
    expect(localDay(calculateNextDueDate(chore, completedEarly, TZ))).toBe('2026-07-15')
  })

  it('overdue catch-up: anchors on completedAt, not the stale past due date', () => {
    // Due 30 May, completed 5 Jun (late). Must not stay stuck near 30 May.
    const chore = makeChore({
      frequency: 'weekly',
      dayOfWeek: 6,
      triggerOnComplete: true,
      nextDueDate: localMidnight('2026-05-30'), // Sat 30 May
    })
    const completed = new Date('2026-06-05T08:00:00Z') // Fri 5 Jun
    expect(localDay(calculateNextDueDate(chore, completed, TZ))).toBe('2026-06-06')
  })
})

describe('calculateNextDueDate — anchored schedule (triggerOnComplete=false) is unchanged', () => {
  it('weekly fixed-weekday: always advances from the scheduled due date', () => {
    const chore = makeChore({
      frequency: 'weekly',
      dayOfWeek: 6,
      triggerOnComplete: false,
      allowEarlyStart: true,
      nextDueDate: localMidnight('2026-06-06'),
    })
    // Early completion: still anchored on the due date → next Saturday.
    const completedEarly = new Date('2026-06-05T08:00:00Z')
    expect(localDay(calculateNextDueDate(chore, completedEarly, TZ))).toBe('2026-06-13')
  })

  it('monthly: completing late still schedules one month from the original due date', () => {
    const chore = makeChore({
      frequency: 'monthly',
      dayOfMonth: 15,
      triggerOnComplete: false,
      nextDueDate: localMidnight('2026-06-15'),
    })
    const late = new Date('2026-06-19T08:00:00Z') // 4 days late
    expect(localDay(calculateNextDueDate(chore, late, TZ))).toBe('2026-07-15')
  })
})

describe('calculateNextDueDate — one-off', () => {
  it('returns null (no next occurrence)', () => {
    const chore = makeChore({ frequency: 'one-off', triggerOnComplete: true })
    expect(calculateNextDueDate(chore, new Date('2026-06-05T08:00:00Z'), TZ)).toBeNull()
  })
})
