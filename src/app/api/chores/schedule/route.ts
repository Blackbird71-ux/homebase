import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { todayBoundsInTz } from '@/lib/timezone'

export async function GET(request: NextRequest) {
  const user = await requireSession()
  const timezone = user.timezone

  // Parse scope from query param, default to 30
  const { searchParams } = new URL(request.url)
  const scopeParam = searchParams.get('scope')
  const scope = scopeParam ? Math.min(parseInt(scopeParam, 10) || 30, 30) : 30

  // Parse optional filter for "only my chores"
  const assignedToMeParam = searchParams.get('assignedToMe')
  const assignedToMe = assignedToMeParam === 'true'

  // Get today's boundary in family timezone
  const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)

  // Rolling window from today
  const windowEnd = new Date(todayStart.getTime() + scope * 24 * 60 * 60 * 1000)

  const chores = await prisma.chore.findMany({
    where: {
      familyId: user.familyId,
      isActive: true,
      nextDueDate: { lte: windowEnd },
      ...(assignedToMe ? { currentAssigneeId: user.id } : {}),
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

  // Build schedule grouped by day within the rolling window
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
      isCompletable: boolean
    }>
  }> = []

  for (let i = 0; i < scope; i++) {
    // Use timezone-aware day boundaries derived from todayStart (already local midnight in UTC form)
    const dayStart = new Date(todayStart.getTime() + i * 86400000)
    const dayEnd = new Date(todayStart.getTime() + (i + 1) * 86400000)
    // Use the midpoint of the local day to reliably determine the day name/date in the target timezone
    const midDay = new Date(dayStart.getTime() + 12 * 3600000)

    const dayChores = chores.filter((c: any) => {
      if (!c.nextDueDate) return false
      return c.nextDueDate >= dayStart && c.nextDueDate < dayEnd
    })

    schedule.push({
      day: new Intl.DateTimeFormat('en-US', { timeZone: timezone ?? 'UTC', weekday: 'short' }).format(midDay),
      date: new Intl.DateTimeFormat('en-CA', { timeZone: timezone ?? 'UTC' }).format(midDay),
      chores: dayChores.map((c: any) => ({
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
        isCompletable: c.allowEarlyStart || (c.nextDueDate ? c.nextDueDate <= todayEnd : false),
      })),
    })
  }

  return NextResponse.json({ schedule, today: todayStart.toISOString() })
}