import { describe, it, expect } from 'vitest'
import { localMidnightToUtc, addLocalDays, eachDayInTz, dateStringInTz } from '@/lib/timezone'

// Regression: navigating the calendar past August 2026 froze the browser.
// localMidnightToUtc sampled the zone offset at NOON UTC of the target day; on
// the spring-forward day (4 Oct 2026, 2am AEST → 3am AEDT) noon UTC is already
// AEDT (+11) while local midnight is still AEST (+10), so it returned 23:00 of
// 3 Oct local — a day BACKWARDS. addLocalDays could then never step past 3 Oct
// and eachDayInTz (which builds the September month grid ending Sat 3 Oct /
// Sun 4 Oct) looped forever.
const TZ = 'Australia/Sydney'

describe('localMidnightToUtc — DST transition days', () => {
  it('resolves midnight on the spring-forward day (4 Oct 2026) with the pre-transition offset', () => {
    // 00:00 on 4 Oct is still AEST (+10) — the jump happens at 2am.
    expect(localMidnightToUtc('2026-10-04', TZ).toISOString()).toBe('2026-10-03T14:00:00.000Z')
  })

  it('resolves midnight on the fall-back day (5 Apr 2026) with the pre-transition offset', () => {
    // 00:00 on 5 Apr is still AEDT (+11) — the fall-back happens at 3am.
    expect(localMidnightToUtc('2026-04-05', TZ).toISOString()).toBe('2026-04-04T13:00:00.000Z')
  })

  it('is unchanged on ordinary days', () => {
    expect(localMidnightToUtc('2026-06-01', TZ).toISOString()).toBe('2026-05-31T14:00:00.000Z') // AEST
    expect(localMidnightToUtc('2026-01-01', TZ).toISOString()).toBe('2025-12-31T13:00:00.000Z') // AEDT
  })
})

describe('addLocalDays — steps across the spring-forward boundary', () => {
  it('advances 3 Oct → 4 Oct 2026 (previously stuck, causing the infinite loop)', () => {
    const oct3 = localMidnightToUtc('2026-10-03', TZ)
    const oct4 = addLocalDays(oct3, 1, TZ)
    expect(dateStringInTz(oct4, TZ)).toBe('2026-10-04')
  })
})

describe('eachDayInTz — terminates across the DST boundary', () => {
  it('builds the September 2026 month grid (ends in early October) without looping', () => {
    // Sunday-start grid for September 2026: Sun 30 Aug – Sat 3 Oct (35 days).
    const days = eachDayInTz(
      localMidnightToUtc('2026-08-30', TZ),
      localMidnightToUtc('2026-10-03', TZ),
      TZ,
    )
    expect(days).toHaveLength(35)
    expect(dateStringInTz(days[0], TZ)).toBe('2026-08-30')
    expect(dateStringInTz(days[34], TZ)).toBe('2026-10-03')
  })

  it('spans the transition day itself exactly once', () => {
    const days = eachDayInTz(
      localMidnightToUtc('2026-10-01', TZ),
      localMidnightToUtc('2026-10-07', TZ),
      TZ,
    )
    expect(days.map(d => dateStringInTz(d, TZ))).toEqual([
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
    ])
  })
})
