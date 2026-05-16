import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'
import { AppEvents, dispatchAppEvent } from '@/lib/app-events'
import { calculateNextDueDateFromNow } from '@/lib/chore-helpers'

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

  // If frequency or day-related fields changed, recalculate nextDueDate from now.
  // We use "from now" deliberately here — the user edited the schedule so the old
  // anchor is no longer meaningful. See chore-helpers.ts for the distinction between
  // calculateNextDueDateFromNow (edit) and calculateNextDueDate (complete).
  const needsRecalc =
    changedFields.includes('frequency') ||
    changedFields.includes('dayOfWeek') ||
    changedFields.includes('dayOfMonth')

  if (needsRecalc) {
    const timezone = user.timezone ?? 'UTC'
    const merged = { ...existing, ...updateData }
    const newNextDueDate = calculateNextDueDateFromNow(merged, timezone)
    if (newNextDueDate === null) {
      updateData.nextDueDate = null
      updateData.isActive = false
    } else {
      updateData.nextDueDate = newNextDueDate
    }
  }

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
    { title: existing.title }
  )

  dispatchAppEvent(AppEvents.CHORES_UPDATED)

  return NextResponse.json({ message: 'Deleted' })
}
