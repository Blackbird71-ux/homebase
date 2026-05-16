// src/lib/financeReport.ts
// Report data aggregation service — builds YTD report payload for Excel, Print, Email
import { prisma } from '@/lib/prisma'
import {
  fyDateRangeInTz,
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
 * New code should use fyDateRangeInTz(fyYear, fyStartMonth, tz) from finance-fy.ts.
 */
export function fyDateRange(fy: string): { start: Date; end: Date } {
  const fyYear = parseFyLabel(fy)
  return fyDateRangeInTz(fyYear, 7, 'Australia/Sydney')
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
 * True for frequencies that land on a specific date rather than recurring every month.
 * Lump-sum amounts must NOT be averaged across months — they go in one specific column.
 */
function isLumpSumFrequency(frequency: string): boolean {
  return frequency === 'yearly' || frequency === 'annual' ||
         frequency === 'halfyearly' || frequency === 'quarterly' ||
         frequency === 'one-off'
}

/**
 * Given an income entry or bill with a lump-sum frequency, return the FY month indices
 * (0-based within the FY) where the payment lands in the given FY.
 *
 * Uses the same logic as the Annual P&L page's lumpSumColumns() function.
 *
 * @param baseDate      The next expected / next due date (our reference anchor)
 * @param frequency     'quarterly' | 'halfyearly' | 'yearly' | 'annual' | 'one-off'
 * @param fyYear        The FY start year (e.g. 2025 for FY2025-26)
 * @param fyStartMonth  FY start month (1-12; 7 = July)
 * @param monthsComplete How many months of the FY have results so far
 */
function lumpSumMonthIndices(
  baseDate: Date,
  frequency: string,
  fyYear: number,
  fyStartMonth: number,
  monthsComplete: number,
): number[] {
  if (frequency === 'one-off') {
    const idx = fyMonthIndexUtil(baseDate, fyYear, fyStartMonth)
    if (idx >= 0 && idx < monthsComplete) return [idx]
    return []
  }

  // Interval in months between occurrences
  const intervalMonths =
    frequency === 'quarterly'  ? 3  :
    frequency === 'halfyearly' ? 6  :
    /* yearly / annual */        12

  // Walk backwards from baseDate by intervalMonths until we've covered the whole FY,
  // and forwards as well, collecting indices that fall within the FY
  const indices: number[] = []

  // Try up to 12 / intervalMonths + 2 occurrences in both directions
  const maxIterations = Math.ceil(12 / intervalMonths) + 2

  for (let i = -maxIterations; i <= maxIterations; i++) {
    const occurrenceDate = new Date(baseDate)
    occurrenceDate.setMonth(occurrenceDate.getMonth() + i * intervalMonths)
    const idx = fyMonthIndexUtil(occurrenceDate, fyYear, fyStartMonth)
    if (idx >= 0 && idx < monthsComplete) {
      indices.push(idx)
    }
  }

  // Deduplicate and sort
  return [...new Set(indices)].sort((a, b) => a - b)
}

/**
 * Determine which FY month index a date falls in (AU FY default).
 */
function monthIndexInFY(date: Date, fyYear: number, fyStartMonth: number = 7): number {
  return fyMonthIndexUtil(date, fyYear, fyStartMonth)
}

// ─── Main Builder ──────────────────────────────────────────────────────────────

/**
 * Build a complete YTD report payload for the given family and financial year.
 * @param fyStartMonth The family's financial year start month (1-12). Default 7 (July).
 * @param tz          The family's IANA timezone. Default 'Australia/Sydney'.
 *                    Used to compute period boundaries correctly on the NAS server (P2 fix #2).
 */
export async function buildYtdReport(
  familyId: string,
  year: string,
  fyStartMonth: number = 7,
  tz: string = 'Australia/Sydney',
): Promise<ReportPayload> {
  const fyYear = parseFyLabel(year)
  const { start, end } = fyDateRangeInTz(fyYear, fyStartMonth, tz)
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

  // ── Hidden category IDs (exclude from reports) ──────────────────────────
  const hiddenCategoryIds = new Set(
    (await prisma.financeCategory.findMany({
      where: { familyId, hideFromReports: true },
      select: { id: true },
    })).map(c => c.id)
  )

  // ── Fetch income entries ─────────────────────────────────────────────────
  // For lump-sum entries, we use the nextExpectedDate as the anchor. We need
  // a wider window than just the FY because a lump-sum payment's nextExpectedDate
  // might be just outside the FY while the actual occurrences fall inside.
  // We extend the date window by one interval on each side.
  const incomeEntries = await prisma.financeIncomeEntry.findMany({
    where: {
      familyId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      amount: true,
      frequency: true,
      incomeType: true,
      nextExpectedDate: true,
      received: true,
      receivedDate: true,
      entityId: true,
      memberId: true,
      taxClassification: true,
      taxRate: true,
      isTaxTracked: true,
    },
  })

  // Filter to entries relevant to this FY
  const relevantIncomeEntries = incomeEntries.filter(inc => {
    if (isLumpSumFrequency(inc.frequency) || inc.incomeType === 'one-off') {
      // Lump sum: include if any occurrence falls within the FY months we're reporting
      const indices = lumpSumMonthIndices(
        new Date(inc.nextExpectedDate), inc.frequency, fyYear, fyStartMonth, monthsComplete
      )
      return indices.length > 0
    }
    // Recurring: always include (we'll spread across months)
    return true
  })

  // ── Fetch recurring bills ────────────────────────────────────────────────
  const bills = await prisma.financeRecurringBill.findMany({
    where: {
      familyId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      amount: true,
      frequency: true,
      billType: true,
      billDate: true,
      nextDueDate: true,
      paid: true,
      entityId: true,
      taxClassification: true,
      categoryId: true,
      category: {
        select: { id: true, name: true, isTaxDeduction: true },
      },
      payments: {
        select: { amount: true, paymentDate: true },
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
  for (const inc of relevantIncomeEntries) entityIds.add(inc.entityId ?? null)
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
    const entityIncomeEntries = relevantIncomeEntries.filter(
      inc => (inc.entityId ?? null) === entityId
    )

    const incomeRows: ReportRow[] = []
    let incomeSubtotal = 0

    // Process each income entry individually (not deduplicated by name, to preserve
    // correct month placement for lump sums with the same name)
    for (const inc of entityIncomeEntries) {
      const monthly = new Array(monthsComplete).fill(0)
      let total = 0

      const isLumpSum = isLumpSumFrequency(inc.frequency) || inc.incomeType === 'one-off'

      if (isLumpSum) {
        // P1 fix: lump-sum income lands in specific months, not spread evenly.
        // If the income has been received, use the actual receivedDate.
        const baseDate = (inc.received && inc.receivedDate)
          ? new Date(inc.receivedDate)
          : new Date(inc.nextExpectedDate)

        const indices = lumpSumMonthIndices(baseDate, inc.frequency, fyYear, fyStartMonth, monthsComplete)
        for (const idx of indices) {
          monthly[idx] = Math.round((monthly[idx] + inc.amount) * 100) / 100
          total += inc.amount
        }
        total = Math.round(total * 100) / 100
      } else {
        // Genuinely recurring: spread evenly across all completed months
        const perMonth = inc.amount * timesPerMonth(inc.frequency)
        for (let m = 0; m < monthsComplete; m++) {
          monthly[m] = Math.round(perMonth * 100) / 100
        }
        total = Math.round(perMonth * monthsComplete * 100) / 100
      }

      if (total === 0) continue

      // Merge with existing row of same label if present
      const existingRow = incomeRows.find(r => r.label === inc.name)
      if (existingRow) {
        for (let m = 0; m < monthsComplete; m++) {
          existingRow.monthly[m] = Math.round((existingRow.monthly[m] + monthly[m]) * 100) / 100
        }
        existingRow.total = Math.round((existingRow.total + total) * 100) / 100
        incomeSubtotal += total
      } else {
        incomeRows.push({ label: inc.name, monthly, total })
        incomeSubtotal += total
      }
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

    function addExpenseRow(categoryName: string, label: string, monthly: number[], total: number) {
      if (!expenseByCategory.has(categoryName)) {
        expenseByCategory.set(categoryName, [])
      }
      const rows = expenseByCategory.get(categoryName)!
      const existingRow = rows.find(r => r.label === label)
      if (existingRow) {
        for (let m = 0; m < monthsComplete; m++) {
          existingRow.monthly[m] = Math.round((existingRow.monthly[m] + monthly[m]) * 100) / 100
        }
        existingRow.total = Math.round((existingRow.total + total) * 100) / 100
      } else {
        rows.push({ label, monthly, total })
      }
    }

    // Add bill-based expenses (P1 fix: use lumpSumMonthIndices for lump-sum bills)
    // Bills with payment records via FinanceBillPayment are SKIPPED here because
    // their individual payment transactions are already captured as cleared
    // expense transactions in the transaction loop below. Skipping prevents
    // double-counting (same logic as the PNL route's billIdWithTxInPeriod dedup).
    for (const bill of entityBills) {
      if (bill.categoryId && hiddenCategoryIds.has(bill.categoryId)) continue
      const billPayments = (bill as any).payments
      if (billPayments && billPayments.length > 0) continue

      const catName = bill.category?.name ?? 'Uncategorised'
      const monthly = new Array(monthsComplete).fill(0)
      let total = 0

      const isLumpSum = isLumpSumFrequency(bill.frequency) || bill.billType === 'one-off'

      if (isLumpSum) {
        const baseDate = (bill.paid && (bill as any).paidDate)
          ? new Date((bill as any).paidDate)
          : new Date(bill.billDate ?? bill.nextDueDate)
        const indices = lumpSumMonthIndices(baseDate, bill.frequency, fyYear, fyStartMonth, monthsComplete)
        for (const idx of indices) {
          monthly[idx] = Math.round((monthly[idx] + bill.amount) * 100) / 100
          total += bill.amount
        }
        total = Math.round(total * 100) / 100
      } else {
        const perMonth = bill.amount * timesPerMonth(bill.frequency)
        for (let m = 0; m < monthsComplete; m++) {
          monthly[m] = Math.round(perMonth * 100) / 100
        }
        total = Math.round(perMonth * monthsComplete * 100) / 100
      }

      if (total > 0) {
        addExpenseRow(catName, bill.name, monthly, total)
      }
    }

    // Add transaction-based expenses (cash basis — placed in actual month)
    for (const tx of entityTransactions) {
      if (tx.type === 'expense') {
        if (tx.categoryId && hiddenCategoryIds.has(tx.categoryId)) continue
        const catName = tx.category?.name ?? 'Uncategorised'
        const label = tx.description || 'Transaction'
        const monthly = new Array(monthsComplete).fill(0)
        const mi = monthIndexInFY(tx.date, fyYear, fyStartMonth)
        if (mi >= 0 && mi < monthsComplete) {
          monthly[mi] = Math.round(tx.amount * 100) / 100
        }
        addExpenseRow(catName, label, monthly, Math.round(tx.amount * 100) / 100)
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
  const hasTaxIncome = relevantIncomeEntries.some(inc => inc.taxClassification)
  const hasTaxBills = bills.some(b => b.taxClassification)
  const hasTaxTx = transactions.some(tx => tx.taxClassification)

  let tax: ReportPayload['tax'] = null

  if (hasTaxIncome || hasTaxBills || hasTaxTx) {
    // Build tax by entity (computed once, outside member loop)
    const taxByEntity: TaxByEntity[] = []
    for (const entity of entities) {
      const entityIncome = relevantIncomeEntries
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
      const memberIncome = relevantIncomeEntries.filter(
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
 * Effective date: 1 July 2025 (post Stage 3 cuts).
 * For reporting purposes only — not a substitute for professional advice.
 * Brackets are hardcoded here and in tax-report/route.ts — update both
 * at the start of each new financial year.
 */
function estimateTax(taxableIncome: number): number {
  if (taxableIncome <= 18200)  return 0
  if (taxableIncome <= 45000)  return (taxableIncome - 18200) * 0.16
  if (taxableIncome <= 135000) return 4288  + (taxableIncome - 45000)  * 0.30
  if (taxableIncome <= 190000) return 31288 + (taxableIncome - 135000) * 0.37
  return 51638 + (taxableIncome - 190000) * 0.45
}
