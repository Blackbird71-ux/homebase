import { CalendarView } from '@/components/calendar/CalendarView'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { maskPersonalEvent } from '@/lib/event-helpers'
import { generateRecurrenceInstances } from '@/lib/recurrence'
import type { CalendarEvent } from '@/types'

export default async function CalendarPage() {
  const user = await requireSession()

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { uiPreferences: true },
  })
  let calendarSettings = { calShowMeals: false, calShowTodos: false, calShowChores: false, calShowBills: true, calShowDocs: true }
  if (fullUser?.uiPreferences) {
    try {
      const prefs = JSON.parse(fullUser.uiPreferences)
      calendarSettings = {
        calShowMeals:  !!prefs.calShowMeals,
        calShowTodos:  !!prefs.calShowTodos,
        calShowChores: !!prefs.calShowChores,
        calShowBills:  prefs.calShowBills  !== false,
        calShowDocs:   prefs.calShowDocs   !== false,
      }
    } catch { /* ignore */ }
  }

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 31)

  // Fetch events including recurring ones and multi-month events that span into the range
  // Must check both start AND end so events like "Qld road trip" (Aug 1 – Sep 30)
  // appear in September even though they started before the September range
  const [events, members] = await Promise.all([
    prisma.event.findMany({
      where: {
        familyId: user.familyId,
        OR: [
          { start: { gte: from, lte: to } },
          { start: { lte: from }, end: { gte: from } },
          { isRecurring: true },
        ],
      },
      orderBy: { start: 'asc' },
    }),
    prisma.user.findMany({ where: { familyId: user.familyId }, select: { id: true, name: true } }),
  ])
  const memberNames = new Map(members.map(m => [m.id, m.name]))

  // Expand recurring events into individual instances
  const expandedEvents = events.flatMap((event) => {
    if (event.isRecurring && event.recurrenceRule) {
      const instances = generateRecurrenceInstances(
        event.start,
        event.end,
        event.recurrenceRule,
        event.recurrenceEndDate,
        from,
        to
      )

      const expanded = instances.map((instance, index) => ({
        ...event,
        id: `${event.id}_recur_${index}`,
        start: instance.start,
        end: instance.end,
        isRecurring: false,
        isRecurringInstance: true,
        seriesId: event.id,
      }))

      // Only return the expanded instances - NOT the original event
      // The original can be edited/deleted via seriesId on any instance
      return expanded
    }
    return [event]
  })

  const calendarEvents: CalendarEvent[] = expandedEvents.map((e) => {
    const masked = maskPersonalEvent(e, user.id, memberNames.get(e.createdBy))
    return {
      id: masked.id,
      title: masked.title,
      description: masked.description,
      start: masked.start,
      end: masked.end,
      isAllDay: masked.isAllDay,
      isPersonal: masked.isPersonal,
      isBusy: masked.isBusy,
      category: masked.category,
      color: masked.color,
      createdBy: masked.createdBy,
      createdByName: (masked as Record<string, unknown>).createdByName as string | null | undefined,
      // Preserve recurring event fields so the UI can edit/delete the series
      seriesId: (e as Record<string, unknown>).seriesId as string | undefined,
      isRecurringInstance: (e as Record<string, unknown>).isRecurringInstance as boolean | undefined,
      recurrenceRule: (e as Record<string, unknown>).recurrenceRule as string | null | undefined,
    }
  })

  if (calendarSettings.calShowDocs) {
    const ninetyDays = 90 * 24 * 60 * 60 * 1000
    const docs = await prisma.document.findMany({
      where: {
        familyId: user.familyId,
        expiryDate: { not: null, gte: from, lte: new Date(to.getTime() + ninetyDays) },
      },
      select: { id: true, title: true, expiryDate: true, remindBefore: true },
    })
    for (const doc of docs) {
      if (!doc.expiryDate) continue
      const remindMs = doc.expiryDate.getTime() - doc.remindBefore * 24 * 60 * 60 * 1000
      const remindDay = new Date(remindMs).toISOString().slice(0, 10)
      const expiryDay = doc.expiryDate.toISOString().slice(0, 10)
      if (remindDay !== expiryDay) {
        const remindDate = new Date(remindMs)
        if (remindDate >= from && remindDate <= to) {
          calendarEvents.push({ id: `doc-remind-${doc.id}`, title: `Expiring: ${doc.title}`, description: null, start: remindDay + 'T00:00:00.000Z', end: remindDay + 'T23:59:59.000Z', isAllDay: true, isPersonal: false, isBusy: false, category: 'document', color: '#f59e0b', createdBy: user.id, source: 'document' })
        }
      }
      if (doc.expiryDate >= from && doc.expiryDate <= to) {
        calendarEvents.push({ id: `doc-expiry-${doc.id}`, title: `Expires: ${doc.title}`, description: null, start: expiryDay + 'T00:00:00.000Z', end: expiryDay + 'T23:59:59.000Z', isAllDay: true, isPersonal: false, isBusy: false, category: 'document', color: '#ef4444', createdBy: user.id, source: 'document' })
      }
    }
  }

  if (calendarSettings.calShowBills) {
    const [bills, income] = await Promise.all([
      prisma.financeRecurringBill.findMany({
        where: { familyId: user.familyId, showOnCalendar: true, paid: false, isVoided: false, isActive: true, nextDueDate: { gte: from, lte: to } },
        select: { id: true, name: true, nextDueDate: true },
      }),
      prisma.financeIncomeEntry.findMany({
        where: { familyId: user.familyId, showOnCalendar: true, received: false, isVoided: false, isActive: true, nextExpectedDate: { gte: from, lte: to } },
        select: { id: true, name: true, nextExpectedDate: true },
      }),
    ])
    for (const b of bills) {
      if (!b.nextDueDate) continue
      const day = b.nextDueDate.toISOString().slice(0, 10)
      calendarEvents.push({ id: `bill-${b.id}`, title: `Bill due: ${b.name}`, description: null, start: day + 'T00:00:00.000Z', end: day + 'T23:59:59.000Z', isAllDay: true, isPersonal: false, isBusy: false, category: 'finance', color: '#ef4444', createdBy: user.id, source: 'bill' })
    }
    for (const inc of income) {
      if (!inc.nextExpectedDate) continue
      const day = inc.nextExpectedDate.toISOString().slice(0, 10)
      calendarEvents.push({ id: `income-${inc.id}`, title: `Income: ${inc.name}`, description: null, start: day + 'T00:00:00.000Z', end: day + 'T23:59:59.000Z', isAllDay: true, isPersonal: false, isBusy: false, category: 'finance', color: '#22c55e', createdBy: user.id, source: 'income' })
    }
  }

  return (
    <CalendarView
      initialEvents={calendarEvents}
      weekStartsOn={user.weekStartsOn as 0 | 1}
      currentUserId={user.id}
      timezone={user.timezone}
      calendarSettings={calendarSettings}
    />
  )
}
