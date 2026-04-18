import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { validateEventDates, maskPersonalEvent } from '@/lib/event-helpers'
import { pushEventToGoogle } from '@/lib/google-sync'
import { getAccessToken, deleteGoogleEvent } from '@/lib/google-calendar'

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
  return NextResponse.json(maskPersonalEvent(event, user.id))
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { title, description, start, end, isAllDay, category, color, isPersonal } = body

  const existing = await prisma.event.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.isPersonal && existing.createdBy !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
      ...(isPersonal !== undefined && { isPersonal }),
      ...(category !== undefined && { category }),
      ...(color !== undefined && { color }),
    },
  })

  void pushEventToGoogle(id, 'update')

  return NextResponse.json(maskPersonalEvent(updated, user.id))
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

  if (existing.isPersonal && existing.createdBy !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Pre-load Google sync data BEFORE deleting (cascade will remove sync rows)
  const syncRows = await prisma.googleCalendarSync.findMany({
    where: { eventId: id },
  })
  const userIds = syncRows.map((r) => r.userId)
  const connectedUsers = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, googleRefreshToken: true },
      })
    : []

  await prisma.event.delete({ where: { id } })

  // Fire-and-forget: delete from each user's Google Calendar
  void (async () => {
    for (const row of syncRows) {
      const u = connectedUsers.find((x) => x.id === row.userId)
      if (!u?.googleRefreshToken) continue
      try {
        const token = await getAccessToken(u.googleRefreshToken)
        await deleteGoogleEvent(token, row.googleEventId)
      } catch (err) {
        console.error('[events] Failed to delete Google event', err)
      }
    }
  })()

  return NextResponse.json({ success: true })
}
