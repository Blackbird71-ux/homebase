import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { todayBoundsInTz } from '@/lib/timezone'

function calculateNextDueDate(
  chore: {
    frequency: string
    dayOfWeek: number | null
    dayOfMonth: number | null
    triggerOnComplete: boolean
    allowEarlyStart: boolean
    endDate: Date | null
    nextDueDate: Date | null
  },
  completedAt: Date
): Date | null {
  const now = new Date()
  // When allowEarlyStart is enabled, advance from the existing nextDueDate (if it's in the future)
  // so the schedule doesn't "reset" — it keeps its rhythm even when completed early.
  // When triggerOnComplete is on, always base off completedAt.
  let baseDate: Date
  if (chore.triggerOnComplete) {
    baseDate = completedAt
  } else if (chore.allowEarlyStart && chore.nextDueDate && chore.nextDueDate > now) {
    baseDate = chore.nextDueDate
  } else {
    baseDate = now
  }

  let next: Date

  switch (chore.frequency) {
    case 'daily': {
      next = new Date(baseDate)
      next.setDate(next.getDate() + 1)
      next.setHours(0, 0, 0, 0)
      break
    }
    case 'weekly': {
      next = new Date(baseDate)
      next.setHours(0, 0, 0, 0)
      if (chore.dayOfWeek !== null) {
        // Find the next occurrence of the specified day of week
        const currentDay = next.getDay()
        let daysUntil = chore.dayOfWeek - currentDay
        if (daysUntil <= 0) daysUntil += 7
        next.setDate(next.getDate() + daysUntil)
      } else {
        // No specific day, just add 7 days
        next.setDate(next.getDate() + 7)
      }
      break
    }
    case 'biweekly': {
      next = new Date(baseDate)
      next.setDate(next.getDate() + 14)
      next.setHours(0, 0, 0, 0)
      break
    }
    case 'monthly':
    case 'bimonthly':
    case 'quarterly':
    case 'halfyearly':
    case 'yearly': {
      next = new Date(baseDate)
      next.setHours(0, 0, 0, 0)
      if (chore.dayOfMonth !== null) {
        const targetDay = chore.dayOfMonth
        // Advance by the appropriate number of months
        let monthsToAdd = 1
        if (chore.frequency === 'bimonthly') monthsToAdd = 2
        else if (chore.frequency === 'quarterly') monthsToAdd = 3
        else if (chore.frequency === 'halfyearly') monthsToAdd = 6
        else if (chore.frequency === 'yearly') monthsToAdd = 12
        next.setMonth(next.getMonth() + monthsToAdd)
        // Get the last day of that month
        const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
        next.setDate(Math.min(targetDay, lastDay))
      } else {
        // No specific day: advance by appropriate months from original
        let monthsToAdd = 1
        if (chore.frequency === 'bimonthly') monthsToAdd = 2
        else if (chore.frequency === 'quarterly') monthsToAdd = 3
        else if (chore.frequency === 'halfyearly') monthsToAdd = 6
        else if (chore.frequency === 'yearly') monthsToAdd = 12
        next.setMonth(next.getMonth() + monthsToAdd)
      }
      break
    }
    default: {
      next = new Date(baseDate)
      next.setDate(next.getDate() + 7)
      next.setHours(0, 0, 0, 0)
    }
  }

  // Check if next due date exceeds end date
  if (chore.endDate && next > chore.endDate) {
    return null // Signal that chore should be deactivated
  }

  return next
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()

  // Verify chore exists and belongs to family
  const chore = await prisma.chore.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!chore) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Use the user's timezone to determine "today" boundaries, so a chore due today
  // (e.g., nextDueDate at midnight UTC = 10:00 AM Sydney time) is always completable
  // regardless of the raw UTC clock.
  const timezone = user.timezone ?? 'UTC'
  const { end: todayEnd } = todayBoundsInTz(timezone)

  // If allowEarlyStart is false, only allow completion when the chore is actually due or overdue.
  // (nextDueDate null means it's due now; nextDueDate in the past means overdue — both allowed.)
  if (!chore.allowEarlyStart && chore.nextDueDate && chore.nextDueDate > todayEnd) {
    return NextResponse.json(
      { error: 'This chore is not yet due. Enable "Allow early completion" on the chore to complete it ahead of schedule.' },
      { status: 422 }
    )
  }

  // Record the completion
  const completion = await prisma.choreCompletion.create({
    data: {
      choreId: id,
      completedById: user.id,
      note: body.note ?? null,
    },
    include: {
      completedBy: { select: { id: true, name: true } },
    },
  })

  // Calculate next due date
  const completedAt = new Date()
  const nextDueDate = calculateNextDueDate(chore, completedAt)

  // Prepare update data
  const updateData: Record<string, unknown> = {}

  if (nextDueDate === null) {
    // End date reached - deactivate chore
    updateData.isActive = false
    updateData.nextDueDate = null
  } else {
    updateData.nextDueDate = nextDueDate
  }

  // Auto-rotate assignee if enabled
  if (chore.autoRotateOnComplete) {
    const members = await prisma.user.findMany({
      where: { familyId: user.familyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    if (members.length > 0) {
      let nextIndex = 0
      if (chore.currentAssigneeId) {
        const currentIndex = members.findIndex((m) => m.id === chore.currentAssigneeId)
        nextIndex = (currentIndex + 1) % members.length
      }
      updateData.currentAssigneeId = members[nextIndex].id
    }
  }

  // Update the chore
  const updated = await prisma.chore.update({
    where: { id },
    data: updateData,
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

  return NextResponse.json({
    completion,
    chore: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      completions: updated.completions.map((c) => ({
        ...c,
        completedAt: c.completedAt.toISOString(),
      })),
    },
  })
}
