import { describe, it, expect } from 'vitest'
import { reminderFireDate } from '@/lib/reminders'

// Pins the chore/document/bill reminder timezone off-by-one found in
// FINANCE_AUDIT §5. The reminder cron runs at 08:00 UTC (= 18:00 Sydney) and
// previously used `now.setHours(0,0,0,0)` (UTC midnight on a UTC server) plus
// `dueDate.setHours(0,0,0,0)`. That floored a due date stored as LOCAL midnight
// (…T14:00:00Z for Sydney) back to the prior UTC date, firing the reminder one
// calendar day too early. reminderFireDate computes the fire date in the
// family's local timezone and is robust to BOTH storage conventions in the DB.

const SYD = 'Australia/Sydney'

describe('reminderFireDate — local-tz reminder day (FINANCE_AUDIT §5)', () => {
  it('local-midnight due date (…T14:00Z) fires N days before the LOCAL due date', () => {
    // 2026-06-03T14:00Z = Sydney 2026-06-04; 1 day before = Sydney 2026-06-03.
    // The old setHours logic fired on 2026-06-02 — one day early.
    expect(reminderFireDate(new Date('2026-06-03T14:00:00.000Z'), SYD, 1)).toBe('2026-06-03')
  })

  it('UTC-midnight due date (…T00:00Z, legacy) is unaffected and still correct', () => {
    // 2026-07-08T00:00Z = Sydney 2026-07-08; 1 day before = 2026-07-07.
    expect(reminderFireDate(new Date('2026-07-08T00:00:00.000Z'), SYD, 1)).toBe('2026-07-07')
  })

  it('bill reminderDays=3 against a UTC-midnight due date', () => {
    expect(reminderFireDate(new Date('2026-06-06T00:00:00.000Z'), SYD, 3)).toBe('2026-06-03')
  })

  it('handles month rollover when subtracting days', () => {
    // Sydney due 2026-03-01, remind 1 day before → 2026-02-28.
    expect(reminderFireDate(new Date('2026-03-01T00:00:00.000Z'), SYD, 1)).toBe('2026-02-28')
  })

  it('handles zero daysBefore (remind on the due date itself)', () => {
    expect(reminderFireDate(new Date('2026-06-03T14:00:00.000Z'), SYD, 0)).toBe('2026-06-04')
  })
})
