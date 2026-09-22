import { prisma } from '@/lib/prisma'
import { generateRecurrenceInstances } from '@/lib/recurrence'
import { todayBoundsInTz, addLocalDays, formatInTz } from '@/lib/timezone'
import type { CalendarWeekEvent } from '@/types'

/** How many days ahead the dashboard "Next 7 Days" card lists. */
export const CALENDAR_WEEK_DAYS = 7

/**
 * Calendar events for the dashboard "Next 7 Days" card, one line per event
 * occurrence, formatted as `22/9 Tuesday` + optional `3:30pm` + title.
 *
 * Window is [local midnight today, local midnight today + 7 days), DST-correct.
 * Recurring series are expanded to their occurrences. Events already in
 * progress at the start of today (e.g. multi-day) are listed under today with
 * no time.
 *
 * Server-only (imports prisma). Both the SSR home page and /api/dashboard call
 * this so the card can't diverge between first paint and client refresh.
 */
export async function getCalendarWeekEvents(
  familyId: string,
  timezone: string
): Promise<CalendarWeekEvent[]> {
  const { start: windowStart } = todayBoundsInTz(timezone)
  const windowEnd = addLocalDays(windowStart, CALENDAR_WEEK_DAYS, timezone)

  const events = await prisma.event.findMany({
    where: {
      familyId,
      OR: [
        { isRecurring: false, start: { lt: windowEnd }, end: { gt: windowStart } },
        { isRecurring: true },
      ],
    },
    select: {
      id: true, title: true, start: true, end: true, isAllDay: true,
      color: true, category: true,
      isRecurring: true, recurrenceRule: true, recurrenceEndDate: true, recurrenceExceptions: true,
    },
  })

  const occurrences = events.flatMap((e) => {
    if (e.isRecurring && e.recurrenceRule) {
      return generateRecurrenceInstances(
        e.start, e.end, e.recurrenceRule, e.recurrenceEndDate,
        windowStart, windowEnd, timezone, e.recurrenceExceptions
      ).map((inst) => ({ ...e, start: inst.start, end: inst.end }))
    }
    return [e]
  })

  return occurrences
    .filter((e) => e.start < windowEnd && e.end > windowStart)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((e) => {
      const ongoing = e.start < windowStart
      const day = ongoing ? windowStart : e.start
      const dateLabel =
        `${formatInTz(day, timezone, { day: 'numeric' })}/${formatInTz(day, timezone, { month: 'numeric' })} ` +
        formatInTz(day, timezone, { weekday: 'long' })
      const timeLabel = e.isAllDay || ongoing
        ? null
        : formatInTz(e.start, timezone, { hour: 'numeric', minute: '2-digit', hour12: true })
            .replace(/\s/g, '')
            .toLowerCase()
      return {
        key: `${e.id}:${e.start.toISOString()}`,
        eventId: e.id,
        title: e.title,
        dateLabel,
        timeLabel,
        color: e.color,
        category: e.category,
      }
    })
}
