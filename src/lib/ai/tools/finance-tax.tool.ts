// src/lib/ai/tools/finance-tax.tool.ts
// AI tool for tax reporting — deductible expenses, taxable income, and tax summary.
// Provides: queryTaxSummary, queryDeductibleExpenses

import { registerTool } from '@/lib/ai/tool-registry'
import { prisma } from '@/lib/prisma'
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai'
import type { HandlerContext, HandlerResult } from '@/lib/ai/types'

// ── queryTaxSummary ───────────────────────────────────────────────────────────

const queryTaxSummaryDefinition: FunctionDeclaration = {
  name: 'queryTaxSummary',
  description: 'Show a summary of tax-deductible expenses and taxable income for a financial year. Use when the user asks "what can I claim on tax?", "show my tax summary", "what are my deductions?", or "prepare my tax info".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      financialYear: {
        type: SchemaType.STRING,
        description: 'Optional: financial year label like "2025-2026" or "2024-2025". Defaults to current financial year.',
      },
    },
  },
}

function parseFinancialYear(label: string | undefined): { start: Date; end: Date; label: string } {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1-based

  if (label) {
    const match = label.match(/(\d{4})-(\d{4})/)
    if (match) {
      const year = parseInt(match[1])
      return {
        start: new Date(year, 6, 1), // July 1
        end: new Date(year + 1, 6, 1), // July 1 next year
        label: `${year}-${year + 1}`,
      }
    }
  }

  // Default: current Australian FY (July 1 to June 30)
  if (currentMonth >= 7) {
    return {
      start: new Date(currentYear, 6, 1),
      end: new Date(currentYear + 1, 6, 1),
      label: `${currentYear}-${currentYear + 1}`,
    }
  } else {
    return {
      start: new Date(currentYear - 1, 6, 1),
      end: new Date(currentYear, 6, 1),
      label: `${currentYear - 1}-${currentYear}`,
    }
  }
}

