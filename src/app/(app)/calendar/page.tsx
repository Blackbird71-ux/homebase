import { CalendarView } from '@/components/calendar/CalendarView'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { maskPersonalEvent } from '@/lib/event-helpers'
import { generateRecurrenceInstances } from '@/lib/recurrence'
import type { CalendarEvent } from '@/types'

export default async function CalendarPage() {
  const user = await requireSession()

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 31)

  // Fetch events including recurring ones that start before the range
  const events = await prisma.event.findMany({
    where: {
      familyId: user.familyId,
      OR: [
        { start: { gte: from, lte: to } },
        { isRecurring: true },
      ],
    },
    orderBy: { start: 'asc' },
  })

  // Expand recurring events into individual instances
  const expandedEvents = events.flatMap((event) => {
    if (event.isRecurring && event.recurrenceRule) {
      const instances = generateRecurrenceInstances(
        event.start,
        event.end,
        event.recurrenceRule,
        event.recurrenceEndDate,
        from,
        to
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
    const masked = maskPersonalEvent(e, user.id)
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
    }
  })

  return (
    <CalendarView
      initialEvents={calendarEvents}
      weekStartsOn={user.weekStartsOn as 0 | 1}
    />
  )
}
