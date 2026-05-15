import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'
import { AppEvents, dispatchAppEvent } from '@/lib/app-events'
import { utcMidnightToLocalMidnight } from '@/lib/timezone'

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
  baseDate: Date,
  timezone: string
): Date | null | undefined {
  // Only recalculate if frequency/dayOfWeek/dayOfMonth is the changed part
  // We always base off "now" for schedule changes (not the old nextDueDate)
  const now = new Date()

  let next: Date

  switch (chore.frequency) {
    case 'daily': {
      next = new Date(now)
      next.setUTCDate(next.getUTCDate() + 1)
      next.setUTCHours(0, 0, 0, 0)
      break
    }
    case 'weekly': {
      next = new Date(now)
      next.setUTCHours(0, 0, 0, 0)
      if (chore.dayOfWeek !== null) {
        const currentDay = next.getUTCDay()
        let daysUntil = chore.dayOfWeek - currentDay
        if (daysUntil <= 0) daysUntil += 7
        next.setUTCDate(next.getUTCDate() + daysUntil)
      } else {
        next.setUTCDate(next.getUTCDate() + 7)
      }
      break
    }
    case 'biweekly': {
      next = new Date(now)
      next.setUTCDate(next.getUTCDate() + 14)
      next.setUTCHours(0, 0, 0, 0)
      break
    }
    case 'monthly':
    case 'bimonthly':
    case 'quarterly':
    case 'halfyearly':
    case 'yearly': {
      next = new Date(now)
      next.setUTCHours(0, 0, 0, 0)
      let monthsToAdd = 1
      if (chore.frequency === 'bimonthly') monthsToAdd = 2
      else if (chore.frequency === 'quarterly') monthsToAdd = 3
      else if (chore.frequency === 'halfyearly') monthsToAdd = 6
      else if (chore.frequency === 'yearly') monthsToAdd = 12
      if (chore.dayOfMonth !== null) {
        next.setUTCMonth(next.getUTCMonth() + monthsToAdd)
        const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
        next.setUTCDate(Math.min(chore.dayOfMonth, lastDay))
      } else {
        next.setUTCMonth(next.getUTCMonth() + monthsToAdd)
      }
      break
    }
    default: {
      next = new Date(now)
      next.setUTCDate(next.getUTCDate() + 7)
      next.setUTCHours(0, 0, 0, 0)
    }
  }

  // Check if next due date exceeds end date
  if (chore.endDate && next > chore.endDate) {
    return null
  }

  // Shift from UTC midnight to user's local-time midnight
  return utcMidnightToLocalMidnight(next, timezone)
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

  // Determine which fields changed
  const changedFields = Object.keys(body).filter(
    (key) => key !== 'id' && body[key] !== undefined
  )

  // Build update payload
  const updateData: Record<string, unknown> = {}
  for (const key of changedFields) {
    updateData[key] = body[key]
  }

  // If frequency or day-related fields changed, recalculate nextDueDate
  const needsRecalc =
    changedFields.includes('frequency') ||
    changedFields.includes('dayOfWeek') ||
    changedFields.includes('dayOfMonth')

  if (needsRecalc) {
    const timezone = user.timezone ?? 'UTC'
    const merged = { ...existing, ...updateData }
    const newNextDueDate = calculateNextDueDateLocal(merged, new Date(), timezone)
    if (newNextDueDate === undefined) {
      // Function returned undefined (shouldn't happen), skip update
    } else if (newNextDueDate === null) {
      updateData.nextDueDate = null
      updateData.isActive = false
    } else {
      updateData.nextDueDate = newNextDueDate
    }
  }

  // If only isActive is being toggled and no other changes, just do that
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ message: 'No changes detected' })
  }

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

  // Audit log for chore changes
  if (changedFields.length > 0) {
    void createAuditLog(
      user,
      'update',
      'chore',
      id,
      `Updated chore: ${updated.title}`,
      { changedFields, previous: existing, current: updated }
    )
  }

  // Dispatch event so the calendar UI refreshes if events depend on chores
  dispatchAppEvent(AppEvents.CHORES_UPDATED)

  return NextResponse.json({
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

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  const { id } = await params

  // Verify ownership
  const existing = await prisma.chore.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.chore.delete({ where: { id } })

  // Audit log
  void createAuditLog({
    action: 'CHORE_DELETED',
    entityType: 'chore',
    entityId: id,
    familyId: user.familyId,
    userId: user.id,
    metadata: { title: existing.title },
  })

  dispatchAppEvent(AppEvents.CHORES_UPDATED)

  return NextResponse.json({ message: 'Deleted' })
}
