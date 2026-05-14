import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { validateEventDates, maskPersonalEvent } from '@/lib/event-helpers'
import { pushEventToGoogle } from '@/lib/google-sync'
import { generateRecurrenceInstances } from '@/lib/recurrence'
import { createAuditLog } from '@/lib/audit-log'
import { AppEvents, dispatchAppEvent } from '@/lib/app-events'

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const rangeStart = from ? new Date(from) : null
  const rangeEnd = to ? new Date(to) : null

  // Fetch all events for the family (we need recurring events even if outside range to expand them)
  const where: Record<string, unknown> = { familyId: user.familyId }
  if (rangeStart && rangeEnd) {
    // For recurring events, we need to fetch events that start before the range too
    where.OR = [
      { start: { gte: rangeStart, lte: rangeEnd } },
      { isRecurring: true },
    ]
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { start: 'asc' },
  })

  // Expand recurring events into individual instances
  const expandedEvents = events.flatMap((event) => {
    if (event.isRecurring && event.recurrenceRule && rangeStart && rangeEnd) {
      const instances = generateRecurrenceInstances(
        event.start,
        event.end,
        event.recurrenceRule,
        event.recurrenceEndDate,
        rangeStart,
        rangeEnd
      )

      // Map instances to event-like objects
      // Keep recurrenceRule on instances so the UI knows it's part of a series
      const expanded = instances.map((instance, index) => ({
        ...event,
        id: `${event.id}_recur_${index}`,
        start: instance.start,
        end: instance.end,
        isRecurring: false, // Don't show recurring icon on instances
        isRecurringInstance: true,
        seriesId: event.id,
      }))

      // Only return the expanded instances - NOT the original event
      // The original can be edited/deleted via seriesId on any instance
      return expanded
    }
    return [event]
  })

  return NextResponse.json(expandedEvents.map((e) => maskPersonalEvent(e, user.id)))
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { title, description, start, end, isAllDay, category, color, isPersonal, recurrenceRule, isRecurring, recurrenceEndDate, emailReminder, emailReminderHours, emailReminderEmails } = body

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
      isPersonal: isPersonal ?? false,
      category: category ?? null,
      color: color ?? null,
      createdBy: user.id,
      familyId: user.familyId,
      recurrenceRule: recurrenceRule ?? null,
      isRecurring: isRecurring ?? false,
      recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : null,
      emailReminder: emailReminder ?? false,
      emailReminderHours: emailReminderHours ?? 24,
      emailReminderEmails: emailReminderEmails ? JSON.stringify(emailReminderEmails) : null,
    },
  })

  void pushEventToGoogle(event.id, 'create')

  void createAuditLog(
    user,
    'create',
    'event',
    event.id,
    `Created event "${title}"`,
    { eventId: event.id }
  )

  // Notify calendar views to refresh
  dispatchAppEvent(AppEvents.CALENDAR_UPDATED)

  return NextResponse.json(maskPersonalEvent(event, user.id), { status: 201 })
}
