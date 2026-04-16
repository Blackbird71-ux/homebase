import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { validateEventDates } from '@/lib/event-helpers'

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
  return NextResponse.json({
    ...event,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    createdAt: event.createdAt.toISOString(),
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { title, description, start, end, isAllDay, category, color } = body

  const existing = await prisma.event.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (start && end) {
    const validation = validateEventDates(start, end, isAllDay)
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const updated = await prisma.event.update({
    where: { id },
    data: {
      ...(title && { title }),
      ...(description !== undefined && { description }),
      ...(start && { start: new Date(start) }),
      ...(end && { end: new Date(end) }),
      ...(isAllDay !== undefined && { isAllDay }),
      ...(category !== undefined && { category }),
      ...(color !== undefined && { color }),
    },
  })

  return NextResponse.json({
    ...updated,
    start: updated.start.toISOString(),
    end: updated.end.toISOString(),
    createdAt: updated.createdAt.toISOString(),
  })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const existing = await prisma.event.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.event.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
