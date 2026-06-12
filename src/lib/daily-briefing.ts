// Daily briefing push digest (server-only — imports prisma).
// Compiles today's events, birthdays, chores due, tonight's dinner, and
// bills due this week into one compact push notification per user.
// Dispatched by the 7am cron in scheduler.ts; manual trigger via
// POST /api/briefing/send. Finance access is read-only — no GL involvement.

import { prisma } from '@/lib/prisma'
import { sendPushToUser } from '@/lib/push'
import { generateRecurrenceInstances } from '@/lib/recurrence'
import { birthdayEntryOccurrencesInRange, type BirthdayEntry } from '@/lib/date-engine'
import { todayBoundsInTz, todayStringInTz, nDaysFromTodayInTz, formatInTz, DEFAULT_TIMEZONE } from '@/lib/timezone'

interface BriefingEvent {
  title: string
  time: string | null // null = all day
  isPersonal: boolean
  createdBy: string
}

export interface FamilyBriefing {
  dateLabel: string
  events: BriefingEvent[]
  birthdays: string[] // "Nan", "Mum & Dad (anniversary)"
  choresOverdue: string[]
  choresDueToday: string[] // "Bins (Mark)"
  dinner: string | null
  billsThisWeek: string[] // "Electricity $245 (Mon)"
}

/** Gather one family's briefing data for today. Events are unmasked here —
 *  personal-event masking is applied per recipient in formatBriefing. */
export async function gatherFamilyBriefing(familyId: string, timezone: string): Promise<FamilyBriefing> {
  const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)
  const weekEnd = nDaysFromTodayInTz(7, timezone)

  const [events, chores, bills, family, contacts, dinnerPlans] = await Promise.all([
    prisma.event.findMany({
      where: {
        familyId,
        OR: [{ start: { gte: todayStart, lt: todayEnd } }, { isRecurring: true }],
      },
      orderBy: { start: 'asc' },
    }),
    prisma.chore.findMany({
      where: { familyId, isActive: true, nextDueDate: { not: null, lt: todayEnd } },
      select: { title: true, nextDueDate: true, currentAssignee: { select: { name: true } } },
    }),
    prisma.financeRecurringBill.findMany({
      where: {
        familyId,
        isActive: true,
        paid: false,
        isVoided: false,
        nextDueDate: { gte: todayStart, lt: weekEnd },
      },
      select: { name: true, amount: true, nextDueDate: true },
      orderBy: { nextDueDate: 'asc' },
    }),
    prisma.family.findUnique({ where: { id: familyId }, select: { birthdays: true } }),
    prisma.householdContact.findMany({
      where: { familyId, birthday: { not: null } },
      select: { name: true, birthday: true },
    }),
    // Meal plan dates are UTC midnight of the calendar date by convention
    prisma.mealPlan.findMany({
      where: { familyId, mealType: 'dinner', date: new Date(`${todayStringInTz(timezone)}T00:00:00.000Z`) },
      select: { note: true, recipe: { select: { title: true } }, recipes: { select: { recipe: { select: { title: true } } }, orderBy: { order: 'asc' } } },
    }),
  ])

  // Today's events — expand recurring series into today's instances
  const briefingEvents: BriefingEvent[] = []
  for (const event of events) {
    if (event.isRecurring && event.recurrenceRule) {
      const instances = generateRecurrenceInstances(
        event.start, event.end, event.recurrenceRule, event.recurrenceEndDate,
        todayStart, todayEnd, timezone, event.recurrenceExceptions
      )
      for (const instance of instances) {
        briefingEvents.push({
          title: event.title,
          time: event.isAllDay ? null : formatInTz(instance.start, timezone, { hour: 'numeric', minute: '2-digit' }),
          isPersonal: event.isPersonal,
          createdBy: event.createdBy,
        })
      }
    } else if (event.start >= todayStart && event.start < todayEnd) {
      briefingEvents.push({
        title: event.title,
        time: event.isAllDay ? null : formatInTz(event.start, timezone, { hour: 'numeric', minute: '2-digit' }),
        isPersonal: event.isPersonal,
        createdBy: event.createdBy,
      })
    }
  }

  // Birthdays today — household contacts + Family.birthdays JSON entries
  const birthdayEntries: BirthdayEntry[] = contacts.map(c => ({ name: c.name, type: 'birthday', date: c.birthday as string }))
  if (family?.birthdays) {
    try {
      const parsed = JSON.parse(family.birthdays)
      if (Array.isArray(parsed)) birthdayEntries.push(...parsed)
    } catch { /* malformed JSON — skip */ }
  }
  const birthdays = birthdayEntryOccurrencesInRange(birthdayEntries, todayStart, todayEnd, timezone)
    .map(b => (b.type && b.type !== 'birthday' ? `${b.name} (${b.type})` : b.name))

  // Chores — overdue vs due today
  const choresOverdue: string[] = []
  const choresDueToday: string[] = []
  for (const chore of chores) {
    const label = chore.currentAssignee ? `${chore.title} (${chore.currentAssignee.name})` : chore.title
    if (chore.nextDueDate && chore.nextDueDate < todayStart) choresOverdue.push(label)
    else choresDueToday.push(label)
  }

  // Tonight's dinner
  let dinner: string | null = null
  if (dinnerPlans.length > 0) {
    const plan = dinnerPlans[0]
    const titles = plan.recipes.map(r => r.recipe.title)
    if (plan.recipe?.title) titles.unshift(plan.recipe.title)
    dinner = titles.length > 0 ? [...new Set(titles)].join(', ') : plan.note
  }

  const billsThisWeek = bills.map(b => {
    const isToday = b.nextDueDate < todayEnd
    const due = isToday ? 'today' : formatInTz(b.nextDueDate, timezone, { weekday: 'short' })
    return `${b.name} $${b.amount.toFixed(2)} (${due})`
  })

  return {
    dateLabel: formatInTz(new Date(), timezone, { weekday: 'long', day: 'numeric', month: 'short' }),
    events: briefingEvents,
    birthdays,
    choresOverdue,
    choresDueToday,
    dinner,
    billsThisWeek,
  }
}

