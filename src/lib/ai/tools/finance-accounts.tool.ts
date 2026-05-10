// src/lib/ai/tools/finance-accounts.tool.ts
// AI tool registrations for account balances, spending breakdowns, and monthly summaries.
// Provides: queryBalances, querySpendingByCategory, queryMonthlySummary

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── Context provider ──────────────────────────────────────────────────────────

async function accountsContextProvider(familyId: string, _userId: string): Promise<string> {
  const accounts = await prisma.financeAccount.findMany({
    where: { familyId, isActive: true },
    select: { name: true, type: true, currentBalance: true, creditLimit: true },
    orderBy: { sortOrder: 'asc' },
  })

  if (accounts.length === 0) return ''

  const lines = accounts.map(a => {
    const balanceStr = a.type === 'credit'
      ? `$${Math.abs(a.currentBalance).toFixed(2)} used${a.creditLimit ? ` of $${a.creditLimit.toFixed(2)}` : ''}`
      : `$${a.currentBalance.toFixed(2)}`
    return `• ${a.name} (${a.type}): ${balanceStr}`
  })

  const totalAssets = accounts
    .filter(a => ['checking', 'savings', 'cash', 'investment'].includes(a.type))
    .reduce((s, a) => s + a.currentBalance, 0)

  const totalDebt = accounts
    .filter(a => a.type === 'credit')
    .reduce((s, a) => s + Math.abs(a.currentBalance), 0)

  return `Account balances:\n${lines.join('\n')}\n\nTotal assets: $${totalAssets.toFixed(2)} | Total credit debt: $${totalDebt.toFixed(2)}`
}

// ── queryBalances ─────────────────────────────────────────────────────────────

const queryBalancesDefinition: FunctionDeclaration = {
  name: 'queryBalances',
  description: 'Show all account balances including checking, savings, credit cards, and investments. Use when the user asks "what are my balances?", "how much money do I have?", "what\'s in my accounts?", or "show me my credit card balance".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      includeInactive: {
        type: SchemaType.STRING,
        description: 'Set to "true" to include closed/inactive accounts',
      },
    },
  },
}

async function queryBalancesHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { includeInactive } = args as { includeInactive?: string }

  const accounts = await prisma.financeAccount.findMany({
    where: {
      familyId: ctx.familyId,
      ...(includeInactive === 'true' ? {} : { isActive: true }),
    },
    select: {
      name: true,
      type: true,
      institution: true,
      currentBalance: true,
      creditLimit: true,
      openingBalance: true,
      color: true,
      isActive: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  if (accounts.length === 0) {
    return { message: 'No accounts found. Add some in Finance → Accounts.' }
  }

  const lines = accounts.map(a => {
    const activeTag = a.isActive ? '' : ' (inactive)'
    const inst = a.institution ? ` @ ${a.institution}` : ''
    const balanceStr = a.type === 'credit'
      ? `$${Math.abs(a.currentBalance).toFixed(2)} used${a.creditLimit ? ` / $${a.creditLimit.toFixed(2)} limit` : ''}`
      : `$${a.currentBalance.toFixed(2)}`
    return `• ${a.name}${inst} — ${balanceStr} (${a.type})${activeTag}`
  })

  const byType: Record<string, { balance: number; count: number }> = {}
  for (const a of accounts) {
    if (!byType[a.type]) byType[a.type] = { balance: 0, count: 0 }
    byType[a.type].balance += a.currentBalance
    byType[a.type].count++
  }

  const summaryLines = Object.entries(byType)
    .filter(([_, v]) => v.count > 0)
    .map(([type, v]) => `  ${type}: ${v.count} account(s), net $${v.balance.toFixed(2)}`)

  return {
    message: `**Account Balances**\n${lines.join('\n')}\n\n**Summary by type**\n${summaryLines.join('\n')}`,
  }
}

// ── querySpendingByCategory ───────────────────────────────────────────────────

const querySpendingByCategoryDefinition: FunctionDeclaration = {
  name: 'querySpendingByCategory',
  description: 'Show spending (expenses) grouped by category for a given period. Use when the user asks "what did I spend on groceries this month?", "show my spending by category", "where is my money going?", or "how much did I spend on utilities?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      period: {
        type: SchemaType.STRING,
        description: 'Time period: "thisMonth" (default), "lastMonth", "thisYear", "last30days", or a specific month like "January 2026"',
      },
      category: {
        type: SchemaType.STRING,
        description: 'Optional: filter to a specific category name (e.g. "Groceries", "Utilities")',
      },
    },
  },
}

function parsePeriod(period: string | undefined): { start: Date; end: Date; label: string } {
  const now = new Date()
  const userOffset = now.getTimezoneOffset() * 60 * 1000
  const today = new Date(now.getTime() + 10 * 60 * 60 * 1000) // Approximate AEST

  switch (period) {
    case 'lastMonth': {
      const y = today.getFullYear()
      const m = today.getMonth() - 1
      const start = new Date(y, m, 1)
      const end = new Date(y, m + 1, 1)
      return { start, end, label: `Last month (${start.toLocaleString('en-AU', { month: 'long', year: 'numeric' })})` }
    }
    case 'thisYear': {
      const start = new Date(today.getFullYear(), 0, 1)
      const end = new Date(today.getFullYear() + 1, 0, 1)
      return { start, end, label: `Year to date (${today.getFullYear()})` }
    }
    case 'last30days': {
      const end = new Date(today)
      const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      return { start, end, label: 'Last 30 days' }
    }
    case 'thisMonth':
    default: {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 1)
      return { start, end, label: `This month (${start.toLocaleString('en-AU', { month: 'long', year: 'numeric' })})` }
    }
  }
}

