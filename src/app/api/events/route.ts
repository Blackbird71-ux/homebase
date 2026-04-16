import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { validateEventDates } from '@/lib/event-helpers'

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const where: Record<string, unknown> = { familyId: user.familyId }
  if (from && to) {
    where.start = { gte: new Date(from), lte: new Date(to) }
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { start: 'asc' },
  })

  return NextResponse.json(events.map(e => ({
    ...e,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    createdAt: e.createdAt.toISOString(),
  })))
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { title, description, start, end, isAllDay, category, color } = body

  if (!title || !start || !end) {
    return NextResponse.json({ error: 'title, start, and end are required' }, { status: 400 })
  }

  const validation = validateEventDates(start, end, isAllDay)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const event = await prisma.event.create({
    data: {
      title,
      description: description ?? null,
      start: new Date(start),
      end: new Date(end),
      isAllDay: isAllDay ?? false,
      category: category ?? null,
      color: color ?? null,
      createdBy: user.id,
      familyId: user.familyId,
    },
  })

  return NextResponse.json({
    ...event,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    createdAt: event.createdAt.toISOString(),
  }, { status: 201 })
}
