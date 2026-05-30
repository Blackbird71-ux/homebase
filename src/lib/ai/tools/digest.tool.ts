// src/lib/ai/tools/digest.tool.ts
// AI tool for proactive daily digest / morning briefing.
// Provides: generateDailyDigest
//
// The AI can proactively call this when the user says "good morning",
// "what's my day look like", "give me a briefing", or at the start of a session.
// It compiles today's events, chores, bills, birthdays, and financial snapshot.

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { todayBoundsInTz, nDaysFromTodayInTz, formatInTz, monthBoundsInTz, dateStringInTz } from '@/lib/timezone'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── generateDailyDigest ────────────────────────────────────────────────────────

const dailyDigestDefinition: FunctionDeclaration = {
  name: 'generateDailyDigest',
  description: 'Generate a proactive daily briefing / morning digest covering today\'s events, chores due, bills due, birthdays, meal plan, and financial snapshot. Call this when the user says "good morning", "what\'s my day look like", "give me the daily briefing", or proactively at the start of a conversation.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      includeFinance: { type: SchemaType.BOOLEAN, description: 'Optional: include financial snapshot (default: true)' },
      includeMeals: { type: SchemaType.BOOLEAN, description: 'Optional: include today\'s meal plan (default: true)' },
    },
  },
}

