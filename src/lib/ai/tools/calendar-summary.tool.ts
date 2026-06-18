// src/lib/ai/tools/calendar-summary.tool.ts
// AI tool for a combined weekly overview — aggregates events, chores, meal plans, bill due dates, and birthdays.
// Provides: queryWeekSummary

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { todayBoundsInTz, nDaysFromTodayInTz, formatInTz } from '@/lib/timezone'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'
import { liveBillWhere } from '@/lib/finance-live-filter'

// ── queryWeekSummary ───────────────────────────────────────────────────────────

const queryWeekSummaryDefinition: FunctionDeclaration = {
  name: 'queryWeekSummary',
  description: 'Get a combined weekly overview showing calendar events, chores due, meal plans, upcoming bills, and birthdays for the current week. Use when the user asks "what does my week look like?", "give me a weekly summary", "what\'s on this week?", or "show me my week at a glance".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
}

interface BirthdayEntry {
  name: string
  type: string
  date: string // MM-DD
}

async function queryWeekSummaryHandler(_args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const timezone = ctx.timezone ?? 'UTC'
  const { start } = todayBoundsInTz(timezone)
  const end = nDaysFromTodayInTz(7, timezone)
  const now = new Date()

  // ── 1. Events ──────────────────────────────────────────────────────────────
  const events = await prisma.event.findMany({
    where: {
      familyId: ctx.familyId,
      start: { gte: start, lte: end },
    },
    select: { title: true, start: true, end: true, isAllDay: true, description: true, category: true },
    orderBy: { start: 'asc' },
  })

  // ── 2. Chores due this week ───────────────────────────────────────────────
  const chores = await prisma.chore.findMany({
    where: {
      familyId: ctx.familyId,
      isActive: true,
      OR: [
        { nextDueDate: { gte: start, lte: end } },
        // Also include overdue chores
        { nextDueDate: { lt: start }, triggerOnComplete: false },
        { nextDueDate: null },
      ],
    },
    select: { title: true, nextDueDate: true, frequency: true, currentAssignee: { select: { name: true } } },
    orderBy: { nextDueDate: 'asc' },
  })

  // ── 3. Meal plans this week ───────────────────────────────────────────────
  const mealPlans = await prisma.mealPlan.findMany({
    where: {
      familyId: ctx.familyId,
      date: { gte: start, lte: end },
    },
    select: {
      date: true,
      mealType: true,
      note: true,
      recipe: { select: { title: true } },
    },
    orderBy: [{ date: 'asc' }, { mealType: 'asc' }],
  })

  // ── 4. Bills due this week ────────────────────────────────────────────────
  const bills = await prisma.financeRecurringBill.findMany({
    where: {
      familyId: ctx.familyId,
      isActive: true,
      paid: false,
      nextDueDate: { gte: start, lte: end },
      ...liveBillWhere,
    },
    select: { name: true, amount: true, nextDueDate: true },
    orderBy: { nextDueDate: 'asc' },
  })

  // ── 5. Birthdays this week ────────────────────────────────────────────────
  const family = await prisma.family.findUnique({
    where: { id: ctx.familyId },
    select: { birthdays: true },
  })

  const birthdaysThisWeek: Array<{ name: string; dateStr: string; label: string }> = []
  if (family?.birthdays) {
    try {
      const entries: BirthdayEntry[] = JSON.parse(family.birthdays)
      const dayStrs: string[] = []
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dayStrs.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      }
      for (const entry of entries) {
        if (dayStrs.includes(entry.date)) {
          const [m, day] = entry.date.split('-').map(Number)
          const dateObj = new Date(now.getFullYear(), m - 1, day)
          birthdaysThisWeek.push({
            name: entry.name,
            dateStr: formatInTz(dateObj, timezone, { weekday: 'short', day: 'numeric', month: 'short' }),
            label: entry.type === 'child' ? '🎂' : entry.type === 'partner' ? '💕' : '🎉',
          })
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  // ── Build the response ─────────────────────────────────────────────────────
  const weekLabel = `${formatInTz(start, timezone, { weekday: 'short', day: 'numeric', month: 'short' })} — ${formatInTz(end, timezone, { weekday: 'short', day: 'numeric', month: 'short' })}`
  const sections: string[] = [`📅 **Week at a Glance — ${weekLabel}**`]

  // Events
  if (events.length > 0) {
    const lines = events.map(e => {
      const day = formatInTz(new Date(e.start), timezone, { weekday: 'short', day: 'numeric', month: 'short' })
      const time = e.isAllDay ? 'all day' : formatInTz(new Date(e.start), timezone, { hour: '2-digit', minute: '2-digit' })
      return `  • ${e.title} — ${day} ${time}`
    })
    sections.push(`**📆 Events (${events.length})**\n${lines.join('\n')}`)
  } else {
    sections.push('**📆 Events**\n  No events this week.')
  }

  // Chores
  const dueChores = chores.filter(c => c.nextDueDate && c.nextDueDate >= start && c.nextDueDate <= end)
  const overdueChores = chores.filter(c => c.nextDueDate && c.nextDueDate < start)
  const unscheduledChores = chores.filter(c => !c.nextDueDate)

  if (dueChores.length > 0 || overdueChores.length > 0 || unscheduledChores.length > 0) {
    const lines: string[] = []
    for (const c of overdueChores) {
      lines.push(`  ⚠️ ${c.title} — overdue${c.currentAssignee ? ` (→ ${c.currentAssignee.name})` : ''}`)
    }
    for (const c of dueChores) {
      const day = formatInTz(c.nextDueDate!, timezone, { weekday: 'short', day: 'numeric', month: 'short' })
      lines.push(`  • ${c.title} — ${day}${c.currentAssignee ? ` (→ ${c.currentAssignee.name})` : ''}`)
    }
    for (const c of unscheduledChores) {
      lines.push(`  • ${c.title} — due now (no date set)`)
    }
    sections.push(`**🧹 Chores (${dueChores.length + overdueChores.length + unscheduledChores.length})**\n${lines.join('\n')}`)
  } else {
    sections.push('**🧹 Chores**\n  No chores due this week.')
  }

  // Meal plans
  if (mealPlans.length > 0) {
    // Group by date
    const byDate: Record<string, string[]> = {}
    for (const mp of mealPlans) {
      const key = formatInTz(new Date(mp.date), timezone, { weekday: 'short', day: 'numeric', month: 'short' })
      if (!byDate[key]) byDate[key] = []
      const recipeName = mp.recipe?.title ?? mp.note ?? '(no recipe)'
      byDate[key].push(`  ${mp.mealType}: ${recipeName}`)
    }
    const lines = Object.entries(byDate).map(([date, meals]) =>
      `  **${date}**\n${meals.join('\n')}`
    )
    sections.push(`**🍽️ Meal Plan (${mealPlans.length})**\n${lines.join('\n')}`)
  } else {
    sections.push('**🍽️ Meal Plan**\n  No meals planned this week.')
  }

  // Bills
  if (bills.length > 0) {
    const total = bills.reduce((s, b) => s + b.amount, 0)
    const lines = bills.map(b => {
      const day = formatInTz(new Date(b.nextDueDate), timezone, { weekday: 'short', day: 'numeric', month: 'short' })
      return `  • ${b.name} — $${b.amount.toFixed(2)} — due ${day}`
    })
    sections.push(`**💰 Bills Due (${bills.length}) — $${total.toFixed(2)} total**\n${lines.join('\n')}`)
  } else {
    sections.push('**💰 Bills Due**\n  No bills due this week.')
  }

  // Birthdays
  if (birthdaysThisWeek.length > 0) {
    const lines = birthdaysThisWeek.map(b => `  • ${b.label} ${b.name} — ${b.dateStr}`)
    sections.push(`**🎉 Birthdays & Anniversaries (${birthdaysThisWeek.length})**\n${lines.join('\n')}`)
  }

  return { message: sections.join('\n\n') }
}

// ── Register ───────────────────────────────────────────────────────────────────

export function registerCalendarSummaryTools(): void {
  registerTool('queryWeekSummary', {
    definition: queryWeekSummaryDefinition,
    handler: queryWeekSummaryHandler,
  })
}
