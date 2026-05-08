import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'

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

  return NextResponse.json({ success: true })
}