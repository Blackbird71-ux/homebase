import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'
import { todayBoundsInTz, utcMidnightToLocalMidnight } from '@/lib/timezone'

function calculateInitialDueDate(
  frequency: string,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  startDate: Date | null,
  timezone: string
): Date {
  const base = startDate ? new Date(startDate) : new Date()
  base.setUTCHours(0, 0, 0, 0)

  let result: Date

  switch (frequency) {
    case 'daily': {
      result = base
      break
    }
    case 'weekly': {
      if (dayOfWeek !== null) {
        const currentDay = base.getUTCDay()
        let daysUntil = dayOfWeek - currentDay
        if (daysUntil < 0) daysUntil += 7
        const next = new Date(base)
        next.setUTCDate(base.getUTCDate() + daysUntil)
        result = next
      } else {
        result = base
      }
      break
    }
    case 'biweekly': {
      result = base
      break
    }
    case 'monthly':
    case 'bimonthly':
    case 'quarterly':
    case 'halfyearly':
    case 'yearly': {
      if (dayOfMonth !== null) {
        const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
        const targetDay = Math.min(dayOfMonth, lastDay)
        // If start date's day is after the target day this month, go to next month
        if (base.getUTCDate() > targetDay) {
          base.setUTCMonth(base.getUTCMonth() + 1)
          const nextLastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
          base.setUTCDate(Math.min(dayOfMonth, nextLastDay))
        } else {
          base.setUTCDate(targetDay)
        }
        result = base
      } else {
        result = base
      }
      break
    }
    default: {
      result = base
      break
    }
  }

  // Shift from UTC midnight to user's local-time midnight
  return utcMidnightToLocalMidnight(result, timezone)
}

export async function GET() {
  const user = await requireSession()
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

  // nextDueDate is now stored as the UTC equivalent of midnight in the user's
  // timezone, so a simple Date comparison is correct.
  const choresWithOverdue = chores.map((c) => ({
    ...c,
    isOverdue: c.nextDueDate ? c.nextDueDate < todayStart : false,
  }))

  return NextResponse.json(choresWithOverdue)
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
    allowEarlyStart,
    emailReminder,
    emailReminderDays,
  } = body

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  // Calculate initial nextDueDate — shifted to user's local-time midnight
  const parsedStartDate = startDate ? new Date(startDate) : null
  const nextDueDate = calculateInitialDueDate(
    frequency ?? 'weekly',
    dayOfWeek ?? null,
    dayOfMonth ?? null,
    parsedStartDate,
    user.timezone ?? 'UTC'
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
      allowEarlyStart: allowEarlyStart ?? false,
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