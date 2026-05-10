// src/lib/financeReport.ts
// Report data aggregation service — builds YTD report payload for Excel, Print, Email
import { prisma } from '@/lib/prisma'
import {
  fyDateRange as fyDateRangeUtil,
  parseFyLabel,
  fyMonthLabels,
  fyMonthsComplete,
  fyMonthIndex as fyMonthIndexUtil,
} from './finance-fy'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ReportRow {
  label: string
  monthly: number[]
  total: number
}

export interface ReportCategory {
  name: string
  rows: ReportRow[]
  subtotal: number
}

export interface ReportSection {
  name: string
  entityId: string | null
  income: {
    rows: ReportRow[]
    subtotal: number
  }
  expenses: {
    categories: ReportCategory[]
    subtotal: number
  }
  nett: number
}

export interface TaxByMember {
  memberId: string
  memberName: string
  taxableIncome: number
  deductions: number
  totalTaxable: number
  paygWithheld: number
  taxPayments: number
  taxCreditForDivs: number
  estimatedTaxPayable: number
  estimatedRefundOrOwing: number
  sgcEmployer: number
  superContributionsVoluntary: number
  superCapUsed: number
  superCapLimit: number
}

export interface TaxByEntity {
  entityId: string
  entityName: string
  income: number
  expenses: number
  taxableIncome: number
  estimatedTax: number
}

export interface ReportPayload {
  meta: {
    financialYear: string
    generatedAt: string
    periodLabel: string
    monthsComplete: number
    months: string[]
  }
  sections: ReportSection[]
  totals: {
    totalIncome: number
    totalExpenses: number
    totalNett: number
  }
  tax: {
    byMember: TaxByMember[]
    joint: {
      bankInterest: number
      otherJointIncome: number
      total: number
    }
    byEntity: TaxByEntity[]
  } | null
}

// ─── Re-export getCurrentFY for backward compatibility ─────────────────────────
import { currentFyYear, fyLabel } from './finance-fy'

/**
 * Get current financial year string e.g. "2026-27" (uses default July FY).
 * Callers that need to support a configurable FY start month should compute
 * the FY label themselves using currentFyYear(fyStartMonth) + fyLabel().
 */
export function getCurrentFY(): string {
  return fyLabel(currentFyYear(7), 7)
}

/**
 * Legacy fyDateRange that takes a label string.
 * New code should use fyDateRange(fyYear, fyStartMonth) from finance-fy.ts.
 */
