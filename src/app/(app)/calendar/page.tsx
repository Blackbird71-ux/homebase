import { CalendarView } from '@/components/calendar/CalendarView'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { maskPersonalEvent } from '@/lib/event-helpers'
import type { CalendarEvent } from '@/types'

export default async function CalendarPage() {
  const user = await requireSession()

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 31)

  const events = await prisma.event.findMany({
    where: { familyId: user.familyId, start: { gte: from, lte: to } },
    orderBy: { start: 'asc' },
  })

  const calendarEvents: CalendarEvent[] = events.map((e) => {
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