async function queryTaxSummaryHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { financialYear } = args as { financialYear?: string }
  const { start, end, label } = parseFinancialYear(financialYear)

  // Get tax-deductible categories
  const deductibleCategories = await prisma.financeCategory.findMany({
    where: { familyId: ctx.familyId, isTaxDeduction: true, hideFromReports: false },
    select: { id: true, name: true, taxDisplayLabel: true, type: true },
  })
  const deductibleCategoryIds = deductibleCategories.map(c => c.id)

  // Get tax-included categories
  const reportableCategories = await prisma.financeCategory.findMany({
    where: { familyId: ctx.familyId, taxIncludeInReporting: true, hideFromReports: false },
    select: { id: true, name: true, taxDisplayLabel: true },
  })
  const reportableCategoryIds = reportableCategories.map(c => c.id)

  // Get tax-classified transactions
  const taxTransactions = await prisma.financeTransaction.findMany({
    where: {
      familyId: ctx.familyId,
      date: { gte: start, lt: end },
      OR: [
        { categoryId: { in: [...deductibleCategoryIds, ...reportableCategoryIds] } },
        { taxClassification: { not: null } },
        { type: 'income' },
      ],
    },
    select: {
      amount: true,
      type: true,
      taxClassification: true,
      category: { select: { name: true, taxDisplayLabel: true, isTaxDeduction: true, taxIncludeInReporting: true } },
      description: true,
      date: true,
    },
    orderBy: { date: 'asc' },
  })

  // Deductible expenses (from deductible categories or classified as tax_deduction)
  const deductibleExpenses = taxTransactions.filter(t =>
    (t.type === 'expense' || t.type === 'transfer') &&
    (t.taxClassification === 'tax_deduction' || (t.category?.isTaxDeduction ?? false))
  )
  const deductibleTotal = deductibleExpenses.reduce((s, t) => s + t.amount, 0)

  // Taxable income
  const taxableIncome = taxTransactions.filter(t =>
    t.type === 'income' || t.taxClassification === 'taxable_income'
  )
  const incomeTotal = taxableIncome.reduce((s, t) => s + t.amount, 0)

  // Income tracked via income entries
  const incomeEntries = await prisma.financeIncomeEntry.findMany({
    where: {
      familyId: ctx.familyId,
      isActive: true,
      isTaxTracked: true,
      received: true,
      receivedDate: { gte: start, lt: end },
    },
    select: { name: true, amount: true, taxRate: true, taxClassification: true },
  })
  const incomeEntryTotal = incomeEntries.reduce((s, e) => s + e.amount, 0)

  // Tax-classified bills
  const taxBills = await prisma.financeRecurringBill.findMany({
    where: {
      familyId: ctx.familyId,
      isActive: true,
      taxClassification: { not: null },
    },
    select: { name: true, amount: true, taxClassification: true, frequency: true },
  })

  // Build sections
  const sections: string[] = [`**🧾 Tax Summary — FY ${label}**`]

  // Income section
  const allIncome = incomeTotal + incomeEntryTotal
  if (allIncome > 0) {
    const incomeLines: string[] = []
    if (incomeTotal > 0) {
      incomeLines.push(`  Transactions: $${incomeTotal.toFixed(2)} (${taxableIncome.length} entries)`)
    }
    if (incomeEntryTotal > 0) {
      incomeLines.push(`  Tracked income: $${incomeEntryTotal.toFixed(2)} (${incomeEntries.length} sources)`)
      for (const e of incomeEntries) {
        const rateLabel = e.taxRate ? ` @ ${e.taxRate}% est. tax` : ''
        const classLabel = e.taxClassification ? ` (${e.taxClassification})` : ''
        incomeLines.push(`    • ${e.name}: $${e.amount.toFixed(2)}${rateLabel}${classLabel}`)
      }
    }
    sections.push(`**💰 Taxable Income**\n${incomeLines.join('\n')}\nTotal: $${allIncome.toFixed(2)}`)
  } else {
    sections.push('**💰 Taxable Income**\n  No taxable income found for this period.')
  }

  // Deductions section
  if (deductibleExpenses.length > 0) {
    // Group by category
    const byCat: Record<string, { total: number; count: number }> = {}
    for (const t of deductibleExpenses) {
      const catName = t.category?.taxDisplayLabel ?? t.category?.name ?? 'Uncategorised'
      if (!byCat[catName]) byCat[catName] = { total: 0, count: 0 }
      byCat[catName].total += t.amount
      byCat[catName].count++
    }
    const dedLines = Object.entries(byCat)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, data]) => `  • ${name}: $${data.total.toFixed(2)} (${data.count} transactions)`)
    sections.push(`**📉 Deductible Expenses**\n${dedLines.join('\n')}\nTotal: $${deductibleTotal.toFixed(2)}`)
  } else {
    sections.push('**📉 Deductible Expenses**\n  No deductible expenses found.')
  }

  // Tax-classified bills
  if (taxBills.length > 0) {
    const billLines = taxBills.map(b =>
      `  • ${b.name} — $${b.amount.toFixed(2)} (${b.taxClassification})`
    )
    sections.push(`**📋 Tax-Classified Bills**\n${billLines.join('\n')}`)
  }

  // Estimated net
  const estimatedTax = allIncome * 0.3 // Rough estimate
  const netAfterDeductions = allIncome - deductibleTotal
  sections.push(`**📊 Estimated Net**\n  Income: $${allIncome.toFixed(2)}\n  Deductions: $${deductibleTotal.toFixed(2)}\n  Net taxable: $${netAfterDeductions.toFixed(2)}\n  Estimated tax (30%): $${estimatedTax.toFixed(2)}`)

  return { message: sections.join('\n\n') }
}

// ── queryDeductibleExpenses ────────────────────────────────────────────────────

