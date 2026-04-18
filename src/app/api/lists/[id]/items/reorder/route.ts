import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { items } = body

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 })
  }

  for (const item of items) {
    if (typeof item.id !== 'string' || typeof item.sortOrder !== 'number') {
      return NextResponse.json(
        { error: 'each item must have id (string) and sortOrder (number)' },
        { status: 400 }
      )
    }
  }

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify all items belong to this list
  const ids = (items as { id: string; sortOrder: number }[]).map((i) => i.id)
  const owned = await prisma.listItem.findMany({
    where: { id: { in: ids }, listId: id },
    select: { id: true },
  })
  if (owned.length !== ids.length) {
    return NextResponse.json({ error: 'Some items not found in this list' }, { status: 404 })
  }

  await prisma.$transaction(
    (items as { id: string; sortOrder: number }[]).map(({ id: itemId, sortOrder }) =>
      prisma.listItem.update({ where: { id: itemId }, data: { sortOrder } })
    )
  )

  return NextResponse.json({ ok: true })
}
