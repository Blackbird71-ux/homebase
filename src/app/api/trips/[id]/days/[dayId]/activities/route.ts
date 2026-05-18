import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

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
    createdAt: activity.createdAt.toISOString(),
    tags: activity.tags.map((t) => ({
      id: t.tag.id,
      name: t.tag.name,
      emoji: t.tag.emoji,
      color: t.tag.color,
    })),
  }
}

// POST /api/trips/[id]/days/[dayId]/activities — create an activity
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> },
) {
  const user = await requireSession()
  const { id, dayId } = await params

  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const day = await prisma.tripDay.findFirst({ where: { id: dayId, tripId: id } })
  if (!day) return NextResponse.json({ error: 'Day not found' }, { status: 404 })

  const body = await req.json()
  const { title, location, locationLat, locationLng, startTime, endTime, notes, category, sortOrder } = body

  if (!title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const maxOrder = await prisma.tripActivity.aggregate({
    where: { dayId },
    _max: { sortOrder: true },
  })

  const activity = await prisma.tripActivity.create({
    data: {
      dayId,
      title: title.trim(),
      location: location ?? null,
      locationLat: locationLat ?? null,
      locationLng: locationLng ?? null,
      startTime: startTime ? new Date(startTime) : null,
      endTime: endTime ? new Date(endTime) : null,
      notes: notes ?? null,
      category: category ?? null,
      sortOrder: sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
    },
    include: { tags: { include: { tag: true } } },
  })

  return NextResponse.json(serializeActivity(activity), { status: 201 })
}
