import {
  dateStringInTz, addLocalDays, startOfWeekInTz, endOfWeekInTz,
  startOfMonthInTz, endOfMonthInTz,
} from '@/lib/timezone'
import type { CalendarEvent } from '@/types'

export interface CalendarToggleSettings {
  calShowMeals: boolean
  calShowTodos: boolean
  calShowChores: boolean
  calShowBills: boolean
  calShowDocs: boolean
  calShowBirthdays: boolean
  calShowMaintenance: boolean
}

/**
 * Parse the calendar synthetic-event toggles from a user's uiPreferences JSON.
 * Single source of truth for the defaults — used by the calendar page (SSR)
 * and /api/warm, so the warm URL byte-matches the URL CalendarView fetches.
 */
export function calendarSettingsFromPrefs(
  uiPreferences: string | null | undefined
): CalendarToggleSettings {
  const defaults: CalendarToggleSettings = {
    calShowMeals: false, calShowTodos: false, calShowChores: false,
    calShowBills: true, calShowDocs: true,
    calShowBirthdays: true, calShowMaintenance: true,
  }
  if (!uiPreferences) return defaults
  try {
    const prefs = JSON.parse(uiPreferences)
    return {
      calShowMeals: !!prefs.calShowMeals,
      calShowTodos: !!prefs.calShowTodos,
      calShowChores: !!prefs.calShowChores,
      calShowBills: prefs.calShowBills !== false,
      calShowDocs: prefs.calShowDocs !== false,
      calShowBirthdays: prefs.calShowBirthdays !== false,
      calShowMaintenance: prefs.calShowMaintenance !== false,
    }
  } catch {
    return defaults
  }
}

export type CalendarViewName = 'month' | 'week' | 'day' | 'schedule' | 'horizontal'

/**
 * Build the /api/events query string for a calendar view. Shared by
 * CalendarView.refresh and /api/warm — both must produce byte-identical URLs
 * so the service worker's warmed cache entry matches the view's request.
 */
export function buildEventsQuery(
  view: CalendarViewName,
  targetDate: Date,
  timezone: string,
  weekStartsOn: 0 | 1,
  s: CalendarToggleSettings
): string {
  let rangeStart: Date
  let rangeEnd: Date
  if (view === 'month') {
    rangeStart = addLocalDays(startOfWeekInTz(startOfMonthInTz(targetDate, timezone), timezone, weekStartsOn), -7, timezone)
    rangeEnd   = addLocalDays(endOfWeekInTz(endOfMonthInTz(targetDate, timezone), timezone, weekStartsOn), 7, timezone)
  } else if (view === 'week' || view === 'horizontal') {
    rangeStart = addLocalDays(startOfWeekInTz(targetDate, timezone, weekStartsOn), -7, timezone)
    rangeEnd   = addLocalDays(endOfWeekInTz(targetDate, timezone, weekStartsOn), 7, timezone)
  } else if (view === 'day') {
    rangeStart = addLocalDays(targetDate, -2, timezone)
    rangeEnd   = addLocalDays(targetDate,  2, timezone)
  } else {
    // schedule — 60 days forward
    rangeStart = targetDate
    rangeEnd   = addLocalDays(targetDate, 62, timezone)
  }

  const params = new URLSearchParams({
    from: rangeStart.toISOString(),
    to: rangeEnd.toISOString(),
    ...(s.calShowMeals  ? { meals:  '1' } : {}),
    ...(s.calShowTodos  ? { todos:  '1' } : {}),
    ...(s.calShowChores ? { chores: '1' } : {}),
    ...(s.calShowBills  ? { bills:  '1' } : {}),
    ...(s.calShowDocs   ? { docs:   '1' } : {}),
    ...(s.calShowBirthdays   ? { birthdays:   '1' } : {}),
    ...(s.calShowMaintenance ? { maintenance: '1' } : {}),
  })
  return params.toString()
}

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
