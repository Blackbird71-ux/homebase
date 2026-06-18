// src/lib/ai/tools/reminders.tool.ts
// AI tool registrations for reminders and alerts across the app.
// Provides: queryUpcomingReminders, setReminder

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { todayBoundsInTz, nDaysFromTodayInTz, formatInTz } from '@/lib/timezone'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'
import { liveBillWhere, liveIncomeWhere } from '@/lib/finance-live-filter'

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Days between two dates (positive if a is before b) */
function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

// ── queryUpcomingReminders ─────────────────────────────────────────────────────

const queryRemindersDefinition: FunctionDeclaration = {
  name: 'queryUpcomingReminders',
  description: 'Check all upcoming reminders and alerts including document expiries, bill due reminders, event reminders, and income expected reminders. Use this when the user asks "what reminders do I have?", "anything expiring soon?", or "what\'s coming up?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      daysAhead: { type: SchemaType.NUMBER, description: 'How many days ahead to check (default 14). Use 7 for this week, 30 for this month.' },
    },
  },
}

async function queryRemindersHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { daysAhead } = args as { daysAhead?: number }
  const horizon = daysAhead ?? 14
  const timezone = ctx.timezone ?? 'UTC'
  const { start: todayStart } = todayBoundsInTz(timezone)
  const cutoff = nDaysFromTodayInTz(horizon, timezone)

  const sections: string[] = []

  // ── Document expiry reminders ──────────────────────────────────────────────

  const expiringDocs = await prisma.document.findMany({
    where: {
      familyId: ctx.familyId,
      expiryDate: { not: null },
      emailReminder: true,
    },
    select: { id: true, title: true, expiryDate: true, category: true, remindBefore: true },
  })

  const docReminders: string[] = []
  for (const doc of expiringDocs) {
    if (!doc.expiryDate) continue
    const daysUntilExpiry = daysBetween(todayStart, doc.expiryDate)
    if (daysUntilExpiry >= 0 && daysUntilExpiry <= (doc.remindBefore ?? 30)) {
      const status = daysUntilExpiry <= 0
        ? '🔴 EXPIRED'
        : daysUntilExpiry <= 7
          ? `🟡 Expires in ${daysUntilExpiry} day(s)`
          : `🟢 Expires in ${daysUntilExpiry} day(s)`
      docReminders.push(`• ${doc.title} (${doc.category}) — ${status} on ${formatInTz(doc.expiryDate, timezone, { weekday: 'short', day: 'numeric', month: 'short' })}`)
    }
  }
  if (docReminders.length > 0) {
    sections.push(`📄 **Document Expiry Reminders**\n${docReminders.join('\n')}`)
  }

  // ── Bill payment reminders ─────────────────────────────────────────────────

  const upcomingBills = await prisma.financeRecurringBill.findMany({
    where: {
      familyId: ctx.familyId,
      isActive: true,
      paid: false,
      emailReminder: true,
      nextDueDate: { lte: cutoff },
      ...liveBillWhere,
    },
    select: { id: true, name: true, amount: true, nextDueDate: true, reminderDays: true },
    orderBy: { nextDueDate: 'asc' },
  })

  const billReminders: string[] = []
  for (const bill of upcomingBills) {
    const daysUntilDue = daysBetween(todayStart, bill.nextDueDate)
    const remindAt = bill.reminderDays ?? 3
    if (daysUntilDue >= 0 && daysUntilDue <= remindAt) {
      const icon = daysUntilDue <= 0 ? '🔴' : daysUntilDue <= 3 ? '🟡' : '🟢'
      billReminders.push(`• ${bill.name} — $${bill.amount.toFixed(2)} ${icon} due ${formatInTz(bill.nextDueDate, timezone, { weekday: 'short', day: 'numeric', month: 'short' })} (${daysUntilDue > 0 ? `${daysUntilDue} day(s)` : 'today!'})`)
    }
  }
  if (billReminders.length > 0) {
    sections.push(`💳 **Bill Payment Reminders**\n${billReminders.join('\n')}`)
  }

  // ── Event reminders ────────────────────────────────────────────────────────

  const upcomingEvents = await prisma.event.findMany({
    where: {
      familyId: ctx.familyId,
      start: { gte: todayStart, lte: cutoff },
      emailReminder: true,
    },
    select: { id: true, title: true, start: true, emailReminderHours: true },
    orderBy: { start: 'asc' },
  })

  const eventReminders: string[] = []
  for (const event of upcomingEvents) {
    const hoursUntil = (event.start.getTime() - todayStart.getTime()) / (1000 * 60 * 60)
    if (hoursUntil >= 0 && hoursUntil <= (event.emailReminderHours ?? 24)) {
      eventReminders.push(`• ${event.title} — ${formatInTz(event.start, timezone, { weekday: 'short', day: 'numeric', month: 'short' })} (in ${Math.round(hoursUntil / 24)} day(s))`)
    }
  }
  if (eventReminders.length > 0) {
    sections.push(`📅 **Event Reminders**\n${eventReminders.join('\n')}`)
  }

  // ── Income expected reminders ──────────────────────────────────────────────

  const upcomingIncome = await prisma.financeIncomeEntry.findMany({
    where: {
      familyId: ctx.familyId,
      isActive: true,
      received: false,
      emailReminder: true,
      nextExpectedDate: { lte: cutoff },
      ...liveIncomeWhere,
    },
    select: { id: true, name: true, amount: true, nextExpectedDate: true, reminderDays: true },
    orderBy: { nextExpectedDate: 'asc' },
  })

  const incomeReminders: string[] = []
  for (const inc of upcomingIncome) {
    const daysUntil = daysBetween(todayStart, inc.nextExpectedDate)
    const remindAt = inc.reminderDays ?? 3
    if (daysUntil >= 0 && daysUntil <= remindAt) {
      const icon = daysUntil <= 0 ? '🔴' : daysUntil <= 3 ? '🟡' : '🟢'
      incomeReminders.push(`• ${inc.name} — $${inc.amount.toFixed(2)} ${icon} expected ${formatInTz(inc.nextExpectedDate, timezone, { weekday: 'short', day: 'numeric', month: 'short' })}`)
    }
  }
  if (incomeReminders.length > 0) {
    sections.push(`💰 **Income Expected Reminders**\n${incomeReminders.join('\n')}`)
  }

  if (sections.length === 0) {
    return { message: `No upcoming reminders found in the next ${horizon} day(s).` }
  }

  return { message: `📌 **Reminders for the next ${horizon} day(s)**\n\n${sections.join('\n\n')}` }
}

