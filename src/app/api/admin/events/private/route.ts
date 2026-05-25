import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'

// GET /api/admin/events/private
// Returns all personal events for the admin's family, unmasked.
// Used for diagnostic purposes to identify unexpected private events.
export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const [events, members] = await Promise.all([
    prisma.event.findMany({
      where: { familyId: user.familyId, isPersonal: true },
      orderBy: { start: 'asc' },
      select: {
        id: true,
        title: true,
        start: true,
        end: true,
        isAllDay: true,
        isRecurring: true,
        recurrenceRule: true,
        recurrenceEndDate: true,
        category: true,
        createdBy: true,
      },
    }),
    prisma.user.findMany({
      where: { familyId: user.familyId },
      select: { id: true, name: true },
    }),
  ])

  const memberMap = new Map(members.map(m => [m.id, m.name]))

  const result = events.map(e => ({
    id: e.id,
    title: e.title,
    createdByName: memberMap.get(e.createdBy) ?? 'Unknown',
    start: e.start.toISOString().slice(0, 10),
    end: e.end.toISOString().slice(0, 10),
    isAllDay: e.isAllDay,
    isRecurring: e.isRecurring,
    recurrenceRule: e.recurrenceRule,
    recurrenceEndDate: e.recurrenceEndDate?.toISOString().slice(0, 10) ?? null,
    category: e.category,
  }))

  return NextResponse.json({ total: result.length, events: result })
}
