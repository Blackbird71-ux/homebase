import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params

  const event = await prisma.event.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const attendees = await prisma.eventAttendee.findMany({
    where: { eventId: id },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  })

  return NextResponse.json(attendees)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { status } = body

  if (!status || !['going', 'maybe', 'declined', 'invited'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const event = await prisma.event.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const attendee = await prisma.eventAttendee.upsert({
    where: { eventId_userId: { eventId: id, userId: user.id } },
    update: { status },
    create: {
      eventId: id,
      userId: user.id,
      status,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  })

  return NextResponse.json(attendee)
}
