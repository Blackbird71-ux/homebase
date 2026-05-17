import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

// POST /api/trips/[id]/days/[dayId]/tags
// Body: { tagId } — toggles the tag on/off the day
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> },
) {
  const user = await requireSession()
  const { id, dayId } = await params

  // Verify trip ownership
  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  // Verify day
  const day = await prisma.tripDay.findFirst({
    where: { id: dayId, tripId: id },
    include: { tags: { include: { tag: true } } },
  })
  if (!day) return NextResponse.json({ error: 'Day not found' }, { status: 404 })

  const body = await req.json()
  const { tagId } = body
  if (!tagId) return NextResponse.json({ error: 'tagId is required' }, { status: 400 })

  // Verify tag belongs to family
  const tag = await prisma.tripTag.findFirst({
    where: { id: tagId, familyId: user.familyId },
  })
  if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 })

  const exists = day.tags.some((t) => t.tagId === tagId)

  if (exists) {
    // Remove
    await prisma.tripDayTag.delete({
      where: { dayId_tagId: { dayId, tagId } },
    })
  } else {
    // Add
    await prisma.tripDayTag.create({
      data: { dayId, tagId },
    })
  }

  // Return updated tag list
  const updated = await prisma.tripDay.findUnique({
    where: { id: dayId },
    include: { tags: { include: { tag: true } } },
  })

  return NextResponse.json(
    updated!.tags.map((t) => ({
      id: t.tag.id,
      name: t.tag.name,
      emoji: t.tag.emoji,
      color: t.tag.color,
    }))
  )
}
