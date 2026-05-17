import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

// POST /api/trips/[id]/days/[dayId]/activities/[activityId]/tags
// Body: { tagId } — toggles the tag on/off the activity
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string; activityId: string }> },
) {
  const user = await requireSession()
  const { id, dayId, activityId } = await params

  // Verify trip ownership
  const trip = await prisma.trip.findFirst({
    where: { id, familyId: user.familyId },
    select: { id: true },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  // Verify activity
  const activity = await prisma.tripActivity.findFirst({
    where: { id: activityId, day: { tripId: id, id: dayId } },
    include: { tags: { include: { tag: true } } },
  })
  if (!activity) return NextResponse.json({ error: 'Activity not found' }, { status: 404 })

  const body = await req.json()
  const { tagId } = body
  if (!tagId) return NextResponse.json({ error: 'tagId is required' }, { status: 400 })

  // Verify tag belongs to family (trip-scoped)
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, familyId: user.familyId, scope: 'trip' },
  })
  if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 })

  const exists = activity.tags.some((t) => t.tagId === tagId)

  if (exists) {
    await prisma.activityTag.delete({
      where: { activityId_tagId: { activityId, tagId } },
    })
  } else {
    await prisma.activityTag.create({
      data: { activityId, tagId },
    })
  }

  // Return updated tag list
  const updated = await prisma.tripActivity.findUnique({
    where: { id: activityId },
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
