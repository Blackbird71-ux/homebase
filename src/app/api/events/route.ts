import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { validateEventDates, maskPersonalEvent } from '@/lib/event-helpers'
import { localMidnightToUtc, dateStringInTz } from '@/lib/timezone'
import { pushEventToGoogle } from '@/lib/google-sync'
import { generateRecurrenceInstances } from '@/lib/recurrence'
import { createAuditLog } from '@/lib/audit-log'
import { AppEvents, dispatchAppEvent } from '@/lib/app-events'
import { jsonWithETag } from '@/lib/http-cache'

export async function GET(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const showMeals = searchParams.get('meals') === '1'
  const showTodos = searchParams.get('todos') === '1'
  const showChores = searchParams.get('chores') === '1'
  const showBills = searchParams.get('bills') === '1'
  const showDocs = searchParams.get('docs') === '1'

  const rangeStart = from ? new Date(from) : null
  const rangeEnd = to ? new Date(to) : null

  // Fetch all events for the family
  // We need three categories:
  // 1. Events that start within the visible range
  // 2. Events that started BEFORE the range but END within it (multi-month events e.g. "Qld road trip")
  // 3. All recurring events (they get expanded into instances below)
  const where: Record<string, unknown> = { familyId: user.familyId }
  if (rangeStart && rangeEnd) {
    where.OR = [
      { start: { gte: rangeStart, lte: rangeEnd } },
      { start: { lte: rangeStart }, end: { gte: rangeStart } },
      { isRecurring: true },
    ]
  }

  const [events, members] = await Promise.all([
    prisma.event.findMany({ where, orderBy: { start: 'asc' } }),
    prisma.user.findMany({ where: { familyId: user.familyId }, select: { id: true, name: true } }),
  ])
  const memberNames = new Map(members.map(m => [m.id, m.name]))

  // Expand recurring events into individual instances
  const expandedEvents = events.flatMap((event) => {
    if (event.isRecurring && event.recurrenceRule && rangeStart && rangeEnd) {
      const instances = generateRecurrenceInstances(
        event.start,
        event.end,
        event.recurrenceRule,
        event.recurrenceEndDate,
        rangeStart,
        rangeEnd,
        user.timezone ?? 'UTC',
        event.recurrenceExceptions
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calendarEvents: any[] = expandedEvents.map((e) => maskPersonalEvent(e, user.id, memberNames.get(e.createdBy)))

  // Append synthetic events
  if (rangeStart && rangeEnd) {
    // The synthetic-event sources are independent — fetch the enabled ones together
    // rather than awaiting each in series. Disabled (flag-gated) sources resolve to [].
    const ninetyDays = 90 * 24 * 60 * 60 * 1000
    const [bills, tripActivities, income, meals, todos, docs, chores] = await Promise.all([
      showBills
        ? prisma.financeRecurringBill.findMany({
            where: {
              familyId: user.familyId,
              showOnCalendar: true,
              paid: false,
              isVoided: false,
              isActive: true,
              nextDueDate: { gte: rangeStart, lte: rangeEnd },
            },
            select: { id: true, name: true, nextDueDate: true },
          })
        : Promise.resolve([]),
      prisma.tripActivity.findMany({
        where: {
          showOnCalendar: true,
          day: {
            date: { gte: rangeStart, lte: rangeEnd },
            trip: { familyId: user.familyId },
          },
        },
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          day: {
            select: {
              date: true,
              trip: { select: { id: true, title: true, color: true } },
            },
          },
        },
      }),
      showBills
        ? prisma.financeIncomeEntry.findMany({
            where: {
              familyId: user.familyId,
              showOnCalendar: true,
              received: false,
              isVoided: false,
              isActive: true,
              nextExpectedDate: { gte: rangeStart, lte: rangeEnd },
            },
            select: { id: true, name: true, nextExpectedDate: true },
          })
        : Promise.resolve([]),
      showMeals
        ? prisma.mealPlan.findMany({
            where: {
              familyId: user.familyId,
              mealType: 'dinner',
              date: { gte: rangeStart, lte: rangeEnd },
            },
            select: {
              id: true,
              date: true,
              note: true,
              recipe: { select: { title: true } },
              recipes: { select: { recipe: { select: { title: true } } } },
            },
          })
        : Promise.resolve([]),
      showTodos
        ? prisma.listItem.findMany({
            where: {
              isCompleted: false,
              dueDate: { gte: rangeStart, lte: rangeEnd },
              list: { familyId: user.familyId },
            },
            select: { id: true, content: true, dueDate: true },
          })
        : Promise.resolve([]),
      showDocs
        ? prisma.document.findMany({
            // Fetch docs whose expiry date (or reminder window) overlaps the fetch range.
            // remindBefore defaults to 30; add 90-day buffer to catch any custom value.
            where: {
              familyId: user.familyId,
              expiryDate: {
                not: null,
                gte: rangeStart,
                lte: new Date(rangeEnd.getTime() + ninetyDays),
              },
            },
            select: { id: true, title: true, expiryDate: true, remindBefore: true },
          })
        : Promise.resolve([]),
      showChores
        ? prisma.chore.findMany({
            where: {
              familyId: user.familyId,
              isActive: true,
              nextDueDate: { gte: rangeStart, lte: rangeEnd },
            },
            select: { id: true, title: true, nextDueDate: true, startTime: true, duration: true },
          })
        : Promise.resolve([]),
    ])

    if (showBills) {
      for (const b of bills) {
        if (!b.nextDueDate) continue
        const day = dateStringInTz(b.nextDueDate, user.timezone ?? 'UTC')
        const start = new Date(day + 'T00:00:00.000Z')
        const end = new Date(day + 'T23:59:59.000Z')
        calendarEvents.push({
          id: `bill-${b.id}`,
          title: `Bill due: ${b.name}`,
          description: null,
          start: start.toISOString(),
          end: end.toISOString(),
          isAllDay: true,
          isPersonal: false,
          isBusy: false,
          category: 'finance',
          color: '#ef4444',
          createdBy: user.id,
          source: 'bill',
        })
      }
    }

    for (const act of tripActivities) {
      const dayDate = dateStringInTz(act.day.date, user.timezone ?? 'UTC')
      const start = act.startTime ?? new Date(dayDate + 'T00:00:00.000Z')
      const end = act.endTime ?? new Date(dayDate + 'T23:59:59.000Z')
      const isAllDay = !act.startTime
      calendarEvents.push({
        id: `trip-activity-${act.id}`,
        title: act.title,
        description: null,
        start: start.toISOString(),
        end: end.toISOString(),
        isAllDay,
        isPersonal: false,
        isBusy: false,
        category: 'trip',
        color: act.day.trip.color ?? '#6366f1',
        createdBy: user.id,
        source: 'trip',
        tripId: act.day.trip.id,
      })
    }

    if (showBills) {
      for (const inc of income) {
        if (!inc.nextExpectedDate) continue
        const day = dateStringInTz(inc.nextExpectedDate, user.timezone ?? 'UTC')
        const start = new Date(day + 'T00:00:00.000Z')
        const end = new Date(day + 'T23:59:59.000Z')
        calendarEvents.push({
          id: `income-${inc.id}`,
          title: `Income: ${inc.name}`,
          description: null,
          start: start.toISOString(),
          end: end.toISOString(),
          isAllDay: true,
          isPersonal: false,
          isBusy: false,
          category: 'finance',
          color: '#22c55e',
          createdBy: user.id,
          source: 'income',
        })
      }
    }

    if (showMeals) {
      for (const meal of meals) {
        const names: string[] = []
        if (meal.recipes.length > 0) {
          names.push(...meal.recipes.map(r => r.recipe.title))
        } else if (meal.recipe) {
          names.push(meal.recipe.title)
        } else if (meal.note) {
          names.push(meal.note)
        }
        const label = names.length > 0 ? `Dinner: ${names.join(', ')}` : 'Dinner planned'
        const day = dateStringInTz(meal.date, user.timezone ?? 'UTC')
        const start = new Date(day + 'T00:00:00.000Z')
        const end = new Date(day + 'T23:59:59.000Z')
        calendarEvents.push({
          id: `meal-${meal.id}`,
          title: label,
          description: meal.note ?? null,
          start: start.toISOString(),
          end: end.toISOString(),
          isAllDay: true,
          isPersonal: false,
          isBusy: false,
          category: 'meal',
          color: '#f59e0b',
          createdBy: user.id,
          source: 'meal',
        })
      }
    }

    if (showTodos) {
      for (const todo of todos) {
        if (!todo.dueDate) continue
        const day = dateStringInTz(todo.dueDate, user.timezone ?? 'UTC')
        const start = new Date(day + 'T00:00:00.000Z')
        const end = new Date(day + 'T23:59:59.000Z')
        calendarEvents.push({
          id: `todo-${todo.id}`,
          title: `Todo: ${todo.content}`,
          description: null,
          start: start.toISOString(),
          end: end.toISOString(),
          isAllDay: true,
          isPersonal: false,
          isBusy: false,
          category: 'todo',
          color: '#8b5cf6',
          createdBy: user.id,
          source: 'todo',
        })
      }
    }

    if (showDocs) {
      for (const doc of docs) {
        if (!doc.expiryDate) continue
        const tz = user.timezone ?? 'UTC'
        const remindMs = doc.expiryDate.getTime() - doc.remindBefore * 24 * 60 * 60 * 1000
        const remindDay = dateStringInTz(new Date(remindMs), tz)
        const expiryDay = dateStringInTz(doc.expiryDate, tz)

        if (remindDay !== expiryDay) {
          const remindStart = new Date(remindDay + 'T00:00:00.000Z')
          if (remindStart >= rangeStart && remindStart <= rangeEnd) {
            calendarEvents.push({
              id: `doc-remind-${doc.id}`,
              title: `Expiring: ${doc.title}`,
              description: null,
              start: remindStart.toISOString(),
              end: new Date(remindDay + 'T23:59:59.000Z').toISOString(),
              isAllDay: true, isPersonal: false, isBusy: false,
              category: 'document', color: '#f59e0b',
              createdBy: user.id, source: 'document',
            })
          }
        }

        const expiryStart = new Date(expiryDay + 'T00:00:00.000Z')
        if (expiryStart >= rangeStart && expiryStart <= rangeEnd) {
          calendarEvents.push({
            id: `doc-expiry-${doc.id}`,
            title: `Expires: ${doc.title}`,
            description: null,
            start: expiryStart.toISOString(),
            end: new Date(expiryDay + 'T23:59:59.000Z').toISOString(),
            isAllDay: true, isPersonal: false, isBusy: false,
            category: 'document', color: '#ef4444',
            createdBy: user.id, source: 'document',
          })
        }
      }
    }

    if (showChores) {
      for (const chore of chores) {
        if (!chore.nextDueDate) continue
        const day = dateStringInTz(chore.nextDueDate, user.timezone ?? 'UTC')

        let start: Date, end: Date, isAllDay: boolean
        if (chore.startTime && chore.duration) {
          const timeHour = chore.startTime.getUTCHours()
          const timeMin  = chore.startTime.getUTCMinutes()
          const dayStart = localMidnightToUtc(day, user.timezone ?? 'UTC')
          start   = new Date(dayStart.getTime() + (timeHour * 60 + timeMin) * 60_000)
          end     = new Date(start.getTime() + chore.duration * 60_000)
          isAllDay = false
        } else {
          start   = new Date(day + 'T00:00:00.000Z')
          end     = new Date(day + 'T23:59:59.000Z')
          isAllDay = true
        }

        calendarEvents.push({
          id: `chore-${chore.id}`,
          title: `Chore: ${chore.title}`,
          description: null,
          start: start.toISOString(),
          end: end.toISOString(),
          isAllDay,
          isPersonal: false,
          isBusy: false,
          category: 'chore',
          color: '#06b6d4',
          createdBy: user.id,
          source: 'chore',
        })
      }
    }
  }

  return jsonWithETag(req, calendarEvents)
}

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { title, description, location, start, end, isAllDay, category, color, isPersonal, recurrenceRule, isRecurring, recurrenceEndDate, emailReminder, emailReminderHours, emailReminderEmails, clientMutationId } = body

  if (!title || !start || !end) {
    return NextResponse.json({ error: 'title, start, and end are required' }, { status: 400 })
  }

  const validation = validateEventDates(start, end, isAllDay)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  // Idempotent offline-replay guard: if this clientMutationId was already
  // created (e.g. the response was lost and the queue replays the POST),
  // return the existing event instead of creating a duplicate. Skip the
  // audit log on this path — it already ran on first creation.
  if (clientMutationId) {
    const existing = await prisma.event.findUnique({ where: { clientMutationId } })
    if (existing) return NextResponse.json(maskPersonalEvent(existing, user.id), { status: 200 })
  }

  const event = await prisma.event.create({
    data: {
      title,
      description: description ?? null,
      location: location ?? null,
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
      clientMutationId: clientMutationId ?? null,
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
