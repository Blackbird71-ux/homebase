import type { CalendarEvent } from '@/types'

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

export function maskPersonalEvent(event: EventRow, viewerUserId: string) {
  if (event.isPersonal && event.createdBy !== viewerUserId) {
    return {
      ...event,
      title: 'Private event',
      description: null,
      category: null,
      color: null,
      isBusy: true,
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