export function fyDateRange(fy: string): { start: Date; end: Date } {
  const fyYear = parseFyLabel(fy)
  return fyDateRangeUtil(fyYear, 7)
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Calculate how many times a given frequency fires within a month.
 */
function timesPerMonth(frequency: string): number {
  switch (frequency) {
    case 'weekly':      return 52 / 12
    case 'fortnightly': return 26 / 12
    case 'monthly':     return 1
    case 'quarterly':   return 1 / 3
    case 'halfyearly':  return 1 / 6
    case 'yearly':
    case 'annual':      return 1 / 12
    default:            return 1
  }
}

/**
 * Determine which FY month index a date falls in (AU FY default).
 */
function monthIndexInFY(date: Date, fyStartYear: number): number {
  return fyMonthIndexUtil(date, fyStartYear, 7)
}

// ─── Main Builder ──────────────────────────────────────────────────────────────

/**
 * Build a complete YTD report payload for the given family and financial year.
 * @param fyStartMonth The family's financial year start month (1-12). Default 7 (July).
 */
export async function buildYtdReport(
  familyId: string,
  year: string,
  fyStartMonth: number = 7
): Promise<ReportPayload> {
  const fyYear = parseFyLabel(year)
  const { start, end } = fyDateRangeUtil(fyYear, fyStartMonth)
  const now = new Date()

  // Determine months completed so far in this FY
  const monthsComplete = fyMonthsComplete(now, fyYear, fyStartMonth)

  // Months display labels
  const monthLabels = fyMonthLabels(fyStartMonth)
  const months = monthLabels.slice(0, monthsComplete)

  const periodLabel = months.length > 0
    ? `${months[0]} ${fyYear} – ${months[months.length - 1]} ${months.length >= 6 ? fyYear + 1 : fyYear}`
    : `${year}`

  // ── Fetch entities for grouping ──────────────────────────────────────────
  const entities = await prisma.financeEntity.findMany({
    where: { familyId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, isDefault: true },
  })

  // Create a map: entityId → { name, isDefault }
  const entityMap = new Map<string, { name: string; isDefault: boolean }>()
  for (const e of entities) {
    entityMap.set(e.id, { name: e.name, isDefault: e.isDefault })
  }

  // ── Fetch income entries ─────────────────────────────────────────────────
  const incomeEntries = await prisma.financeIncomeEntry.findMany({
    where: {
      familyId,
      isActive: true,
      nextExpectedDate: { gte: start, lte: end },
    },
    select: {
      id: true,
      name: true,
      amount: true,
      frequency: true,
      incomeType: true,
      nextExpectedDate: true,
      received: true,
      entityId: true,
      memberId: true,
      taxClassification: true,
      taxRate: true,
      isTaxTracked: true,
    },
  })

  // ── Fetch recurring bills ────────────────────────────────────────────────
  const bills = await prisma.financeRecurringBill.findMany({
    where: {
      familyId,
      isActive: true,
      nextDueDate: { gte: start, lte: end },
    },
    select: {
      id: true,
      name: true,
      amount: true,
      frequency: true,
      billType: true,
      nextDueDate: true,
      paid: true,
      entityId: true,
      taxClassification: true,
      categoryId: true,
      category: {
        select: { id: true, name: true, isTaxDeduction: true },
      },
    },
  })

  // ── Fetch transactions (cash basis) ──────────────────────────────────────
  const transactions = await prisma.financeTransaction.findMany({
    where: {
      familyId,
      date: { gte: start, lte: end },
      isCleared: true,
      type: { not: 'opening_balance' }, // Exclude opening balance entries from P&L
    },
    select: {
      id: true,
      amount: true,
      type: true,
      date: true,
      description: true,
      entityId: true,
      taxClassification: true,
      categoryId: true,
      category: {
        select: { id: true, name: true, isTaxDeduction: true },
      },
    },
  })

  // ── Fetch members for tax reporting ──────────────────────────────────────
  const members = await prisma.user.findMany({
    where: { familyId },
    select: { id: true, name: true },
  })
  const memberMap = new Map(members.map(m => [m.id, m.name]))

  // ── Build sections per entity ──────────────────────────────────────────
  const sections: ReportSection[] = []

  // Collect all unique entity IDs from data
  const entityIds = new Set<string | null>()
  for (const inc of incomeEntries) entityIds.add(inc.entityId ?? null)
  for (const bill of bills) entityIds.add(bill.entityId ?? null)
  for (const tx of transactions) entityIds.add(tx.entityId ?? null)

  // Include personal/default entity (null entityId)
  // Sort entities: default first, then by name
  const sortedEntityIds = Array.from(entityIds).sort((a, b) => {
    if (a === null && b === null) return 0
    if (a === null) return -1
    if (b === null) return 1
    const aInfo = entityMap.get(a)
    const bInfo = entityMap.get(b)
    const aDefault = aInfo?.isDefault ?? false
    const bDefault = bInfo?.isDefault ?? false
    if (aDefault && !bDefault) return -1
    if (!aDefault && bDefault) return 1
    return (aInfo?.name ?? '').localeCompare(bInfo?.name ?? '')
  })

  let totalIncome = 0
  let totalExpenses = 0

  for (const entityId of sortedEntityIds) {
    const entityInfo = entityId ? entityMap.get(entityId) : null
    const sectionName = entityInfo?.name ?? 'Personal'

    // ── Income rows for this entity ────────────────────────────────────
    const entityIncomeEntries = incomeEntries.filter(
      inc => (inc.entityId ?? null) === entityId
    )

    const incomeRows: ReportRow[] = []
    let incomeSubtotal = 0

    // Group income by name for deduplication
    const incomeByName = new Map<string, { amount: number; frequency: string }>()
    for (const inc of entityIncomeEntries) {
      const existing = incomeByName.get(inc.name)
      if (existing) {
        existing.amount += inc.amount
      } else {
        incomeByName.set(inc.name, { amount: inc.amount, frequency: inc.frequency })
      }
    }

    for (const [label, data] of incomeByName) {
      const monthly = new Array(monthsComplete).fill(0)
      const perMonth = data.amount * timesPerMonth(data.frequency)
      // Distribute across months (spread evenly)
      for (let m = 0; m < monthsComplete; m++) {
        monthly[m] = Math.round(perMonth * 100) / 100
      }
      const total = Math.round(perMonth * monthsComplete * 100) / 100
      incomeRows.push({ label, monthly, total })
      incomeSubtotal += total
    }

    // ── Expense rows for this entity ───────────────────────────────────
    const entityBills = bills.filter(
      bill => (bill.entityId ?? null) === entityId
    )
    const entityTransactions = transactions.filter(
      tx => (tx.entityId ?? null) === entityId
    )

    // Group bills by category
    const expenseByCategory = new Map<string, ReportRow[]>()

    function addExpenseRow(categoryName: string, label: string, amount: number, frequency: string) {
      if (!expenseByCategory.has(categoryName)) {
        expenseByCategory.set(categoryName, [])
      }
      const rows = expenseByCategory.get(categoryName)!
      const existingRow = rows.find(r => r.label === label)
      if (existingRow) {
        // Merge
        const perMonth = amount * timesPerMonth(frequency)
        for (let m = 0; m < monthsComplete; m++) {
          existingRow.monthly[m] = Math.round((existingRow.monthly[m] + perMonth) * 100) / 100
        }
        existingRow.total = Math.round((existingRow.total + perMonth * monthsComplete) * 100) / 100
      } else {
        const monthly = new Array(monthsComplete).fill(0)
        const perMonth = amount * timesPerMonth(frequency)
        for (let m = 0; m < monthsComplete; m++) {
          monthly[m] = Math.round(perMonth * 100) / 100
        }
        const total = Math.round(perMonth * monthsComplete * 100) / 100
        rows.push({ label, monthly, total })
      }
    }

    // Add bill-based expenses
    for (const bill of entityBills) {
      const catName = bill.category?.name ?? 'Uncategorised'
      addExpenseRow(catName, bill.name, bill.amount, bill.frequency)
    }

    // Add transaction-based expenses (cash basis)
    for (const tx of entityTransactions) {
      if (tx.type === 'expense') {
        const catName = tx.category?.name ?? 'Uncategorised'
        const label = tx.description || 'Transaction'
        // Single amount, not recurring
        if (!expenseByCategory.has(catName)) {
          expenseByCategory.set(catName, [])
        }
        const rows = expenseByCategory.get(catName)!
        const existingRow = rows.find(r => r.label === label)
        if (existingRow) {
          const mi = monthIndexInFY(tx.date, fyYear)
          if (mi >= 0 && mi < monthsComplete) {
            existingRow.monthly[mi] = Math.round((existingRow.monthly[mi] + tx.amount) * 100) / 100
          }
          existingRow.total = Math.round((existingRow.total + tx.amount) * 100) / 100
        } else {
          const monthly = new Array(monthsComplete).fill(0)
          const mi = monthIndexInFY(tx.date, fyYear)
          if (mi >= 0 && mi < monthsComplete) {
            monthly[mi] = Math.round(tx.amount * 100) / 100
          }
          rows.push({ label, monthly, total: Math.round(tx.amount * 100) / 100 })
        }
      }
    }

    // Build expense categories
    const expenseCategories: ReportCategory[] = []
    let expenseSubtotal = 0

    for (const [catName, rows] of expenseByCategory) {
      const categorySubtotal = rows.reduce((sum, r) => sum + r.total, 0)
      expenseCategories.push({
        name: catName,
        rows,
        subtotal: Math.round(categorySubtotal * 100) / 100,
      })
      expenseSubtotal += categorySubtotal
    }

    expenseSubtotal = Math.round(expenseSubtotal * 100) / 100

    const sectionNett = Math.round((incomeSubtotal - expenseSubtotal) * 100) / 100

    sections.push({
      name: sectionName,
      entityId,
      income: {
        rows: incomeRows,
        subtotal: incomeSubtotal,
      },
      expenses: {
        categories: expenseCategories,
        subtotal: expenseSubtotal,
      },
      nett: sectionNett,
    })

    totalIncome += incomeSubtotal
    totalExpenses += expenseSubtotal
  }

  // ── Tax data ─────────────────────────────────────────────────────────────
  // Check if any taxClassification fields are populated
  const hasTaxIncome = incomeEntries.some(inc => inc.taxClassification)
  const hasTaxBills = bills.some(b => b.taxClassification)
  const hasTaxTx = transactions.some(tx => tx.taxClassification)

  let tax: ReportPayload['tax'] = null

  if (hasTaxIncome || hasTaxBills || hasTaxTx) {
    // Build tax by entity (computed once, outside member loop)
    const taxByEntity: TaxByEntity[] = []
    for (const entity of entities) {
      const entityIncome = incomeEntries
        .filter(inc => inc.entityId === entity.id && inc.isTaxTracked)
        .reduce((sum, inc) => sum + inc.amount * timesPerMonth(inc.frequency) * monthsComplete, 0)
      const entityExpenses = bills
        .filter(b => b.entityId === entity.id && b.category?.isTaxDeduction)
        .reduce((sum, b) => sum + b.amount * timesPerMonth(b.frequency) * monthsComplete, 0)

      if (entityIncome > 0 || entityExpenses > 0) {
        taxByEntity.push({
          entityId: entity.id,
          entityName: entity.name,
          income: Math.round(entityIncome * 100) / 100,
          expenses: Math.round(entityExpenses * 100) / 100,
          taxableIncome: Math.round((entityIncome - entityExpenses) * 100) / 100,
          estimatedTax: Math.round(Math.max(0, entityIncome - entityExpenses) * 0.25 * 100) / 100,
        })
      }
    }

    // Build tax by member
    const taxByMember: TaxByMember[] = []
    for (const member of members) {
      const memberIncome = incomeEntries.filter(
        inc => (inc.memberId ?? null) === member.id || inc.memberId === null
      )
      const taxableIncome = memberIncome
        .filter(inc => inc.isTaxTracked)
        .reduce((sum, inc) => sum + inc.amount * timesPerMonth(inc.frequency) * monthsComplete, 0)

      if (taxableIncome > 0) {
        taxByMember.push({
          memberId: member.id,
          memberName: member.name,
          taxableIncome: Math.round(taxableIncome * 100) / 100,
          deductions: 0,
          totalTaxable: Math.round(taxableIncome * 100) / 100,
          paygWithheld: 0,
          taxPayments: 0,
          taxCreditForDivs: 0,
          estimatedTaxPayable: Math.round(estimateTax(taxableIncome) * 100) / 100,
          estimatedRefundOrOwing: 0,
          sgcEmployer: 0,
          superContributionsVoluntary: 0,
          superCapUsed: 0,
          superCapLimit: 30000,
        })
      }
    }

    tax = {
      byMember: taxByMember,
      joint: {
        bankInterest: 0,
        otherJointIncome: 0,
        total: 0,
      },
      byEntity: taxByEntity,
    }
  }

  return {
    meta: {
      financialYear: year,
      generatedAt: new Date().toISOString(),
      periodLabel,
      monthsComplete,
      months,
    },
    sections,
    totals: {
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalNett: Math.round((totalIncome - totalExpenses) * 100) / 100,
    },
    tax,
  }
}

/**
 * Simple Australian tax estimate using 2025-26 brackets.
 * For reporting purposes only — not a substitute for professional advice.
 */
function estimateTax(taxableIncome: number): number {
  if (taxableIncome <= 18200) return 0
  if (taxableIncome <= 45000) return (taxableIncome - 18200) * 0.16
  if (taxableIncome <= 135000) return 4288 + (taxableIncome - 45000) * 0.30
  if (taxableIncome <= 190000) return 31288 + (taxableIncome - 135000) * 0.37
  return 51638 + (taxableIncome - 190000) * 0.45
}
