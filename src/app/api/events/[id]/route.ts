import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { validateEventDates, maskPersonalEvent } from '@/lib/event-helpers'
import { addRecurrenceException } from '@/lib/recurrence'
import { pushEventToGoogle } from '@/lib/google-sync'
import { getAccessToken, deleteGoogleEvent } from '@/lib/google-calendar'
import { createAuditLog } from '@/lib/audit-log'

async function _GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const event = await prisma.event.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(maskPersonalEvent(event, user.id))
}

async function _PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const { title, description, location, start, end, isAllDay, category, color, isPersonal, recurrenceRule, isRecurring, recurrenceEndDate, emailReminder, emailReminderHours, emailReminderEmails } = body

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
      ...(location !== undefined && { location: location ?? null }),
      ...(start && { start: new Date(start) }),
      ...(end && { end: new Date(end) }),
      ...(isAllDay !== undefined && { isAllDay }),
      ...(isPersonal !== undefined && { isPersonal }),
      ...(category !== undefined && { category }),
      ...(color !== undefined && { color }),
      ...(recurrenceRule !== undefined && { recurrenceRule: recurrenceRule ?? null }),
      ...(isRecurring !== undefined && { isRecurring }),
      ...(recurrenceEndDate !== undefined && { recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : null }),
      ...(emailReminder !== undefined && { emailReminder }),
      ...(emailReminderHours !== undefined && { emailReminderHours }),
      ...(emailReminderEmails !== undefined && { emailReminderEmails: emailReminderEmails ? JSON.stringify(emailReminderEmails) : null }),
    },
  })

  void pushEventToGoogle(id, 'update')

  void createAuditLog(
    user,
    'update',
    'event',
    id,
    `Updated event "${existing.title}"`,
    {
      before: {
        title: existing.title,
        description: existing.description,
        start: existing.start.toISOString(),
        end: existing.end.toISOString(),
        isAllDay: existing.isAllDay,
        category: existing.category,
        color: existing.color,
      },
    }
  )

  return NextResponse.json(maskPersonalEvent(updated, user.id))
}

async function _DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const deleteAll = searchParams.get('all') === 'true'
  const occurrence = searchParams.get('occurrence')

  const existing = await prisma.event.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.isPersonal && existing.createdBy !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // "Delete this event only" on a recurring series: record the occurrence as
  // an exception instead of deleting the series row (which would delete every
  // occurrence — virtual instances all point at the one row). Replay-safe:
  // addRecurrenceException dedupes, so a re-sent offline delete is a no-op.
  if (!deleteAll && existing.isRecurring && occurrence) {
    const occurrenceDate = new Date(occurrence)
    if (isNaN(occurrenceDate.getTime())) {
      return NextResponse.json({ error: 'Invalid occurrence date' }, { status: 400 })
    }

    await prisma.event.update({
      where: { id },
      data: { recurrenceExceptions: addRecurrenceException(existing.recurrenceExceptions, occurrenceDate) },
    })

    void createAuditLog(
      user,
      'update',
      'event',
      id,
      `Deleted occurrence ${occurrenceDate.toISOString()} of recurring event "${existing.title}"`,
      { occurrence: occurrenceDate.toISOString() }
    )

    return NextResponse.json({ success: true })
  }

  if (deleteAll && existing.isRecurring) {
    // Delete all events in the series (the original recurring event)
    // Pre-load Google sync data BEFORE deleting
    const allSeriesEvents = await prisma.event.findMany({
      where: {
        familyId: user.familyId,
        id: existing.id,
      },
    })
    const seriesIds = allSeriesEvents.map((e) => e.id)

    const syncRows = await prisma.googleCalendarSync.findMany({
      where: { eventId: { in: seriesIds } },
    })
    const userIds = syncRows.map((r) => r.userId)
    const connectedUsers = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, googleRefreshToken: true },
        })
      : []

    await prisma.event.deleteMany({
      where: { id: { in: seriesIds } },
    })

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

    return NextResponse.json({ success: true, deletedCount: seriesIds.length })
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

  void createAuditLog(
    user,
    'delete',
    'event',
    id,
    `Deleted event "${existing.title}"`,
    {
      event: {
        title: existing.title,
        description: existing.description,
        start: existing.start.toISOString(),
        end: existing.end.toISOString(),
        isAllDay: existing.isAllDay,
        isPersonal: existing.isPersonal,
        category: existing.category,
        color: existing.color,
        createdBy: existing.createdBy,
        recurrenceRule: existing.recurrenceRule,
        isRecurring: existing.isRecurring,
        recurrenceEndDate: existing.recurrenceEndDate?.toISOString() ?? null,
      },
    }
  )

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

export const GET = withRouteErrors(_GET)
export const PUT = withRouteErrors(_PUT)
export const DELETE = withRouteErrors(_DELETE)
