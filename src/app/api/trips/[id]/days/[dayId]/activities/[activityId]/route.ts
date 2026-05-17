import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

function serializeActivity(activity: {
  id: string
  dayId: string
  title: string
  location: string | null
  startTime: Date | null
  endTime: Date | null
  notes: string | null
  category: string | null
  sortOrder: number
  createdAt: Date
  tags: { tag: { id: string; name: string; emoji: string | null; color: string | null } }[]
}) {
  return {
    id: activity.id,
    dayId: activity.dayId,
    title: activity.title,
    location: activity.location,
    startTime: activity.startTime?.toISOString() ?? null,
    endTime: activity.endTime?.toISOString() ?? null,
    notes: activity.notes,
    category: activity.category,
    sortOrder: activity.sortOrder,
    createdAt: activity.createdAt.toISOString(),
    tags: activity.tags.map((t) => ({
      id: t.tag.id,
      name: t.tag.name,
      emoji: t.tag.emoji,
      color: t.tag.color,
    })),
  }
}

// PATCH /api/trips/[id]/days/[dayId]/activities/[activityId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string; activityId: string }> },
) {
  const user = await requireSession()
  const { id, dayId, activityId } = await params

  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const activity = await prisma.tripActivity.findFirst({
    where: { id: activityId, day: { tripId: id, id: dayId } },
  })
  if (!activity) return NextResponse.json({ error: 'Activity not found' }, { status: 404 })

  const body = await req.json()
  const { title, location, startTime, endTime, notes, category, sortOrder } = body

  const updated = await prisma.tripActivity.update({
    where: { id: activityId },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(location !== undefined ? { location } : {}),
      ...(startTime !== undefined ? { startTime: startTime ? new Date(startTime) : null } : {}),
      ...(endTime !== undefined ? { endTime: endTime ? new Date(endTime) : null } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    },
    include: { tags: { include: { tag: true } } },
  })

  return NextResponse.json(serializeActivity(updated))
}

// DELETE /api/trips/[id]/days/[dayId]/activities/[activityId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string; activityId: string }> },
) {
  const user = await requireSession()
  const { id, dayId, activityId } = await params

  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const activity = await prisma.tripActivity.findFirst({
    where: { id: activityId, day: { tripId: id, id: dayId } },
  })
  if (!activity) return NextResponse.json({ error: 'Activity not found' }, { status: 404 })

  await prisma.tripActivity.delete({ where: { id: activityId } })
  return NextResponse.json({ success: true })
}