// ── setReminder ────────────────────────────────────────────────────────────────

const setReminderDefinition: FunctionDeclaration = {
  name: 'setReminder',
  description: 'Enable or configure a reminder on a supported entity. Use this when the user says "remind me about X", "set a reminder for the passport expiry", or "notify me before the electricity bill is due".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      entityType: {
        type: SchemaType.STRING,
        description: 'Type of entity: "document" (expiry reminder), "bill" (payment reminder), "event" (event reminder), or "income" (income expected reminder)',
      },
      searchName: { type: SchemaType.STRING, description: 'Name or partial name to find the entity (e.g. "passport", "electricity", "netflix", "birthday party")' },
      enabled: { type: SchemaType.BOOLEAN, description: 'Set true to enable or false to disable the reminder (default: true)' },
      daysBefore: { type: SchemaType.NUMBER, description: 'How many days before the event to send the reminder. For documents this is remindBefore, for bills/income this is reminderDays. (Optional — uses existing defaults if omitted)' },
    },
    required: ['entityType', 'searchName'],
  },
}

async function setReminderHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { entityType, searchName, enabled, daysBefore } = args as {
    entityType: string
    searchName: string
    enabled?: boolean
    daysBefore?: number
  }

  const isEnabled = enabled !== false
  const lower = searchName.toLowerCase()
  const timezone = ctx.timezone ?? 'UTC'

  switch (entityType) {
    case 'document': {
      const docs = await prisma.document.findMany({
        where: { familyId: ctx.familyId },
        select: { id: true, title: true, expiryDate: true, remindBefore: true, emailReminder: true },
      })

      let match = docs.find(d => d.title.toLowerCase().includes(lower))
      if (!match) {
        match = docs.find(d => lower.includes(d.title.toLowerCase()))
      }
      if (!match) {
        return { message: `No document found matching "${searchName}".` }
      }

      await prisma.document.update({
        where: { id: match.id },
        data: {
          emailReminder: isEnabled,
          ...(daysBefore !== undefined ? { remindBefore: daysBefore } : {}),
        },
      })

      const docStatus = isEnabled ? `enabled (${daysBefore ?? match.remindBefore} day(s) before expiry)` : 'disabled'
      return {
        message: `Document reminder for "${match.title}" ${docStatus}.${match.expiryDate ? ` Expires ${formatInTz(match.expiryDate, timezone, { weekday: 'short', day: 'numeric', month: 'short' })}.` : ' No expiry date set.'}`,
        action: 'setReminder',
      }
    }

    case 'bill': {
      const bills = await prisma.financeRecurringBill.findMany({
        where: { familyId: ctx.familyId, isActive: true, ...liveBillWhere },
        select: { id: true, name: true, nextDueDate: true, reminderDays: true, emailReminder: true },
      })

      let match = bills.find(b => b.name.toLowerCase().includes(lower))
      if (!match) {
        match = bills.find(b => lower.includes(b.name.toLowerCase()))
      }
      if (!match) {
        return { message: `No active bill found matching "${searchName}".` }
      }

      await prisma.financeRecurringBill.update({
        where: { id: match.id },
        data: {
          emailReminder: isEnabled,
          ...(daysBefore !== undefined ? { reminderDays: daysBefore } : {}),
        },
      })

      const billStatus = isEnabled ? `enabled (reminder ${daysBefore ?? match.reminderDays} day(s) before due)` : 'disabled'
      return {
        message: `Bill reminder for "${match.name}" ${billStatus}. Next due: ${formatInTz(match.nextDueDate, timezone, { weekday: 'short', day: 'numeric', month: 'short' })}.`,
        action: 'setReminder',
      }
    }

    case 'event': {
      const events = await prisma.event.findMany({
        where: { familyId: ctx.familyId },
        select: { id: true, title: true, start: true, emailReminder: true, emailReminderHours: true },
      })

      let match = events.find(e => e.title.toLowerCase().includes(lower))
      if (!match) {
        match = events.find(e => lower.includes(e.title.toLowerCase()))
      }
      if (!match) {
        return { message: `No event found matching "${searchName}".` }
      }

      const reminderHours = daysBefore !== undefined ? daysBefore * 24 : match.emailReminderHours

      await prisma.event.update({
        where: { id: match.id },
        data: {
          emailReminder: isEnabled,
          ...(daysBefore !== undefined ? { emailReminderHours: reminderHours } : {}),
        },
      })

      const eventStatus = isEnabled
        ? `enabled (reminder ${daysBefore ?? Math.round((match.emailReminderHours ?? 24) / 24)} day(s) before)`
        : 'disabled'
      return {
        message: `Event reminder for "${match.title}" ${eventStatus}. Starts: ${formatInTz(match.start, timezone, { weekday: 'short', day: 'numeric', month: 'short' })}.`,
        action: 'setReminder',
      }
    }

    case 'income': {
      const incomes = await prisma.financeIncomeEntry.findMany({
        where: { familyId: ctx.familyId, isActive: true, ...liveIncomeWhere },
        select: { id: true, name: true, nextExpectedDate: true, reminderDays: true, emailReminder: true },
      })

      let match = incomes.find(i => i.name.toLowerCase().includes(lower))
      if (!match) {
        match = incomes.find(i => lower.includes(i.name.toLowerCase()))
      }
      if (!match) {
        return { message: `No active income entry found matching "${searchName}".` }
      }

      await prisma.financeIncomeEntry.update({
        where: { id: match.id },
        data: {
          emailReminder: isEnabled,
          ...(daysBefore !== undefined ? { reminderDays: daysBefore } : {}),
        },
      })

      const incStatus = isEnabled ? `enabled (reminder ${daysBefore ?? match.reminderDays} day(s) before)` : 'disabled'
      return {
        message: `Income reminder for "${match.name}" ${incStatus}. Next expected: ${formatInTz(match.nextExpectedDate, timezone, { weekday: 'short', day: 'numeric', month: 'short' })}.`,
        action: 'setReminder',
      }
    }

    default:
      return { message: `Unknown entity type "${entityType}". Supported types: document, bill, event, income.` }
  }
}

// ── Register all reminder tools ────────────────────────────────────────────────

export function registerReminderTools(): void {
  registerTool('queryUpcomingReminders', {
    definition: queryRemindersDefinition,
    handler: queryRemindersHandler,
  })

  registerTool('setReminder', {
    definition: setReminderDefinition,
    handler: setReminderHandler,
    actionEvents: { setReminder: 'app:calendarUpdated' },
  })
}
