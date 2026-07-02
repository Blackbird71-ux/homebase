import { describe, it, expect } from 'vitest'
import { validateEventDates, eventFallsOnDay } from '@/lib/event-helpers'
import type { CalendarEvent } from '@/types'

describe('validateEventDates', () => {
  it('accepts valid start/end pair', () => {
    const result = validateEventDates('2026-04-16T09:00:00Z', '2026-04-16T10:00:00Z')
    expect(result.valid).toBe(true)
  })

  it('rejects end before start', () => {
    const result = validateEventDates('2026-04-16T10:00:00Z', '2026-04-16T09:00:00Z')
    expect(result.valid).toBe(false)
    expect(result.error).toBe('End time must be after start time')
  })

  it('accepts all-day event where start equals end', () => {
    const result = validateEventDates('2026-04-16T00:00:00Z', '2026-04-16T00:00:00Z', true)
    expect(result.valid).toBe(true)
  })
})

describe('eventFallsOnDay — synthetic timed events bucket by local day of the start instant', () => {
  const TZ = 'Australia/Sydney'

  function synth(start: string, end: string, isAllDay: boolean, source: CalendarEvent['source']): CalendarEvent {
    return {
      id: 'e1', title: 't', description: null, start, end, isAllDay,
      isPersonal: false, isBusy: false, category: null, color: null, createdBy: 'u1', source,
    }
  }

  it('timed chore 09:00 AEST buckets to its due date, not the previous UTC day', () => {
    // Chore due 15 Jul 2026 (AEST, UTC+10), startTime 09:00 → 2026-07-14T23:00:00Z
    const chore = synth('2026-07-14T23:00:00.000Z', '2026-07-15T00:00:00.000Z', false, 'chore')
    expect(eventFallsOnDay(chore, new Date('2026-07-15T00:00:00+10:00'), TZ)).toBe(true)
    expect(eventFallsOnDay(chore, new Date('2026-07-14T00:00:00+10:00'), TZ)).toBe(false)
  })

  it('timed chore 09:00 AEDT (DST) buckets to its due date', () => {
    // Chore due 15 Jan 2026 (AEDT, UTC+11), startTime 09:00 → 2026-01-14T22:00:00Z
    const chore = synth('2026-01-14T22:00:00.000Z', '2026-01-14T23:00:00.000Z', false, 'chore')
    expect(eventFallsOnDay(chore, new Date('2026-01-15T00:00:00+11:00'), TZ)).toBe(true)
    expect(eventFallsOnDay(chore, new Date('2026-01-14T00:00:00+11:00'), TZ)).toBe(false)
  })

  it('timed trip activity with fake T23:59:59Z end does not spill onto the next day', () => {
    // Activity 09:00 AEST 15 Jul; no endTime → route fills end with 2026-07-15T23:59:59Z
    // (= 09:59 on 16 Jul local) — must still appear only on 15 Jul.
    const act = synth('2026-07-14T23:00:00.000Z', '2026-07-15T23:59:59.000Z', false, 'trip')
    expect(eventFallsOnDay(act, new Date('2026-07-15T00:00:00+10:00'), TZ)).toBe(true)
    expect(eventFallsOnDay(act, new Date('2026-07-16T00:00:00+10:00'), TZ)).toBe(false)
  })

  it('synthetic all-day events keep the UTC date-key convention', () => {
    const meal = synth('2026-07-15T00:00:00.000Z', '2026-07-15T23:59:59.000Z', true, 'meal')
    expect(eventFallsOnDay(meal, new Date('2026-07-15T00:00:00+10:00'), TZ)).toBe(true)
    expect(eventFallsOnDay(meal, new Date('2026-07-14T00:00:00+10:00'), TZ)).toBe(false)
    expect(eventFallsOnDay(meal, new Date('2026-07-16T00:00:00+10:00'), TZ)).toBe(false)
  })

  it('real (non-synthetic) timed events still bucket by local day range', () => {
    const real = synth('2026-07-14T23:00:00.000Z', '2026-07-15T00:00:00.000Z', false, undefined)
    expect(eventFallsOnDay(real, new Date('2026-07-15T00:00:00+10:00'), TZ)).toBe(true)
    expect(eventFallsOnDay(real, new Date('2026-07-14T00:00:00+10:00'), TZ)).toBe(false)
  })
})
