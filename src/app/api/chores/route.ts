import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'

function calculateInitialDueDate(
  frequency: string,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  startDate: Date | null
): Date {
  const base = startDate ? new Date(startDate) : new Date()
  base.setHours(0, 0, 0, 0)

  switch (frequency) {
    case 'daily': {
      return base
    }
    case 'weekly': {
      if (dayOfWeek !== null) {
        const currentDay = base.getDay()
        let daysUntil = dayOfWeek - currentDay
        if (daysUntil < 0) daysUntil += 7
        const next = new Date(base)
        next.setDate(base.getDate() + daysUntil)
        return next
      }
      return base
    }
    case 'biweekly': {
      return base
    }
    case 'monthly': {
      if (dayOfMonth !== null) {
        const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
        const targetDay = Math.min(dayOfMonth, lastDay)
        // If start date's day is after the target day this month, go to next month
        if (base.getDate() > targetDay) {
          base.setMonth(base.getMonth() + 1)
          const nextLastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
          base.setDate(Math.min(dayOfMonth, nextLastDay))
        } else {
          base.setDate(targetDay)
        }
        return base
      }
      return base
    }
    default: {
      return base
    }
  }
}

export async function GET() {
  const user = await requireSession()

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

  return NextResponse.json(chores)
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const {
    title,
    description,
    note,
    frequency,
    dayOfWeek,
    dayOfMonth,
    rotationInterval,
    currentAssigneeId,
    startDate,
    endDate,
    triggerOnComplete,
    autoRotateOnComplete,
    emailReminder,
    emailReminderDays,
  } = body

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  // Calculate initial nextDueDate
  const parsedStartDate = startDate ? new Date(startDate) : null
  const nextDueDate = calculateInitialDueDate(
    frequency ?? 'weekly',
    dayOfWeek ?? null,
    dayOfMonth ?? null,
    parsedStartDate
  )

  const chore = await prisma.chore.create({
    data: {
      title,
      description: description ?? null,
      note: note ?? null,
      frequency: frequency ?? 'weekly',
      dayOfWeek: dayOfWeek ?? null,
      dayOfMonth: dayOfMonth ?? null,
      rotationInterval: rotationInterval ?? 1,
      currentAssigneeId: currentAssigneeId ?? null,
      startDate: parsedStartDate,
      endDate: endDate ? new Date(endDate) : null,
      nextDueDate,
      triggerOnComplete: triggerOnComplete ?? false,
      autoRotateOnComplete: autoRotateOnComplete ?? false,
      emailReminder: emailReminder ?? false,
      emailReminderDays: emailReminderDays ?? 1,
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