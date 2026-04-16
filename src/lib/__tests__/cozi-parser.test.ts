import { describe, it, expect } from 'vitest'
import { parseIcs } from '@/lib/cozi-parser'

const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Cozi//EN
BEGIN:VEVENT
UID:abc123@cozi.com
DTSTART:20260420T090000Z
DTEND:20260420T100000Z
SUMMARY:Soccer Practice
DESCRIPTION:At the north oval
END:VEVENT
BEGIN:VEVENT
UID:def456@cozi.com
DTSTART;VALUE=DATE:20260421
DTEND;VALUE=DATE:20260422
SUMMARY:School Excursion
END:VEVENT
END:VCALENDAR`

describe('parseIcs', () => {
  it('parses timed events', () => {
    const events = parseIcs(SAMPLE_ICS)
    const soccer = events.find(e => e.title === 'Soccer Practice')
    expect(soccer).toBeDefined()
    expect(soccer!.isAllDay).toBe(false)
    expect(soccer!.start).toBe('2026-04-20T09:00:00.000Z')
    expect(soccer!.description).toBe('At the north oval')
  })

  it('parses all-day events', () => {
    const events = parseIcs(SAMPLE_ICS)
    const excursion = events.find(e => e.title === 'School Excursion')
    expect(excursion).toBeDefined()
    expect(excursion!.isAllDay).toBe(true)
  })

  it('returns empty array for empty input', () => {
    expect(parseIcs('')).toEqual([])
  })
})
