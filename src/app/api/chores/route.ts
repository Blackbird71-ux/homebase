import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'
import { todayBoundsInTz } from '@/lib/timezone'
import { calculateInitialDueDate } from '@/lib/chore-helpers'

export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const timezone = user.timezone ?? 'UTC'
  const { start: todayStart } = todayBoundsInTz(timezone)

  const chores = await prisma.chore.findMany({
    where: { familyId: user.familyId, isActive: true },
    include: {
      currentAssignee: { select: { id: true, name: true } },
      completions: {
        orderBy: { completedAt: 'desc' },
        take: 1,
        include: { completedBy: { select: { id: true, name: true } } },
      },
      _count: { select: { completions: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  // nextDueDate is stored as the UTC equivalent of midnight in the user's timezone,
  // so a simple Date comparison is correct.
  const choresWithOverdue = chores.map((c) => ({
    ...c,
    isOverdue: c.nextDueDate ? c.nextDueDate < todayStart : false,
  }))

  return NextResponse.json(choresWithOverdue)
}

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const {
    title,
    description,
    note,
    frequency,
    dayOfWeek,
    daysOfWeek,
    dayOfMonth,
    rotationInterval,
    currentAssigneeId,
    startDate,
    endDate,
    triggerOnComplete,
    autoRotateOnComplete,
    allowEarlyStart,
    emailReminder,
    emailReminderDays,
    startTime,
    duration,
  } = body

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const parsedStartDate = startDate ? new Date(startDate) : null

  // Multi-day weekly: store the selected weekdays as a JSON array string.
  const daysOfWeekJson =
    Array.isArray(daysOfWeek) && daysOfWeek.length > 0 ? JSON.stringify(daysOfWeek) : null

  // Calculate initial nextDueDate using the canonical helper.
  const nextDueDate = calculateInitialDueDate(
    frequency ?? 'weekly',
    dayOfWeek ?? null,
    dayOfMonth ?? null,
    parsedStartDate,
    user.timezone ?? 'UTC',
    daysOfWeekJson
  )

  const chore = await prisma.chore.create({
    data: {
      title,
      description: description ?? null,
      note: note ?? null,
      frequency: frequency ?? 'weekly',
      dayOfWeek: dayOfWeek ?? null,
      daysOfWeek: daysOfWeekJson,
      dayOfMonth: dayOfMonth ?? null,
      rotationInterval: rotationInterval ?? 1,
      currentAssigneeId: currentAssigneeId || null,  // coerce "" → null
      startDate: parsedStartDate,
      endDate: endDate ? new Date(endDate) : null,
      nextDueDate,
      triggerOnComplete: triggerOnComplete ?? false,
      autoRotateOnComplete: autoRotateOnComplete ?? false,
      allowEarlyStart: allowEarlyStart ?? false,
      emailReminder: emailReminder ?? false,
      emailReminderDays: emailReminderDays ?? 1,
      startTime: startTime ? new Date(startTime) : null,
      duration: duration ?? null,
      familyId: user.familyId,
    },
    include: {
      currentAssignee: { select: { id: true, name: true } },
      completions: {
        orderBy: { completedAt: 'desc' },
        take: 1,
        include: { completedBy: { select: { id: true, name: true } } },
      },
      _count: { select: { completions: true } },
    },
  })

  void createAuditLog(
    user,
    'create',
    'chore',
    chore.id,
    `Created chore "${title}"`,
    { chore: { title, frequency, description } }
  )

  return NextResponse.json(chore, { status: 201 })
}
