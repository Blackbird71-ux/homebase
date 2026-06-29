import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { todayBoundsInTz } from '@/lib/timezone'
import { buildChoreSchedule, choreScheduleWhere } from '@/lib/chore-helpers'
import { jsonWithETag } from '@/lib/http-cache'

export async function GET(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const timezone = user.timezone ?? 'UTC'

  // Parse scope from query param, default to 30
  const { searchParams } = new URL(request.url)
  const scopeParam = searchParams.get('scope')
  const scope = scopeParam ? Math.min(parseInt(scopeParam, 10) || 30, 30) : 30

  // Parse optional filter for "only my chores"
  const assignedToMe = searchParams.get('assignedToMe') === 'true'

  const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)

  const chores = await prisma.chore.findMany({
    where: {
      ...choreScheduleWhere(user.familyId, todayStart, scope, timezone),
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

  const schedule = buildChoreSchedule(chores, todayStart, todayEnd, timezone, scope)

  return jsonWithETag(request, { schedule, today: todayStart.toISOString() })
}
