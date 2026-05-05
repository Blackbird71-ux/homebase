import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const user = await requireSession()
  const { id, itemId } = await params
  const body = await req.json()
  const { content, isCompleted, category, sortOrder, dueDate, isLocked, unitPrice, quantity } = body

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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const user = await requireSession()
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
