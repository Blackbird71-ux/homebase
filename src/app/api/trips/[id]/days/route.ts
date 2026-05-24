import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

function serializeDay(day: {
  id: string
  tripId: string
  date: Date
  label: string | null
  notes: string | null
  sortOrder: number
  createdAt: Date
  tags: { tag: { id: string; name: string; emoji: string | null; color: string | null } }[]
  activities: {
    id: string
    dayId: string
    title: string
    location: string | null
    startTime: Date | null
    endTime: Date | null
    notes: string | null
    category: string | null
    sortOrder: number
    showOnCalendar: boolean
    createdAt: Date
    tags: { tag: { id: string; name: string; emoji: string | null; color: string | null } }[]
  }[]
}) {
  return {
    id: day.id,
    tripId: day.tripId,
    date: day.date.toISOString(),
    label: day.label,
    notes: day.notes,
    sortOrder: day.sortOrder,
    createdAt: day.createdAt.toISOString(),
    tags: day.tags.map((t) => ({
      id: t.tag.id,
      name: t.tag.name,
      emoji: t.tag.emoji,
      color: t.tag.color,
    })),
    activities: day.activities.map((a) => ({
      id: a.id,
      dayId: a.dayId,
      title: a.title,
      location: a.location,
      startTime: a.startTime?.toISOString() ?? null,
      endTime: a.endTime?.toISOString() ?? null,
      notes: a.notes,
      category: a.category,
      sortOrder: a.sortOrder,
      showOnCalendar: a.showOnCalendar,
      createdAt: a.createdAt.toISOString(),
      tags: a.tags.map((t) => ({
        id: t.tag.id,
        name: t.tag.name,
        emoji: t.tag.emoji,
        color: t.tag.color,
      })),
    })),
  }
}

// GET /api/trips/[id]/days
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSession()
  const { id } = await params

  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const days = await prisma.tripDay.findMany({
    where: { tripId: id },
    orderBy: { date: 'asc' },
    include: {
      activities: {
        orderBy: { sortOrder: 'asc' },
        include: { tags: { include: { tag: true } } },
      },
      tags: { include: { tag: true } },
    },
  })

  return NextResponse.json(days.map(serializeDay))
}

// POST /api/trips/[id]/days
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSession()
  const { id } = await params

  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true, startDate: true, endDate: true },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const body = await req.json()
  const { date, label, notes, sortOrder } = body

  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 })

  const dayDate = new Date(date)

  if (dayDate < trip.startDate || dayDate > trip.endDate) {
    return NextResponse.json({ error: 'Day date must be within the trip date range' }, { status: 400 })
  }

  const existing = await prisma.tripDay.findUnique({
    where: { tripId_date: { tripId: id, date: dayDate } },
  })
  if (existing) return NextResponse.json({ error: 'A day for this date already exists' }, { status: 409 })

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
      activities: {
        orderBy: { sortOrder: 'asc' },
        include: { tags: { include: { tag: true } } },
      },
      tags: { include: { tag: true } },
    },
  })

  return NextResponse.json(serializeDay(day), { status: 201 })
}
