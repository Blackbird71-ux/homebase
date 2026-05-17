import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

// PATCH /api/trips/tags/[tagId] — update a trip-scoped tag
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tagId: string }> },
) {
  const user = await requireSession()
  const { tagId } = await params

  const tag = await prisma.tag.findFirst({
    where: { id: tagId, familyId: user.familyId, scope: 'trip' },
  })
  if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 })

  const body = await req.json()
  const { name, emoji, color, sortOrder } = body

  const updated = await prisma.tag.update({
    where: { id: tagId },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(emoji !== undefined ? { emoji: emoji?.trim() || null } : {}),
      ...(color !== undefined ? { color: color || null } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    },
  })

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    emoji: updated.emoji,
    color: updated.color,
    sortOrder: updated.sortOrder,
    createdAt: updated.createdAt.toISOString(),
  })
}

// DELETE /api/trips/tags/[tagId] — delete a trip-scoped tag (cascades off activities/days)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tagId: string }> },
) {
  const user = await requireSession()
  const { tagId } = await params

  const tag = await prisma.tag.findFirst({
    where: { id: tagId, familyId: user.familyId, scope: 'trip' },
  })
  if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 })

  await prisma.tag.delete({ where: { id: tagId } })
  return NextResponse.json({ success: true })
}
