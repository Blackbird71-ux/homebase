// src/lib/ai/tools/reports.tool.ts
// AI tool for generating quick financial reports and exports.
// Provides: generateFinanceReport

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import { formatInTz } from '@/lib/timezone'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── generateFinanceReport ──────────────────────────────────────────────────────

const generateFinanceReportDefinition: FunctionDeclaration = {
  name: 'generateFinanceReport',
  description: 'Generate a financial report showing income, expenses, and balances for a given period. Use when the user asks "generate a financial report", "create a spending report", "show me a P&L report", or "export my finances for March".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      period: {
        type: SchemaType.STRING,
        description: 'Time period: "thisMonth" (default), "lastMonth", "thisYear", "last30days", or a specific month like "January 2026"',
      },
      format: {
        type: SchemaType.STRING,
        description: 'Optional: "detailed" for full transaction list, or "summary" (default) for totals only',
      },
    },
  },
}

async function generateFinanceReportHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { period, format } = args as { period?: string; format?: string }
  const isDetailed = format === 'detailed'

  // Parse period (reuse logic from finance-accounts.tool.ts)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const userDate = new Date(now.getTime() + 10 * 60 * 60 * 1000)

  let start: Date
  let end: Date
  let label: string

  switch (period) {
    case 'lastMonth': {
      const y = userDate.getFullYear()
      const m = userDate.getMonth() - 1
      start = new Date(y, m, 1)
      end = new Date(y, m + 1, 1)
      label = start.toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      break
    }
    case 'thisYear': {
      start = new Date(userDate.getFullYear(), 0, 1)
      end = new Date(userDate.getFullYear() + 1, 0, 1)
      label = `Year to date (${userDate.getFullYear()})`
      break
    }
    case 'last30days': {
      end = new Date(today)
      start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      label = 'Last 30 days'
      break
    }
    case 'thisMonth':
    default: {
      start = new Date(userDate.getFullYear(), userDate.getMonth(), 1)
      end = new Date(userDate.getFullYear(), userDate.getMonth() + 1, 1)
      label = start.toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      break
    }
  }

  // Get all transactions for the period
  const transactions = await prisma.financeTransaction.findMany({
    where: {
      familyId: ctx.familyId,
      date: { gte: start, lt: end },
      isTransfer: false,
    },
    include: {
      category: { select: { name: true } },
      account: { select: { name: true } },
    },
    orderBy: { date: 'asc' },
  })

  if (transactions.length === 0) {
    return { message: `No transactions found for ${label}.` }
  }

  // Aggregate
  const income = transactions.filter(t => t.type === 'income')
  const expense = transactions.filter(t => t.type === 'expense')
  const incomeTotal = income.reduce((s, t) => s + t.amount, 0)
  const expenseTotal = expense.reduce((s, t) => s + t.amount, 0)
  const netTotal = incomeTotal - expenseTotal

  // Income by category
  const incomeByCat: Record<string, number> = {}
  for (const t of income) {
    const cat = t.category?.name ?? 'Uncategorised'
    incomeByCat[cat] = (incomeByCat[cat] ?? 0) + t.amount
  }

  // Expense by category
  const expenseByCat: Record<string, number> = {}
  for (const t of expense) {
    const cat = t.category?.name ?? 'Uncategorised'
    expenseByCat[cat] = (expenseByCat[cat] ?? 0) + t.amount
  }

  const sections: string[] = [`**📊 Financial Report — ${label}**`]

  // Summary
  sections.push(`**📈 Summary**\n  💰 Income: $${incomeTotal.toFixed(2)} (${income.length} txns)\n  💸 Expenses: $${expenseTotal.toFixed(2)} (${expense.length} txns)\n  📊 Net: $${netTotal.toFixed(2)} ${netTotal >= 0 ? '✅' : '⚠️'}`)

  // Income breakdown
  const sortedIncome = Object.entries(incomeByCat).sort((a, b) => b[1] - a[1])
  sections.push(`**💵 Income by Category**\n${sortedIncome.map(([cat, amt]) => `  • ${cat}: $${amt.toFixed(2)}`).join('\n')}`)

  // Expense breakdown
  const sortedExpense = Object.entries(expenseByCat).sort((a, b) => b[1] - a[1])
  sections.push(`**💳 Expenses by Category**\n${sortedExpense.map(([cat, amt]) => `  • ${cat}: $${amt.toFixed(2)}`).join('\n')}`)

  // Detailed transactions if requested
  if (isDetailed && transactions.length <= 50) {
    const txLines = transactions.map(t => {
      const d = formatInTz(new Date(t.date), ctx.timezone ?? 'UTC', { day: 'numeric', month: 'short' })
      const catLabel = t.category?.name ?? ''
      const acctLabel = t.account?.name ?? ''
      const sign = t.type === 'income' ? '+' : '-'
      return `  ${d} | ${sign}$${t.amount.toFixed(2)} | ${t.description ?? catLabel} | ${t.type}${acctLabel ? ` → ${acctLabel}` : ''}`
    })
    sections.push(`**📋 Transactions (${transactions.length})**\n${txLines.join('\n')}`)
  } else if (isDetailed) {
    sections.push(`📋 ${transactions.length} transactions — too many to list in detail. Try narrowing the period.`)
  }

  // Account balances
  const accounts = await prisma.financeAccount.findMany({
    where: { familyId: ctx.familyId, isActive: true },
    select: { name: true, type: true, currentBalance: true },
    orderBy: { sortOrder: 'asc' },
  })
  if (accounts.length > 0) {
    const acctLines = accounts.map(a =>
      `  • ${a.name}: $${a.currentBalance.toFixed(2)} (${a.type})`
    )
    sections.push(`**🏦 Current Balances**\n${acctLines.join('\n')}`)
  }

  return { message: sections.join('\n\n') }
}

// ── Register ───────────────────────────────────────────────────────────────────

export function registerReportTools(): void {
  registerTool('generateFinanceReport', {
    definition: generateFinanceReportDefinition,
    handler: generateFinanceReportHandler,
  })
}
