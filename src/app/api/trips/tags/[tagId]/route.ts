import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

// PATCH /api/trips/tags/[tagId] — update a tag
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tagId: string }> },
) {
  const user = await requireSession()
  const { tagId } = await params

  const tag = await prisma.tripTag.findFirst({
    where: { id: tagId, familyId: user.familyId },
  })
  if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 })

  const body = await req.json()
  const { name, emoji, color, sortOrder } = body

  const updated = await prisma.tripTag.update({
    where: { id: tagId },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(emoji !== undefined ? { emoji: emoji?.trim() || null } : {}),
      ...(color !== undefined ? { color: color || null } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    },
  })

  return NextResponse.json({ ...updated, createdAt: updated.createdAt.toISOString() })
}

// DELETE /api/trips/tags/[tagId] — delete a tag (cascades off activities)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tagId: string }> },
) {
  const user = await requireSession()
  const { tagId } = await params

  const tag = await prisma.tripTag.findFirst({
    where: { id: tagId, familyId: user.familyId },
  })
  if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 })

  await prisma.tripTag.delete({ where: { id: tagId } })
  return NextResponse.json({ success: true })
}
