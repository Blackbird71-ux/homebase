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

// POST /api/trips/[id]/days/reverse
// Reverses the content (labels, notes, activities, tags) of all days while keeping dates fixed.
export async function POST(
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

  if (days.length < 2) {
    return NextResponse.json(days.map(serializeDay))
  }

  const reversed = [...days].reverse()

  await prisma.$transaction([
    // Swap labels and notes on each day record (dates stay fixed)
    ...days.map((day, i) =>
      prisma.tripDay.update({
        where: { id: day.id },
        data: {
          label: reversed[i].label,
          notes: reversed[i].notes,
        },
      })
    ),
    // Move activities: each activity moves to the reversed-position day
    ...days.flatMap((day, i) =>
      day.activities.map((activity) =>
        prisma.tripActivity.update({
          where: { id: activity.id },
          data: { dayId: reversed[i].id },
        })
      )
    ),
    // Swap day tags: clear all then re-create with swapped assignments
    prisma.dayTag.deleteMany({ where: { dayId: { in: days.map((d) => d.id) } } }),
    ...days.flatMap((day, i) =>
      reversed[i].tags.map((dt) =>
        prisma.dayTag.create({ data: { dayId: day.id, tagId: dt.tagId } })
      )
    ),
  ])

  const updatedDays = await prisma.tripDay.findMany({
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

  return NextResponse.json(updatedDays.map(serializeDay))
}
