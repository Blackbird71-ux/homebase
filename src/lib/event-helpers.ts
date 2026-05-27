import { dateStringInTz } from '@/lib/timezone'
import type { CalendarEvent } from '@/types'

/**
 * Returns true if the event falls on the given calendar day, using the family's timezone.
 * Synthetic events (meals, chores, bills, etc.) store dates in UTC midnight convention
 * where the UTC date string IS the calendar date — compared directly against the local date string.
 * Real events use Intl-based timezone conversion so local midnight is always correct.
 */
export function eventFallsOnDay(event: CalendarEvent, day: Date, timezone: string): boolean {
  const dayStr = dateStringInTz(day, timezone)
  if (event.source) {
    // Synthetic: UTC date string is the calendar date by convention
    return dayStr >= event.start.slice(0, 10) && dayStr <= event.end.slice(0, 10)
  }
  const eventStartStr = dateStringInTz(new Date(event.start), timezone)
  const eventEndStr = dateStringInTz(new Date(event.end), timezone)
  return dayStr >= eventStartStr && dayStr <= eventEndStr
}

/** Return the canonical event ID to update — recurring instances point to their seriesId. */
export function getEventId(event: CalendarEvent): string {
  return event.seriesId ?? event.id
}

/** Return true if the event is part of a recurring series (original or instance). */
export function isRecurringEvent(event: CalendarEvent): boolean {
  return !!(event.recurrenceRule || event.seriesId)
}

export function validateEventDates(
  start: string,
  end: string,
  isAllDay = false
): { valid: boolean; error?: string } {
  const s = new Date(start)
  const e = new Date(end)

  if (isNaN(s.getTime()) || isNaN(e.getTime())) {
    return { valid: false, error: 'Invalid date format' }
  }

  if (!isAllDay && e < s) {
    return { valid: false, error: 'End time must be after start time' }
  }

  return { valid: true }
}

export interface EventRow {
  id: string
  title: string
  description: string | null
  start: Date
  end: Date
  isAllDay: boolean
  isPersonal: boolean
  category: string | null
  color: string | null
  createdBy: string
  familyId: string
  createdAt: Date
}

export function maskPersonalEvent(event: EventRow, viewerUserId: string, creatorName?: string | null) {
  if (event.isPersonal && event.createdBy !== viewerUserId) {
    return {
      ...event,
      title: 'Private event',
      description: null,
      location: null,
      category: null,
      color: null,
      isBusy: true,
      createdByName: creatorName ?? null,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      createdAt: event.createdAt.toISOString(),
    }
  }
  return {
    ...event,
    isBusy: false,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    createdAt: event.createdAt.toISOString(),
  }
}
