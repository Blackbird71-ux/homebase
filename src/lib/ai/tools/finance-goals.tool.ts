// src/lib/ai/tools/finance-goals.tool.ts
// AI tool registrations for budget tracking and savings goals.
// Provides: queryBudgetStatus, querySavingsGoals

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { formatInTz } from '@/lib/timezone'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── Context provider ──────────────────────────────────────────────────────────

async function goalsContextProvider(familyId: string, _userId: string): Promise<string> {
  const now = new Date()

  const [budgetCount, goals] = await Promise.all([
    prisma.financeBudget.count({ where: { familyId } }),
    prisma.financeSavingsGoal.findMany({
      where: { familyId, isComplete: false },
      select: { name: true, targetAmount: true, currentAmount: true },
    }),
  ])

  if (budgetCount === 0 && goals.length === 0) return ''

  const parts: string[] = []
  if (budgetCount > 0) {
    parts.push(`You have ${budgetCount} budget rules set up.`)
  }
  if (goals.length > 0) {
    const lines = goals.map(g =>
      `"${g.name}" — $${g.currentAmount.toFixed(2)} of $${g.targetAmount.toFixed(2)} (${Math.round((g.currentAmount / g.targetAmount) * 100)}%)`
    )
    parts.push(`Active savings goals:\n${lines.join('\n')}`)
  }

  return `Budget & goals:\n${parts.join('\n\n')}`
}

// ── queryBudgetStatus ─────────────────────────────────────────────────────────

const queryBudgetStatusDefinition: FunctionDeclaration = {
  name: 'queryBudgetStatus',
  description: 'Show budget limits vs actual spending for each category. Use when the user asks "how is my budget tracking?", "am I over budget on groceries?", "show me my budget status", or "what\'s my spending against budget?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      period: {
        type: SchemaType.STRING,
        description: '"thisMonth" (default) or a specific period label',
      },
    },
  },
}

async function queryBudgetStatusHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { period } = args as { period?: string }
  const now = new Date()
  const userDate = new Date(now.getTime() + 10 * 60 * 60 * 1000) // Approx AEST

  // Determine current period boundaries
  let periodStart: Date
  let periodEnd: Date
  let periodLabel: string

  if (period === 'thisMonth' || !period) {
    periodStart = new Date(userDate.getFullYear(), userDate.getMonth(), 1)
    periodEnd = new Date(userDate.getFullYear(), userDate.getMonth() + 1, 1)
    periodLabel = userDate.toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  } else {
    periodStart = new Date(userDate.getFullYear(), userDate.getMonth(), 1)
    periodEnd = new Date(userDate.getFullYear(), userDate.getMonth() + 1, 1)
    periodLabel = userDate.toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  }

  // Get budget rules active in this period
  const budgets = await prisma.financeBudget.findMany({
    where: {
      familyId: ctx.familyId,
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
    },
    include: {
      category: { select: { name: true, icon: true } },
    },
    orderBy: { name: 'asc' },
  })

  if (budgets.length === 0) {
    return { message: `No budget rules found for ${periodLabel}. Set some up in Finance → Budget.` }
  }

  // Get actual spending for each budget category within this period
  const results: Array<{
    name: string
    icon?: string
    budgetAmount: number
    spent: number
    remaining: number
    percentUsed: number
  }> = []

  for (const b of budgets) {
    const whereClause: Record<string, unknown> = {
      familyId: ctx.familyId,
      type: 'expense',
      date: { gte: periodStart, lt: periodEnd },
      isTransfer: false,
    }

    if (b.categoryId) {
      // Include both the category and any children
      const childCategories = await prisma.financeCategory.findMany({
        where: { parentId: b.categoryId },
        select: { id: true },
      })
      const categoryIds = [b.categoryId, ...childCategories.map(c => c.id)]
      whereClause.categoryId = { in: categoryIds }
    }

    const agg = await prisma.financeTransaction.aggregate({
      where: whereClause,
      _sum: { amount: true },
    })

    const spent = agg._sum.amount ?? 0
    const remaining = b.amount - spent
    const percentUsed = b.amount > 0 ? (spent / b.amount) * 100 : 0

    results.push({
      name: b.name,
      icon: b.category?.icon ?? undefined,
      budgetAmount: b.amount,
      spent,
      remaining,
      percentUsed,
    })
  }

  const totalBudget = results.reduce((s, r) => s + r.budgetAmount, 0)
  const totalSpent = results.reduce((s, r) => s + r.spent, 0)

  const lines = results.map(r => {
    const pct = r.percentUsed.toFixed(0)
    const bar = r.percentUsed >= 100 ? '🔴' : r.percentUsed >= 80 ? '🟡' : '🟢'
    return `  ${bar} ${r.icon ?? ''} ${r.name}: $${r.spent.toFixed(2)} / $${r.budgetAmount.toFixed(2)} (${pct}%) — $${r.remaining >= 0 ? `${r.remaining.toFixed(2)} remaining` : `${Math.abs(r.remaining).toFixed(2)} over`}`
  })

  return {
    message: `**Budget Status — ${periodLabel}**\n${lines.join('\n')}\n\n**Total: $${totalSpent.toFixed(2)} spent of $${totalBudget.toFixed(2)} budgeted**`,
  }
}