/** Format a family briefing into a push payload for one recipient.
 *  Pure — personal events created by others are shown as "Private event". */
export function formatBriefing(briefing: FamilyBriefing, viewerUserId: string): { title: string; body: string } {
  const lines: string[] = []

  for (const name of briefing.birthdays) lines.push(`🎂 ${name} today!`)

  if (briefing.events.length > 0) {
    const labels = briefing.events.map(e => {
      const title = e.isPersonal && e.createdBy !== viewerUserId ? 'Private event' : e.title
      return e.time ? `${e.time} ${title}` : title
    })
    lines.push(`📅 ${labels.join(' · ')}`)
  }

  if (briefing.choresOverdue.length > 0) lines.push(`🔴 Overdue: ${briefing.choresOverdue.join(', ')}`)
  if (briefing.choresDueToday.length > 0) lines.push(`🧹 Chores: ${briefing.choresDueToday.join(', ')}`)
  if (briefing.dinner) lines.push(`🍽️ Dinner: ${briefing.dinner}`)
  if (briefing.billsThisWeek.length > 0) lines.push(`💳 Bills: ${briefing.billsThisWeek.join(', ')}`)

  return {
    title: `Daily briefing — ${briefing.dateLabel}`,
    body: lines.length > 0 ? lines.join('\n') : 'Nothing scheduled today. Enjoy!',
  }
}

/**
 * Send the daily briefing to every user with an enabled push subscription.
 * Deduplicated per user per local day via EmailReminderLog, so the cron and
 * the manual trigger can't double-send. Returns the number of users notified.
 */
export async function sendDailyBriefings(): Promise<number> {
  const users = await prisma.user.findMany({
    where: { pushSubscriptions: { some: { enabled: true } } },
    select: { id: true, familyId: true, family: { select: { timezone: true } } },
  })

  // Gather each family's data once, shared by its users
  const briefings = new Map<string, FamilyBriefing>()
  let notified = 0

  for (const user of users) {
    const timezone = user.family?.timezone ?? DEFAULT_TIMEZONE

    const reminderKey = `briefing_${user.id}_${todayStringInTz(timezone)}`
    const already = await prisma.emailReminderLog.findUnique({ where: { reminderKey } })
    if (already) continue

    let briefing = briefings.get(user.familyId)
    if (!briefing) {
      briefing = await gatherFamilyBriefing(user.familyId, timezone)
      briefings.set(user.familyId, briefing)
    }

    const payload = { ...formatBriefing(briefing, user.id), url: '/' }
    const sent = await sendPushToUser(user.id, payload)
    if (sent > 0) {
      await prisma.emailReminderLog.create({ data: { entityType: 'briefing', reminderKey } })
      notified++
    }
  }
  return notified
}