async function dailyDigestHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { includeFinance, includeMeals } = args as { includeFinance?: boolean; includeMeals?: boolean }
  const showFinance = includeFinance !== false
  const showMeals = includeMeals !== false

  const timezone = ctx.timezone ?? 'UTC'
  const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)
  const weekEnd = nDaysFromTodayInTz(7, timezone)
  const now = new Date()

  const sections: string[] = []

  // ── Date header ─────────────────────────────────────────────────────────────

  const headerDate = formatInTz(now, timezone, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
  sections.push(`📋 **Daily Briefing — ${headerDate}**`)

  // ── Today's events ──────────────────────────────────────────────────────────

  const todayEvents = await prisma.event.findMany({
    where: {
      familyId: ctx.familyId,
      start: { gte: todayStart, lt: todayEnd },
    },
    select: { id: true, title: true, start: true, end: true, isAllDay: true, category: true },
    orderBy: { start: 'asc' },
  })

  if (todayEvents.length > 0) {
    const lines = todayEvents.map(e => {
      const time = e.isAllDay
        ? '🌅 All day'
        : `🕐 ${formatInTz(e.start, timezone, { hour: '2-digit', minute: '2-digit' })}`
      const cat = e.category ? ` [${e.category}]` : ''
      return `  • ${e.title}${cat} — ${time}`
    })
    sections.push(`📅 **Today's Events**\n${lines.join('\n')}`)
  } else {
    sections.push(`📅 **Today's Events**\n  No events scheduled.`)
  }

  // ── Chores due today / overdue ──────────────────────────────────────────────

  const chores = await prisma.chore.findMany({
    where: { familyId: ctx.familyId, isActive: true },
    select: { id: true, title: true, nextDueDate: true, frequency: true, currentAssignee: { select: { name: true } } },
  })

  const overdueChores: string[] = []
  const dueTodayChores: string[] = []
  const dueWeekChores: string[] = []

  for (const chore of chores) {
    if (!chore.nextDueDate) {
      dueTodayChores.push(`  • ${chore.title} (due now — no date set${chore.currentAssignee ? `, assigned to ${chore.currentAssignee.name}` : ''})`)
      continue
    }
    const dueTime = chore.nextDueDate.getTime()
    if (dueTime < todayStart.getTime()) {
      const daysOverdue = Math.floor((todayStart.getTime() - dueTime) / (1000 * 60 * 60 * 24))
      overdueChores.push(`  • ${chore.title} (${daysOverdue} day(s) overdue${chore.currentAssignee ? `, ${chore.currentAssignee.name}` : ''})`)
    } else if (dueTime >= todayStart.getTime() && dueTime < todayEnd.getTime()) {
      dueTodayChores.push(`  • ${chore.title} (due today${chore.currentAssignee ? `, assigned to ${chore.currentAssignee.name}` : ''})`)
    } else if (dueTime < weekEnd.getTime()) {
      dueWeekChores.push(`  • ${chore.title} (due ${formatInTz(chore.nextDueDate, timezone, { weekday: 'long', day: 'numeric', month: 'short' })}${chore.currentAssignee ? `, ${chore.currentAssignee.name}` : ''})`)
    }
  }

  if (overdueChores.length > 0) {
    sections.push(`🔴 **Overdue Chores**\n${overdueChores.join('\n')}`)
  }
  if (dueTodayChores.length > 0) {
    sections.push(`🟡 **Chores Due Today**\n${dueTodayChores.join('\n')}`)
  }
  if (dueWeekChores.length > 0) {
    sections.push(`🟢 **Chores Due This Week**\n${dueWeekChores.join('\n')}`)
  }

  if (overdueChores.length === 0 && dueTodayChores.length === 0 && dueWeekChores.length === 0) {
    sections.push(`🧹 **Chores**\n  No chores due today or this week.`)
  }

  // ── Bills due today / overdue ───────────────────────────────────────────────

  const bills = await prisma.financeRecurringBill.findMany({
    where: { familyId: ctx.familyId, isActive: true, paid: false },
    select: { id: true, name: true, amount: true, nextDueDate: true },
    orderBy: { nextDueDate: 'asc' },
  })

  const overdueBills: string[] = []
  const dueTodayBills: string[] = []
  const dueSoonBills: string[] = []

  for (const bill of bills) {
    const dueTime = bill.nextDueDate.getTime()
    if (dueTime < todayStart.getTime()) {
      overdueBills.push(`  • ${bill.name} — $${bill.amount.toFixed(2)} (overdue since ${formatInTz(bill.nextDueDate, timezone, { weekday: 'long', day: 'numeric', month: 'short' })})`)
    } else if (dueTime >= todayStart.getTime() && dueTime < todayEnd.getTime()) {
      dueTodayBills.push(`  • ${bill.name} — $${bill.amount.toFixed(2)} (due today)`)
    } else if (dueTime < weekEnd.getTime()) {
      dueSoonBills.push(`  • ${bill.name} — $${bill.amount.toFixed(2)} (due ${formatInTz(bill.nextDueDate, timezone, { weekday: 'long', day: 'numeric', month: 'short' })})`)
    }
  }

  if (overdueBills.length > 0) {
    sections.push(`🔴 **Overdue Bills**\n${overdueBills.join('\n')}`)
  }
  if (dueTodayBills.length > 0) {
    sections.push(`🟡 **Bills Due Today**\n${dueTodayBills.join('\n')}`)
  }
  if (dueSoonBills.length > 0) {
    sections.push(`💳 **Upcoming Bills (this week)**\n${dueSoonBills.join('\n')}`)
  }

  // ── Birthdays today ─────────────────────────────────────────────────────────

  const family = await prisma.family.findUnique({
    where: { id: ctx.familyId },
    select: { birthdays: true },
  })

  if (family?.birthdays) {
    const localDateStr = dateStringInTz(now, timezone) // YYYY-MM-DD
    const [, localMonthStr, localDayStr] = localDateStr.split('-')
    const todayMonthDay = `${parseInt(localMonthStr)}-${parseInt(localDayStr)}`
    const allBirthdays: Array<{ name: string; type: string; date: string }> = JSON.parse(family.birthdays)
    const todayBirthdays = allBirthdays.filter(b => {
      const parts = b.date.split('-')
      return `${parseInt(parts[1])}-${parseInt(parts[2])}` === todayMonthDay
    })

    if (todayBirthdays.length > 0) {
      const lines = todayBirthdays.map(b => `  • 🎂 ${b.name} (${b.type})`)
      sections.push(`🎉 **Birthdays Today**\n${lines.join('\n')}`)
    }
  }

  // ── Today's meal plan ───────────────────────────────────────────────────────

  if (showMeals) {
    const todayMeals = await prisma.mealPlan.findMany({
      where: {
        familyId: ctx.familyId,
        date: { gte: todayStart, lt: todayEnd },
      },
      select: { id: true, mealType: true, note: true, recipe: { select: { title: true } } },
      orderBy: { mealType: 'asc' },
    })

    if (todayMeals.length > 0) {
      const lines = todayMeals.map(m => {
        const recipeName = m.recipe?.title ?? m.note ?? '(no recipe set)'
        const icon = m.mealType === 'breakfast' ? '🌅' : m.mealType === 'lunch' ? '☀️' : m.mealType === 'dinner' ? '🌙' : '🍪'
        return `  ${icon} ${m.mealType}: ${recipeName}`
      })
      sections.push(`🍽️ **Today's Meal Plan**\n${lines.join('\n')}`)
    } else {
      sections.push(`🍽️ **Today's Meal Plan**\n  No meals planned.`)
    }
  }

  // ── Quick financial snapshot ─────────────────────────────────────────────────

  if (showFinance) {
    const accounts = await prisma.financeAccount.findMany({
      where: { familyId: ctx.familyId, isActive: true },
      select: { name: true, type: true, currentBalance: true },
      orderBy: { sortOrder: 'asc' },
    })

    if (accounts.length > 0) {
      const assetAccounts = accounts.filter(a => ['checking', 'savings', 'cash', 'investment'].includes(a.type))
      const liabilityAccounts = accounts.filter(a => ['credit', 'loan'].includes(a.type))

      const lines: string[] = []

      if (assetAccounts.length > 0) {
        const totalAssets = assetAccounts.reduce((sum, a) => sum + a.currentBalance, 0)
        const assetsList = assetAccounts.map(a => `    ${a.name}: $${a.currentBalance.toFixed(2)}`).join('\n')
        lines.push(`  💰 **Assets:** $${totalAssets.toFixed(2)}`)
        lines.push(assetsList)
      }

      if (liabilityAccounts.length > 0) {
        const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + a.currentBalance, 0)
        const liabilitiesList = liabilityAccounts.map(a => `    ${a.name}: $${a.currentBalance.toFixed(2)}`).join('\n')
        lines.push(`  💳 **Liabilities:** $${totalLiabilities.toFixed(2)}`)
        lines.push(liabilitiesList)
      }

      if (lines.length > 0) {
        sections.push(`📊 **Financial Snapshot**\n${lines.join('\n')}`)
      }
    }

    // Check budget alerts
    const budgets = await prisma.financeBudget.findMany({
      where: { familyId: ctx.familyId },
      select: { id: true, name: true, amount: true, alertThreshold: true, categoryId: true },
    })

    if (budgets.length > 0) {
      const { start: monthStart, end: monthEnd } = monthBoundsInTz(timezone)

      const budgetAlerts: string[] = []

      for (const budget of budgets) {
        const spentResult = budget.categoryId
          ? await prisma.financeTransaction.aggregate({
            where: {
              familyId: ctx.familyId,
              categoryId: budget.categoryId,
              type: 'expense',
              date: { gte: monthStart, lt: monthEnd },
            },
            _sum: { amount: true },
          })
          : null

        const spent = spentResult?._sum.amount ?? 0
        const pct = budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0

        if (pct >= (budget.alertThreshold ?? 80)) {
          const icon = pct >= 100 ? '🔴' : pct >= (budget.alertThreshold ?? 80) ? '🟡' : '🟢'
          budgetAlerts.push(`  ${icon} ${budget.name}: $${spent.toFixed(2)} / $${budget.amount.toFixed(2)} (${pct}%)`)
        }
      }

      if (budgetAlerts.length > 0) {
        sections.push(`⚠️ **Budget Alerts**\n${budgetAlerts.join('\n')}`)
      }
    }
  }

  return { message: sections.join('\n\n') }
}

// ── Register ───────────────────────────────────────────────────────────────────

export function registerDigestTools(): void {
  registerTool('generateDailyDigest', {
    definition: dailyDigestDefinition,
    handler: dailyDigestHandler,
  })
}
