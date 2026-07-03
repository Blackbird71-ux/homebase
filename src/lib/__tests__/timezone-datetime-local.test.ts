import { describe, it, expect } from 'vitest'
import { toDateTimeLocalInTz, dateTimeLocalToUtc, shiftEndToPreserveDuration } from '@/lib/timezone'

// The datetime-local round-trip helpers power the event editor (EventModal):
// a UTC instant is rendered as a "YYYY-MM-DDTHH:mm" value in the family's tz,
// and the value the user edits is parsed back to a UTC instant in that tz —
// NOT the browser's. These must hold across both Australian DST regimes:
//   - AEST (UTC+10): Apr 5 → Oct 4 2026
//   - AEDT (UTC+11): Jan → Apr 5, and Oct 4 → Dec 2026
const TZ = 'Australia/Sydney'

describe('toDateTimeLocalInTz — render a UTC instant as a tz wall-clock value', () => {
  it('renders 9am AEST (UTC+10, June) wall-clock', () => {
    // 09:00 Sydney on 1 Jun 2026 (AEST) = 2026-05-31T23:00:00Z
    expect(toDateTimeLocalInTz(new Date('2026-05-31T23:00:00Z'), TZ)).toBe('2026-06-01T09:00')
  })

  it('renders 9am AEDT (UTC+11, January) wall-clock', () => {
    // 09:00 Sydney on 1 Jan 2026 (AEDT) = 2025-12-31T22:00:00Z
    expect(toDateTimeLocalInTz(new Date('2025-12-31T22:00:00Z'), TZ)).toBe('2026-01-01T09:00')
  })

  it('zero-pads single-digit hours and minutes', () => {
    // 08:05 Sydney on 1 Jun 2026 (AEST) = 2026-05-31T22:05:00Z
    expect(toDateTimeLocalInTz(new Date('2026-05-31T22:05:00Z'), TZ)).toBe('2026-06-01T08:05')
  })
})

describe('dateTimeLocalToUtc — parse a tz wall-clock value to its UTC instant', () => {
  it('parses 9am AEST (UTC+10) to the correct instant', () => {
    expect(dateTimeLocalToUtc('2026-06-01T09:00', TZ).toISOString()).toBe('2026-05-31T23:00:00.000Z')
  })

  it('parses 9am AEDT (UTC+11) to the correct instant', () => {
    expect(dateTimeLocalToUtc('2026-01-01T09:00', TZ).toISOString()).toBe('2025-12-31T22:00:00.000Z')
  })

  it('applies the correct offset on each side of the April fall-back (UTC+11 → UTC+10)', () => {
    // Day before the transition is AEDT (UTC+11); day after is AEST (UTC+10).
    const before = dateTimeLocalToUtc('2026-04-04T09:00', TZ) // AEDT
    const after = dateTimeLocalToUtc('2026-04-06T09:00', TZ)  // AEST
    expect(before.toISOString()).toBe('2026-04-03T22:00:00.000Z') // 09:00 − 11h
    expect(after.toISOString()).toBe('2026-04-05T23:00:00.000Z')  // 09:00 − 10h
  })

  it('defaults a missing time portion to midnight', () => {
    expect(dateTimeLocalToUtc('2026-06-01', TZ).toISOString()).toBe('2026-05-31T14:00:00.000Z')
  })
})

describe('round-trip — toDateTimeLocalInTz ∘ dateTimeLocalToUtc is the identity (to the minute)', () => {
  const samples = [
    '2026-01-15T22:13:00Z', // AEDT
    '2026-06-15T09:30:00Z', // AEST
    '2026-04-04T22:00:00Z', // day before fall-back
    '2026-04-06T23:30:00Z', // day after fall-back
    '2026-10-03T14:45:00Z', // day before spring-forward
    '2026-10-05T13:15:00Z', // day after spring-forward
  ]
  for (const iso of samples) {
    it(`round-trips ${iso}`, () => {
      const instant = new Date(iso)
      const local = toDateTimeLocalInTz(instant, TZ)
      const back = dateTimeLocalToUtc(local, TZ)
      // datetime-local has minute precision — compare truncated to the minute.
      const toMinute = (d: Date) => Math.floor(d.getTime() / 60000)
      expect(toMinute(back)).toBe(toMinute(instant))
    })
  }
})

describe('shiftEndToPreserveDuration — end follows start, keeping the duration (Outlook behaviour)', () => {
  it('preserves a 1-hour duration when the start time moves', () => {
    expect(shiftEndToPreserveDuration('2026-07-10T09:00', '2026-07-10T10:00', '2026-07-10T14:00'))
      .toBe('2026-07-10T15:00')
  })

  it('preserves a 90-minute duration across a day boundary', () => {
    expect(shiftEndToPreserveDuration('2026-07-10T09:00', '2026-07-10T10:30', '2026-07-10T23:00'))
      .toBe('2026-07-11T00:30')
  })

  it('preserves the duration when the start DATE moves', () => {
    expect(shiftEndToPreserveDuration('2026-07-10T09:00', '2026-07-10T10:00', '2026-08-01T09:00'))
      .toBe('2026-08-01T10:00')
  })

  it('preserves a multi-day duration', () => {
    expect(shiftEndToPreserveDuration('2026-07-10T09:00', '2026-07-12T17:00', '2026-07-20T09:00'))
      .toBe('2026-07-22T17:00')
  })

  it('falls back to 60 minutes when the previous pair is inverted', () => {
    expect(shiftEndToPreserveDuration('2026-07-10T10:00', '2026-07-10T09:00', '2026-07-10T14:00'))
      .toBe('2026-07-10T15:00')
  })

  it('falls back to 60 minutes when the previous values are empty', () => {
    expect(shiftEndToPreserveDuration('', '', '2026-07-10T14:00')).toBe('2026-07-10T15:00')
  })

  it('leaves the end unchanged when the new start is unparseable (input cleared mid-edit)', () => {
    expect(shiftEndToPreserveDuration('2026-07-10T09:00', '2026-07-10T10:00', ''))
      .toBe('2026-07-10T10:00')
  })
})
