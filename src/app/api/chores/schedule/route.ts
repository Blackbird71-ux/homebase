import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { todayBoundsInTz } from '@/lib/timezone'

export async function GET() {
  const user = await requireSession()
  const timezone = user.timezone

  // Get today's boundary in family timezone
  const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)

  // Rolling 7-day window from today
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  const chores = await prisma.chore.findMany({
    where: {
      familyId: user.familyId,
      isActive: true,
      nextDueDate: { lte: weekEnd },
    },
    include: {
      currentAssignee: { select: { id: true, name: true } },
      completions: {
        orderBy: { completedAt: 'desc' },
        take: 1,
        include: { completedBy: { select: { id: true, name: true } } },
      },
    },
    orderBy: { nextDueDate: 'asc' },
  })

  // Build schedule grouped by day-of-week within the rolling 7-day window
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const schedule: Array<{
    day: string
    date: string
    chores: Array<{
      id: string
      title: string
      frequency: string
      note: string | null
      currentAssignee: { id: string; name: string } | null
      lastCompletedBy: { id: string; name: string } | null
      lastCompletedAt: string | null
      isOverdue: boolean
    }>
  }> = []

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(todayStart)
    dayDate.setDate(dayDate.getDate() + i)

    const dayStart = new Date(dayDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayDate)
    dayEnd.setHours(23, 59, 59, 999)

    const dayChores = chores.filter((c) => {
      if (!c.nextDueDate) return false
      return c.nextDueDate >= dayStart && c.nextDueDate <= dayEnd
    })

    schedule.push({
      day: dayNames[dayDate.getDay()],
      date: dayDate.toISOString(),
      chores: dayChores.map((c) => ({
        id: c.id,
        title: c.title,
        frequency: c.frequency,
        note: c.note,
        currentAssignee: c.currentAssignee
          ? { id: c.currentAssignee.id, name: c.currentAssignee.name }
          : null,
        lastCompletedBy: c.completions[0]?.completedBy
          ? { id: c.completions[0].completedBy.id, name: c.completions[0].completedBy.name }
          : null,
        lastCompletedAt: c.completions[0]?.completedAt?.toISOString() ?? null,
        isOverdue: c.nextDueDate ? c.nextDueDate < todayStart : false,
      })),
    })
  }

  return NextResponse.json({ schedule, today: todayStart.toISOString() })
}