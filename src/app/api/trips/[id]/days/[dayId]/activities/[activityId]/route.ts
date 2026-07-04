import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

function serializeActivity(activity: {
  id: string
  dayId: string
  title: string
  location: string | null
  locationLat: number | null
  locationLng: number | null
  startTime: Date | null
  endTime: Date | null
  notes: string | null
  category: string | null
  sortOrder: number
  showOnCalendar: boolean
  createdAt: Date
  tags: { tag: { id: string; name: string; emoji: string | null; color: string | null } }[]
}) {
  return {
    id: activity.id,
    dayId: activity.dayId,
    title: activity.title,
    location: activity.location,
    locationLat: activity.locationLat,
    locationLng: activity.locationLng,
    startTime: activity.startTime?.toISOString() ?? null,
    endTime: activity.endTime?.toISOString() ?? null,
    notes: activity.notes,
    category: activity.category,
    sortOrder: activity.sortOrder,
    showOnCalendar: activity.showOnCalendar,
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
async function _PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string; activityId: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  const { title, location, locationLat, locationLng, startTime, endTime, notes, category, sortOrder, showOnCalendar, targetDayId } = body

  if (targetDayId !== undefined) {
    const targetDay = await prisma.tripDay.findFirst({
      where: { id: targetDayId, tripId: id },
      select: { id: true },
    })
    if (!targetDay) return NextResponse.json({ error: 'Target day not found' }, { status: 404 })
  }

  const updated = await prisma.tripActivity.update({
    where: { id: activityId },
    data: {
      ...(targetDayId !== undefined ? { dayId: targetDayId } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(location !== undefined ? { location } : {}),
      ...(locationLat !== undefined ? { locationLat: locationLat ?? null } : {}),
      ...(locationLng !== undefined ? { locationLng: locationLng ?? null } : {}),
      ...(startTime !== undefined ? { startTime: startTime ? new Date(startTime) : null } : {}),
      ...(endTime !== undefined ? { endTime: endTime ? new Date(endTime) : null } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(showOnCalendar !== undefined ? { showOnCalendar } : {}),
    },
    include: { tags: { include: { tag: true } } },
  })

  return NextResponse.json(serializeActivity(updated))
}

// DELETE /api/trips/[id]/days/[dayId]/activities/[activityId]
async function _DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string; activityId: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

export const PATCH = withRouteErrors(_PATCH)
export const DELETE = withRouteErrors(_DELETE)
