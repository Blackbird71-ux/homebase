import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'

async function _PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, itemId } = await params
  const body = await req.json()
  const { content, isCompleted, category, sortOrder, dueDate, isLocked, unitPrice, quantity, assignedToUserId } = body

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existing = await prisma.listItem.findFirst({
    where: { id: itemId, listId: id },
  })
  if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const parsed = dueDate ? new Date(dueDate) : null
  if (parsed !== null && isNaN(parsed.getTime())) {
    return NextResponse.json({ error: 'dueDate is not a valid ISO date' }, { status: 400 })
  }

  // Validate assignedToUserId if a non-null value is provided — must be a family member.
  // null/undefined fall through so the assignee can still be cleared.
  if (assignedToUserId) {
    const member = await prisma.user.findFirst({
      where: { id: assignedToUserId, familyId: user.familyId },
    })
    if (!member) {
      return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
    }
  }

  const updated = await prisma.listItem.update({
    where: { id: itemId },
    data: {
      ...(content !== undefined && { content }),
      ...(isCompleted !== undefined && { isCompleted }),
      ...(isLocked !== undefined && { isLocked }),
      ...(category !== undefined && { category }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(dueDate !== undefined && { dueDate: parsed }),
      ...(unitPrice !== undefined && { unitPrice }),
      ...(quantity !== undefined && { quantity }),
      ...(assignedToUserId !== undefined && { assignedToUserId }),
    },
  })

  // Log significant changes (completion status, content changes)
  if (isCompleted !== undefined && isCompleted !== existing.isCompleted) {
    void createAuditLog(
      user,
      'update',
      'listItem',
      itemId,
      isCompleted
        ? `Completed "${existing.content}" in list "${list.name}"`
        : `Uncompleted "${existing.content}" in list "${list.name}"`,
      { before: { isCompleted: existing.isCompleted }, after: { isCompleted } }
    )
  } else if (content !== undefined && content !== existing.content) {
    void createAuditLog(
      user,
      'update',
      'listItem',
      itemId,
      `Updated item "${existing.content}" in list "${list.name}"`,
      { before: { content: existing.content }, after: { content } }
    )
  }

  return NextResponse.json(updated)
}

async function _DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, itemId } = await params

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existing = await prisma.listItem.findFirst({
    where: { id: itemId, listId: id },
  })
  if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (existing.isLocked) return NextResponse.json({ error: 'Item is locked' }, { status: 403 })

  await prisma.listItem.delete({ where: { id: itemId } })

  void createAuditLog(
    user,
    'delete',
    'listItem',
    itemId,
    `Deleted "${existing.content}" from list "${list.name}"`,
    { item: { content: existing.content, category: existing.category, listId: id, listName: list.name } }
  )

  return NextResponse.json({ success: true })
}

export const PATCH = withRouteErrors(_PATCH)
export const DELETE = withRouteErrors(_DELETE)
