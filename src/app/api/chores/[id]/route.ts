import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'
import { AppEvents, dispatchAppEvent } from '@/lib/app-events'

/**
 * Local version of calculateNextDueDate for the PATCH route.
 * Recalculates the next due date from the current time when frequency/dayOfWeek/dayOfMonth changes.
 */
function calculateNextDueDateLocal(
  chore: {
    frequency: string
    dayOfWeek: number | null
    dayOfMonth: number | null
    triggerOnComplete: boolean
    allowEarlyStart: boolean
    endDate: Date | null
    nextDueDate: Date | null
  },
  baseDate: Date
): Date | null | undefined {
  // Only recalculate if frequency/dayOfWeek/dayOfMonth is the changed part
  // We always base off "now" for schedule changes (not the old nextDueDate)
  const now = new Date()

  let next: Date

  switch (chore.frequency) {
    case 'daily': {
      next = new Date(now)
      next.setDate(next.getDate() + 1)
      next.setHours(0, 0, 0, 0)
      break
    }
    case 'weekly': {
      next = new Date(now)
      next.setHours(0, 0, 0, 0)
      if (chore.dayOfWeek !== null) {
        const currentDay = next.getDay()
        let daysUntil = chore.dayOfWeek - currentDay
        if (daysUntil <= 0) daysUntil += 7
        next.setDate(next.getDate() + daysUntil)
      } else {
        next.setDate(next.getDate() + 7)
      }
      break
    }
    case 'biweekly': {
      next = new Date(now)
      next.setDate(next.getDate() + 14)
      next.setHours(0, 0, 0, 0)
      break
    }
    case 'monthly':
    case 'bimonthly':
    case 'quarterly':
    case 'halfyearly':
    case 'yearly': {
      next = new Date(now)
      next.setHours(0, 0, 0, 0)
      let monthsToAdd = 1
      if (chore.frequency === 'bimonthly') monthsToAdd = 2
      else if (chore.frequency === 'quarterly') monthsToAdd = 3
      else if (chore.frequency === 'halfyearly') monthsToAdd = 6
      else if (chore.frequency === 'yearly') monthsToAdd = 12
      if (chore.dayOfMonth !== null) {
        next.setMonth(next.getMonth() + monthsToAdd)
        const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
        next.setDate(Math.min(chore.dayOfMonth, lastDay))
      } else {
        next.setMonth(next.getMonth() + monthsToAdd)
      }
      break
    }
    default: {
      next = new Date(now)
      next.setDate(next.getDate() + 7)
      next.setHours(0, 0, 0, 0)
    }
  }

  // Check if next due date exceeds end date
  if (chore.endDate && next > chore.endDate) {
    return null
  }

  return next
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()

  // Verify ownership
  const existing = await prisma.chore.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ── Recalculate nextDueDate when frequency/dayOfWeek/dayOfMonth changes ─────
  // Without this, changing e.g. weekly→monthly would leave the old weekly due date intact
  // until the chore is completed, causing wrong schedule display.
  const frequencyChanged = body.frequency !== undefined && body.frequency !== existing.frequency
  const dayOfWeekChanged = body.dayOfWeek !== undefined && body.dayOfWeek !== existing.dayOfWeek
  const dayOfMonthChanged = body.dayOfMonth !== undefined && body.dayOfMonth !== existing.dayOfMonth

  if (frequencyChanged || dayOfWeekChanged || dayOfMonthChanged) {
    // Recalculate nextDueDate from today, applying the new frequency/schedule
    const newFrequency = body.frequency ?? existing.frequency
    const newDayOfWeek = body.dayOfWeek !== undefined ? body.dayOfWeek : existing.dayOfWeek
    const newDayOfMonth = body.dayOfMonth !== undefined ? body.dayOfMonth : existing.dayOfMonth
    const now = new Date()

    // Temporarily construct a partial chore object for calculateNextDueDate
    // We use now as the "completedAt" to recalculate from today
    const tempChore = {
      frequency: newFrequency,
      dayOfWeek: newDayOfWeek,
      dayOfMonth: newDayOfMonth,
      triggerOnComplete: existing.triggerOnComplete,
      allowEarlyStart: existing.allowEarlyStart,
      endDate: existing.endDate,
      nextDueDate: existing.nextDueDate,
    }

    const recalculated = calculateNextDueDateLocal(tempChore, now)
    if (recalculated !== undefined) {
      body.nextDueDate = recalculated
    }
  }

  const chore = await prisma.chore.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
      ...(body.frequency !== undefined ? { frequency: body.frequency } : {}),
      ...(body.dayOfWeek !== undefined ? { dayOfWeek: body.dayOfWeek } : {}),
      ...(body.dayOfMonth !== undefined ? { dayOfMonth: body.dayOfMonth } : {}),
      ...(body.rotationInterval !== undefined ? { rotationInterval: body.rotationInterval } : {}),
      ...(body.currentAssigneeId !== undefined ? { currentAssigneeId: body.currentAssigneeId } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.startDate !== undefined ? { startDate: body.startDate ? new Date(body.startDate) : null } : {}),
      ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(body.endDate) : null } : {}),
      ...(body.nextDueDate !== undefined ? { nextDueDate: body.nextDueDate ? new Date(body.nextDueDate) : null } : {}),
      ...(body.triggerOnComplete !== undefined ? { triggerOnComplete: body.triggerOnComplete } : {}),
      ...(body.autoRotateOnComplete !== undefined ? { autoRotateOnComplete: body.autoRotateOnComplete } : {}),
      ...(body.allowEarlyStart !== undefined ? { allowEarlyStart: body.allowEarlyStart } : {}),
      ...(body.emailReminder !== undefined ? { emailReminder: body.emailReminder } : {}),
      ...(body.emailReminderDays !== undefined ? { emailReminderDays: body.emailReminderDays } : {}),
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

  // Notify chore views to refresh
  dispatchAppEvent(AppEvents.CHORES_UPDATED)

  if (body.title !== undefined && body.title !== existing.title) {
    void createAuditLog(
      user,
      'update',
      'chore',
      id,
      `Renamed chore "${existing.title}" to "${body.title}"`,
      { before: { title: existing.title }, after: { title: body.title } }
    )
  }

  return NextResponse.json(chore)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  const { id } = await params

  const existing = await prisma.chore.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.chore.delete({ where: { id } })

  void createAuditLog(
    user,
    'delete',
    'chore',
    id,
    `Deleted chore "${existing.title}"`,
    { chore: { title: existing.title, frequency: existing.frequency } }
  )

  // Notify chore views to refresh
  dispatchAppEvent(AppEvents.CHORES_UPDATED)

  return NextResponse.json({ success: true })
}