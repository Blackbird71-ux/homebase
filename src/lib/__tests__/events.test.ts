import { describe, it, expect } from 'vitest'
import { validateEventDates } from '@/lib/event-helpers'

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