const queryDeductibleExpensesDefinition: FunctionDeclaration = {
  name: 'queryDeductibleExpenses',
  description: 'List tax-deductible expenses for a specific period or category. Use when the user asks "what expenses are tax deductible?", "show my work expenses", or "what can I claim?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      period: {
        type: SchemaType.STRING,
        description: 'Optional: "thisMonth", "lastMonth", "thisYear", or "fy2025" for a financial year',
      },
      category: {
        type: SchemaType.STRING,
        description: 'Optional: filter by a specific deductible category name (e.g. "Work from Home")',
      },
    },
  },
}

async function queryDeductibleExpensesHandler(args: Record<string, unknown>, ctx: HandlerContext): Promise<HandlerResult> {
  const { period, category } = args as { period?: string; category?: string }

  let start: Date
  let end: Date
  let label: string

  if (period?.startsWith('fy')) {
    const yr = parseInt(period.slice(2))
    start = new Date(yr, 6, 1)
    end = new Date(yr + 1, 6, 1)
    label = `FY ${yr}-${yr + 1}`
  } else if (period === 'thisYear') {
    const now = new Date()
    start = new Date(now.getFullYear(), 0, 1)
    end = new Date(now.getFullYear() + 1, 0, 1)
    label = `${now.getFullYear()}`
  } else {
    const now = new Date()
    start = new Date(now.getFullYear(), now.getMonth(), 1)
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    label = now.toLocaleString('en-AU', { month: 'long', year: 'numeric' })
  }

  // Get deductible category IDs
  const categoryWhere: Record<string, unknown> = {
    familyId: ctx.familyId,
    isTaxDeduction: true,
    hideFromReports: false,
  }
  if (category) {
    categoryWhere.name = { contains: category }
  }

  const deductibleCats = await prisma.financeCategory.findMany({
    where: categoryWhere,
    select: { id: true, name: true, taxDisplayLabel: true },
  })

  if (deductibleCats.length === 0) {
    return { message: `No tax-deductible categories found${category ? ` matching "${category}"` : ''}. Mark categories as tax-deductible in Finance → Categories.` }
  }

  const categoryIds = deductibleCats.map(c => c.id)

  const transactions = await prisma.financeTransaction.findMany({
    where: {
      familyId: ctx.familyId,
      date: { gte: start, lt: end },
      categoryId: { in: categoryIds },
      type: { in: ['expense', 'transfer'] },
    },
    select: {
      amount: true,
      description: true,
      date: true,
      category: { select: { name: true, taxDisplayLabel: true } },
    },
    orderBy: { date: 'desc' },
  })

  if (transactions.length === 0) {
    return { message: `No deductible expenses found for ${label}.` }
  }

  const total = transactions.reduce((s, t) => s + t.amount, 0)
  const byCat: Record<string, { total: number; count: number }> = {}
  for (const t of transactions) {
    const catName = t.category?.taxDisplayLabel ?? t.category?.name ?? 'Uncategorised'
    if (!byCat[catName]) byCat[catName] = { total: 0, count: 0 }
    byCat[catName].total += t.amount
    byCat[catName].count++
  }

  const lines = transactions.map(t => {
    const d = new Date(t.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    const catLabel = t.category?.taxDisplayLabel ?? t.category?.name ?? ''
    return `  • $${t.amount.toFixed(2)} — ${t.description ?? catLabel} — ${d}`
  })

  const summaryLines = Object.entries(byCat)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, data]) => `  ${name}: $${data.total.toFixed(2)} (${data.count} txns)`)

  return {
    message: `**📉 Deductible Expenses — ${label}**\n${lines.join('\n')}\n\n**By category:**\n${summaryLines.join('\n')}\n\n**Total: $${total.toFixed(2)}**`,
  }
}

// ── Register ───────────────────────────────────────────────────────────────────

export function registerFinanceTaxTools(): void {
  registerTool('queryTaxSummary', {
    definition: queryTaxSummaryDefinition,
    handler: queryTaxSummaryHandler,
  })

  registerTool('queryDeductibleExpenses', {
    definition: queryDeductibleExpensesDefinition,
    handler: queryDeductibleExpensesHandler,
  })
}
