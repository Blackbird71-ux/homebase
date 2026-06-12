// src/lib/date-engine.ts
// Expands stored special dates (birthdays/anniversaries from Family.birthdays
// and HouseholdContact.birthday) into calendar-day occurrences within a date
// range. Pure and client-safe — no prisma/server imports. Used by /api/events
// to synthesize calendar events; the daily briefing (roadmap #3) is expected
// to reuse it.

import { dateStringInTz } from '@/lib/timezone'

export interface BirthdayEntry {
  name: string
  type: string // 'birthday' | 'anniversary'
  date: string // 'YYYY-MM-DD' or 'MM-DD'
}

export interface BirthdayOccurrence {
  name: string
  type: string
  date: string // the original stored date string of the entry
  day: string // 'YYYY-MM-DD' local calendar day of this occurrence
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** True if the string is a valid stored birthday: 'YYYY-MM-DD' or 'MM-DD'. */
export function isValidBirthdayDate(date: string): boolean {
  const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(date)
  if (!m) return false
  const month = parseInt(m[2])
  const day = parseInt(m[3])
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
}

/** Format a stored birthday for display: '05-23' → '23 May', '1980-05-23' → '23 May 1980'. */
export function formatBirthdayDate(date: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const parts = date.split('-')
  if (parts.length < 2) return date
  const month = parseInt(parts[parts.length - 2])
  const day = parseInt(parts[parts.length - 1])
  if (!month || !day || month > 12) return date
  const base = `${day} ${months[month - 1]}`
  return parts.length === 3 ? `${base} ${parts[0]}` : base
}

/**
 * Expand birthday/anniversary entries into the occurrences that fall within
 * [rangeStart, rangeEnd], recurring annually. Entries store 'YYYY-MM-DD' or
 * 'MM-DD' (see birthdays.tool.ts — month/day are the last two segments).
 * Feb 29 entries fall on Feb 28 in non-leap years.
 */
export function birthdayEntryOccurrencesInRange(
  entries: BirthdayEntry[],
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string
): BirthdayOccurrence[] {
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
        occurrences.push({ name: entry.name, type: entry.type ?? 'birthday', date: entry.date, day: key })
      }
    }
  }
  return occurrences
}

/** As birthdayEntryOccurrencesInRange, parsing the Family.birthdays JSON string first. */
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
  return birthdayEntryOccurrencesInRange(entries, rangeStart, rangeEnd, timezone)
}
