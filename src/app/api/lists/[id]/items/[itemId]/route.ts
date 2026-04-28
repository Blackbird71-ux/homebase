import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

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
  return NextResponse.json({ success: true })
}