async function querySpendingByCategoryHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { period, category } = args as { period?: string; category?: string }
  const { start, end, label } = parsePeriod(period)

  const whereBase: Record<string, unknown> = {
    familyId: ctx.familyId,
    type: 'expense',
    date: { gte: start, lt: end },
    isTransfer: false,
  }

  if (category) {
    const cat = await prisma.financeCategory.findFirst({
      where: { familyId: ctx.familyId, name: { contains: category } },
    })
    if (cat) {
      whereBase.categoryId = cat.id
    }
  }

  const transactions = await prisma.financeTransaction.findMany({
    where: whereBase,
    select: {
      amount: true,
      category: { select: { name: true, icon: true } },
      description: true,
      date: true,
    },
    orderBy: { date: 'desc' },
  })

  if (transactions.length === 0) {
    return { message: `No expenses found for ${label}.` }
  }

  // Group by category
  const byCategory: Record<string, { total: number; count: number; icon?: string }> = {}
  for (const t of transactions) {
    const catName = t.category?.name ?? 'Uncategorised'
    if (!byCategory[catName]) {
      byCategory[catName] = { total: 0, count: 0, icon: t.category?.icon ?? undefined }
    }
    byCategory[catName].total += t.amount
    byCategory[catName].count++
  }

  const sortedCategories = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total)
  const grandTotal = transactions.reduce((s, t) => s + t.amount, 0)

  const lines = sortedCategories.map(([name, data]) => {
    const icon = data.icon ?? ''
    const avg = (data.total / data.count).toFixed(2)
    return `• ${icon} ${name}: $${data.total.toFixed(2)} (${data.count} txns, avg $${avg})`
  })

  return {
    message: `**Spending by Category — ${label}**\n${lines.join('\n')}\n\n**Total: $${grandTotal.toFixed(2)}**`,
  }
}

// ── queryMonthlySummary ───────────────────────────────────────────────────────

const queryMonthlySummaryDefinition: FunctionDeclaration = {
  name: 'queryMonthlySummary',
  description: 'Show a monthly income vs expense summary. Use when the user asks "what\'s my monthly summary?", "how much did I earn vs spend last month?", "give me a financial overview", or "show my profit and loss for March".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      period: {
        type: SchemaType.STRING,
        description: 'Time period: "thisMonth" (default), "lastMonth", "thisYear", or a specific month like "February 2026"',
      },
    },
  },
}

async function queryMonthlySummaryHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { period } = args as { period?: string }
  const { start, end, label } = parsePeriod(period)

  const [incomeAgg, expenseAgg, transferAgg] = await Promise.all([
    prisma.financeTransaction.aggregate({
      where: {
        familyId: ctx.familyId,
        type: 'income',
        date: { gte: start, lt: end },
        isTransfer: false,
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.financeTransaction.aggregate({
      where: {
        familyId: ctx.familyId,
        type: 'expense',
        date: { gte: start, lt: end },
        isTransfer: false,
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.financeTransaction.findMany({
      where: {
        familyId: ctx.familyId,
        type: 'expense',
        date: { gte: start, lt: end },
        isTransfer: false,
      },
      select: { amount: true, category: { select: { name: true } } },
      orderBy: { amount: 'desc' },
      take: 5,
    }),
  ])

  const income = incomeAgg._sum.amount ?? 0
  const expense = expenseAgg._sum.amount ?? 0
  const net = income - expense

  const topExpenses = transferAgg.length > 0
    ? transferAgg.map(t => `  • ${t.category?.name ?? 'Uncategorised'}: $${t.amount.toFixed(2)}`).join('\n')
    : '  (none)'

  const emoji = net >= 0 ? '✅' : '⚠️'
  const status = net >= 0
    ? `You're in the green by $${net.toFixed(2)}`
    : `You're over budget by $${Math.abs(net).toFixed(2)}`

  return {
    message: `**Monthly Summary — ${label}**\n\n💰 Income: $${income.toFixed(2)} (${incomeAgg._count} transactions)\n💸 Expenses: $${expense.toFixed(2)} (${expenseAgg._count} transactions)\n📊 Net: $${net.toFixed(2)} ${emoji}\n${status}\n\n**Top expenses:**\n${topExpenses}`,
  }
}

// ── Register all account tools ─────────────────────────────────────────────────

export function registerFinanceAccountTools(): void {
  registerTool('queryBalances', {
    definition: queryBalancesDefinition,
    contextProvider: accountsContextProvider,
    handler: queryBalancesHandler,
  })

  registerTool('querySpendingByCategory', {
    definition: querySpendingByCategoryDefinition,
    handler: querySpendingByCategoryHandler,
  })

  registerTool('queryMonthlySummary', {
    definition: queryMonthlySummaryDefinition,
    handler: queryMonthlySummaryHandler,
  })
}
