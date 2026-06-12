// src/lib/date-engine.ts
// Expands stored special dates (birthdays/anniversaries from Family.birthdays)
// into calendar-day occurrences within a date range. Pure and client-safe —
// no prisma/server imports. Used by /api/events to synthesize calendar events;
// the daily briefing (roadmap #3) is expected to reuse it.

import { dateStringInTz } from '@/lib/timezone'

export interface BirthdayEntry {
  name: string
  type: string // 'birthday' | 'anniversary'
  date: string // 'YYYY-MM-DD' or 'MM-DD'
}

export interface BirthdayOccurrence {
  name: string
  type: string
  day: string // 'YYYY-MM-DD' local calendar day of this occurrence
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Expand the Family.birthdays JSON array into the occurrences that fall within
 * [rangeStart, rangeEnd], recurring annually. Entries store 'YYYY-MM-DD' or
 * 'MM-DD' (see birthdays.tool.ts — month/day are the last two segments).
 * Feb 29 entries fall on Feb 28 in non-leap years.
 */
export function birthdayOccurrencesInRange(
  birthdaysJson: string | null | undefined,
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string
): BirthdayOccurrence[] {
  if (!birthdaysJson) return []
  let entries: BirthdayEntry[]
  try {
    entries = JSON.parse(birthdaysJson)
  } catch {
    return []
  }
  if (!Array.isArray(entries)) return []

  const startKey = dateStringInTz(rangeStart, timezone)
  const endKey = dateStringInTz(rangeEnd, timezone)
  const startYear = parseInt(startKey.slice(0, 4))
  const endYear = parseInt(endKey.slice(0, 4))

  const occurrences: BirthdayOccurrence[] = []
  for (const entry of entries) {
    if (!entry?.name || typeof entry.date !== 'string') continue
    const parts = entry.date.split('-')
    if (parts.length < 2) continue
    const month = parseInt(parts[parts.length - 2])
    const day = parseInt(parts[parts.length - 1])
    if (!month || !day || month > 12 || day > 31) continue

    for (let year = startYear; year <= endYear; year++) {
      const effectiveDay = month === 2 && day === 29 && !isLeapYear(year) ? 28 : day
      const key = `${year}-${String(month).padStart(2, '0')}-${String(effectiveDay).padStart(2, '0')}`
      if (key >= startKey && key <= endKey) {
        occurrences.push({ name: entry.name, type: entry.type ?? 'birthday', day: key })
      }
    }
  }
  return occurrences
}
