import ical, { type VEvent } from 'node-ical'

export interface ParsedEvent {
  title: string
  description: string | null
  start: string
  end: string
  isAllDay: boolean
  category: string | null
}

export function parseIcs(icsContent: string): ParsedEvent[] {
  if (!icsContent.trim()) return []

  let parsed: ReturnType<typeof ical.parseICS>
  try {
    parsed = ical.parseICS(icsContent)
  } catch {
    return []
  }

  const events: ParsedEvent[] = []

  for (const key in parsed) {
    const component = parsed[key]
    if (!component || component.type !== 'VEVENT') continue

    const vevent = component as VEvent
    if (!vevent.summary || !vevent.start) continue

    const isAllDay = vevent.datetype === 'date'

    const startDate = vevent.start instanceof Date
      ? vevent.start
      : new Date(vevent.start as string)
    const endDate = vevent.end instanceof Date
      ? vevent.end
      : startDate

    events.push({
      title: String(vevent.summary),
      description: vevent.description ? String(vevent.description) : null,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      isAllDay,
      category: null,
    })
  }

  return events
}
