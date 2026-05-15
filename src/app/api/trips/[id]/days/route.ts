import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

// GET /api/trips/[id]/days — list all days (with activities) for a trip
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSession()
  const { id } = await params

  // Verify trip exists and belongs to family
  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true },
  })
  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  const days = await prisma.tripDay.findMany({
    where: { tripId: id },
    orderBy: { sortOrder: 'asc' },
    include: {
      activities: { orderBy: { sortOrder: 'asc' } },
    },
  })

  const serialized = days.map((day) => ({
    ...day,
    date: day.date.toISOString(),
    activities: day.activities.map((a) => ({
      ...a,
      startTime: a.startTime?.toISOString() ?? null,
      endTime: a.endTime?.toISOString() ?? null,
    })),
    createdAt: day.createdAt.toISOString(),
  }))

  return NextResponse.json(serialized)
}

// POST /api/trips/[id]/days — create a new day for the trip
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSession()
  const { id } = await params

  // Verify trip exists and belongs to family
  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true, startDate: true, endDate: true },
  })
  if (!trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  const body = await req.json()
  const { date, label, notes, sortOrder } = body

  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 })
  }

  const dayDate = new Date(date)

  // Validate date is within trip range
  if (dayDate < trip.startDate || dayDate > trip.endDate) {
    return NextResponse.json(
      { error: 'Day date must be within the trip date range' },
      { status: 400 },
    )
  }

  // Check for duplicate date
  const existing = await prisma.tripDay.findUnique({
    where: { tripId_date: { tripId: id, date: dayDate } },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'A day for this date already exists' },
      { status: 409 },
    )
  }

  const maxOrder = await prisma.tripDay.aggregate({
    where: { tripId: id },
    _max: { sortOrder: true },
  })

  const day = await prisma.tripDay.create({
    data: {
      tripId: id,
      date: dayDate,
      label: label ?? null,
      notes: notes ?? null,
      sortOrder: sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
    },
    include: {
      activities: { orderBy: { sortOrder: 'asc' } },
    },
  })

  return NextResponse.json(
    {
      ...day,
      date: day.date.toISOString(),
      activities: day.activities.map((a) => ({
        ...a,
        startTime: a.startTime?.toISOString() ?? null,
        endTime: a.endTime?.toISOString() ?? null,
      })),
      createdAt: day.createdAt.toISOString(),
    },
    { status: 201 },
  )
}
