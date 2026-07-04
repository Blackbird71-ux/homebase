import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

// PATCH /api/trips/tags/[tagId] — update a trip-scoped tag
async function _PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tagId: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
async function _DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ tagId: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tagId } = await params

  const tag = await prisma.tag.findFirst({
    where: { id: tagId, familyId: user.familyId, scope: 'trip' },
  })
  if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 })

  await prisma.tag.delete({ where: { id: tagId } })
  return NextResponse.json({ success: true })
}

export const PATCH = withRouteErrors(_PATCH)
export const DELETE = withRouteErrors(_DELETE)
