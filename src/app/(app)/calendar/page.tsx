import { CalendarView } from '@/components/calendar/CalendarView'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
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

  const calendarEvents: CalendarEvent[] = events.map(e => ({
    id: e.id,
    title: e.title,
    description: e.description,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    isAllDay: e.isAllDay,
    category: e.category,
    color: e.color,
    createdBy: e.createdBy,
  }))

  return (
    <CalendarView
      initialEvents={calendarEvents}
      weekStartsOn={user.weekStartsOn as 0 | 1}
    />
  )
}
