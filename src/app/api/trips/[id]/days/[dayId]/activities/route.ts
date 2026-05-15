import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

// POST /api/trips/[id]/days/[dayId]/activities — create an activity
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> },
) {
  const user = await requireSession()
  const { id, dayId } = await params

  // Verify trip belongs to family
  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true },
  })
  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  // Verify day exists
  const day = await prisma.tripDay.findFirst({
    where: { id: dayId, tripId: id },
  })
  if (!day) {
    return NextResponse.json({ error: 'Day not found' }, { status: 404 })
  }

  const body = await req.json()
  const { title, location, startTime, endTime, notes, category, sortOrder } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const maxOrder = await prisma.tripActivity.aggregate({
    where: { dayId },
    _max: { sortOrder: true },
  })

  const activity = await prisma.tripActivity.create({
    data: {
      dayId,
      title: title.trim(),
      location: location ?? null,
      startTime: startTime ? new Date(startTime) : null,
      endTime: endTime ? new Date(endTime) : null,
      notes: notes ?? null,
      category: category ?? null,
      sortOrder: sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })

  return NextResponse.json(
    {
      ...activity,
      startTime: activity.startTime?.toISOString() ?? null,
      endTime: activity.endTime?.toISOString() ?? null,
      createdAt: activity.createdAt.toISOString(),
    },
    { status: 201 },
  )
}
