import { CalendarView } from '@/components/calendar/CalendarView'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { maskPersonalEvent, calendarSettingsFromPrefs } from '@/lib/event-helpers'
import { generateRecurrenceInstances } from '@/lib/recurrence'
import type { CalendarEvent } from '@/types'

export default async function CalendarPage() {
  const user = await requireSession()

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { uiPreferences: true },
  })
  const calendarSettings = calendarSettingsFromPrefs(fullUser?.uiPreferences)

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 31)

  // Fetch events including recurring ones and multi-month events that span into the range
  // Must check both start AND end so events like "Qld road trip" (Aug 1 – Sep 30)
  // appear in September even though they started before the September range
  const [events, members] = await Promise.all([
    prisma.event.findMany({
      where: {
        familyId: user.familyId,
        OR: [
          { start: { gte: from, lte: to } },
          { start: { lte: from }, end: { gte: from } },
          { isRecurring: true },
        ],
      },
      orderBy: { start: 'asc' },
    }),
    prisma.user.findMany({ where: { familyId: user.familyId }, select: { id: true, name: true } }),
  ])
  const memberNames = new Map(members.map(m => [m.id, m.name]))

  // Expand recurring events into individual instances
  const expandedEvents = events.flatMap((event) => {
    if (event.isRecurring && event.recurrenceRule) {
      const instances = generateRecurrenceInstances(
        event.start,
        event.end,
        event.recurrenceRule,
        event.recurrenceEndDate,
        from,
        to,
        user.timezone ?? 'UTC',
        event.recurrenceExceptions
      )

      const expanded = instances.map((instance, index) => ({
        ...event,
        id: `${event.id}_recur_${index}`,
        start: instance.start,
        end: instance.end,
        isRecurring: false,
        isRecurringInstance: true,
        seriesId: event.id,
      }))

      // Only return the expanded instances - NOT the original event
      // The original can be edited/deleted via seriesId on any instance
      return expanded
    }
    return [event]
  })

  const calendarEvents: CalendarEvent[] = expandedEvents.map((e) => {
    const masked = maskPersonalEvent(e, user.id, memberNames.get(e.createdBy))
    return {
      id: masked.id,
      title: masked.title,
      description: masked.description,
      start: masked.start,
      end: masked.end,
      isAllDay: masked.isAllDay,
      isPersonal: masked.isPersonal,
      isBusy: masked.isBusy,
      category: masked.category,
      color: masked.color,
      createdBy: masked.createdBy,
      createdByName: (masked as Record<string, unknown>).createdByName as string | null | undefined,
      // Preserve recurring event fields so the UI can edit/delete the series
      seriesId: (e as Record<string, unknown>).seriesId as string | undefined,
      isRecurringInstance: (e as Record<string, unknown>).isRecurringInstance as boolean | undefined,
      recurrenceRule: (e as Record<string, unknown>).recurrenceRule as string | null | undefined,
    }
  })

  // Synthetic events (bills, income, docs, meals, chores, todos, trips) are added by
  // /api/events, which CalendarView fetches on mount and replaces the event list with.
  // Building them here too would duplicate that logic (and drift — the API computes the
  // calendar day in the user's timezone, this page used UTC). SSR carries real events only.

  return (
    <CalendarView
      initialEvents={calendarEvents}
      weekStartsOn={user.weekStartsOn as 0 | 1}
      currentUserId={user.id}
      timezone={user.timezone}
      calendarSettings={calendarSettings}
    />
  )
}
