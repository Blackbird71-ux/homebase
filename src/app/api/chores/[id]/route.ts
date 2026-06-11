import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'
import { calculateNextDueDateFromNow } from '@/lib/chore-helpers'
import { todayBoundsInTz } from '@/lib/timezone'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    let val = body[key]
    // Coerce empty-string assignee to null so Prisma saves null (not "")
    if (key === 'currentAssigneeId' && val === '') val = null
    // Multi-day weekly: persist the selected weekdays as a JSON array string.
    if (key === 'daysOfWeek') val = Array.isArray(val) && val.length > 0 ? JSON.stringify(val) : null
    // DateTime columns arrive from the form as strings (date inputs send bare
    // "YYYY-MM-DD", which Prisma rejects as not ISO-8601). Coerce to Date / null,
    // matching the POST route.
    if (key === 'startDate' || key === 'endDate' || key === 'startTime') {
      val = val ? new Date(val) : null
    }
    updateData[key] = val
  }

  // Recompute nextDueDate only when a field that actually affects the schedule
  // changed. The edit form posts the FULL body on every save, so we compare
  // against the stored record — keying off "was this field present in the body"
  // would re-anchor the due date on every edit (even a rename), pushing it a
  // whole interval into the future and ignoring the start date the user set.
  // See chore-helpers.ts for the distinction between calculateNextDueDateFromNow
  // (edit) and calculateNextDueDate (complete).
  const startDateChanged =
    'startDate' in updateData &&
    ((updateData.startDate instanceof Date ? updateData.startDate.getTime() : null) !==
      (existing.startDate ? existing.startDate.getTime() : null))
  const needsRecalc =
    ('frequency' in updateData && updateData.frequency !== existing.frequency) ||
    ('dayOfWeek' in updateData && updateData.dayOfWeek !== existing.dayOfWeek) ||
    ('daysOfWeek' in updateData && updateData.daysOfWeek !== existing.daysOfWeek) ||
    ('dayOfMonth' in updateData && updateData.dayOfMonth !== existing.dayOfMonth) ||
    startDateChanged

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

  // Include the same computed isOverdue flag as the GET route so the client
  // doesn't lose the overdue badge after an edit (until the next refresh).
  const { start: todayStart } = todayBoundsInTz(user.timezone ?? 'UTC')

  return NextResponse.json({
    ...updated,
    isOverdue: updated.nextDueDate ? updated.nextDueDate < todayStart : false,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    completions: updated.completions.map((c) => ({
      ...c,
      completedAt: c.completedAt.toISOString(),
    })),
  })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  return NextResponse.json({ message: 'Deleted' })
}
