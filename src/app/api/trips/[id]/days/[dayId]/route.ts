import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

// PATCH /api/trips/[id]/days/[dayId] — update a day
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, dayId } = await params

  // Verify trip belongs to family
  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true },
  })
  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  const day = await prisma.tripDay.findFirst({
    where: { id: dayId, tripId: id },
  })
  if (!day) {
    return NextResponse.json({ error: 'Day not found' }, { status: 404 })
  }

  const body = await req.json()
  const { label, notes, sortOrder } = body

  const updated = await prisma.tripDay.update({
    where: { id: dayId },
    data: {
      ...(label !== undefined ? { label: label ?? null } : {}),
      ...(notes !== undefined ? { notes: notes ?? null } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    },
    include: {
      activities: {
        orderBy: { sortOrder: 'asc' },
        include: { tags: { include: { tag: true } } },
      },
      tags: { include: { tag: true } },
    },
  })

  return NextResponse.json({
    ...updated,
    date: updated.date.toISOString(),
    tags: updated.tags.map((t) => ({
      id: t.tag.id,
      name: t.tag.name,
      emoji: t.tag.emoji,
      color: t.tag.color,
    })),
    activities: updated.activities.map((a) => ({
      ...a,
      startTime: a.startTime?.toISOString() ?? null,
      endTime: a.endTime?.toISOString() ?? null,
      tags: a.tags.map((t) => ({
        id: t.tag.id,
        name: t.tag.name,
        emoji: t.tag.emoji,
        color: t.tag.color,
      })),
    })),
    createdAt: updated.createdAt.toISOString(),
  })
}

// DELETE /api/trips/[id]/days/[dayId] — delete a day (cascades activities)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, dayId } = await params

  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true },
  })
  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  const day = await prisma.tripDay.findFirst({
    where: { id: dayId, tripId: id },
  })
  if (!day) {
    return NextResponse.json({ error: 'Day not found' }, { status: 404 })
  }

  await prisma.tripDay.delete({ where: { id: dayId } })

  return NextResponse.json({ success: true })
}