// ── querySavingsGoals ─────────────────────────────────────────────────────────

const querySavingsGoalsDefinition: FunctionDeclaration = {
  name: 'querySavingsGoals',
  description: 'Show progress on savings goals. Use when the user asks "how are my savings goals going?", "what am I saving for?", "show my savings progress", or "how close am I to my savings target?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      includeCompleted: {
        type: SchemaType.STRING,
        description: 'Set to "true" to include completed goals',
      },
    },
  },
}

async function querySavingsGoalsHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { includeCompleted } = args as { includeCompleted?: string }

  const goals = await prisma.financeSavingsGoal.findMany({
    where: {
      familyId: ctx.familyId,
      ...(includeCompleted === 'true' ? {} : { isComplete: false }),
    },
    include: {
      account: { select: { name: true } },
    },
    orderBy: { isComplete: 'asc' },
  })

  if (goals.length === 0) {
    return { message: includeCompleted === 'true' ? 'No savings goals found. Create some in Finance → Goals.' : 'No active savings goals. Create some in Finance → Goals.' }
  }

  const lines = goals.map(g => {
    const pct = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0
    const bar = g.isComplete ? '✅' : pct >= 75 ? '🟢' : pct >= 50 ? '🟡' : '🔵'
    const accountLabel = g.account ? ` → ${g.account.name}` : ''
    const dateLabel = g.targetDate ? ` by ${formatInTz(new Date(g.targetDate), ctx.timezone ?? 'UTC', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''
    return `  ${bar} ${g.name}${accountLabel}: $${g.currentAmount.toFixed(2)} / $${g.targetAmount.toFixed(2)} (${pct.toFixed(0)}%)${dateLabel}`
  })

  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0)
  const totalCurrent = goals.reduce((s, g) => s + g.currentAmount, 0)
  const totalPct = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0

  return {
    message: `**Savings Goals**\n${lines.join('\n')}\n\n**Total: $${totalCurrent.toFixed(2)} of $${totalTarget.toFixed(2)} (${totalPct.toFixed(0)}%)**`,
  }
}

// ── Register ───────────────────────────────────────────────────────────────────

export function registerFinanceGoalTools(): void {
  registerTool('queryBudgetStatus', {
    definition: queryBudgetStatusDefinition,
    contextProvider: goalsContextProvider,
    handler: queryBudgetStatusHandler,
  })

  registerTool('querySavingsGoals', {
    definition: querySavingsGoalsDefinition,
    handler: querySavingsGoalsHandler,
  })
}
