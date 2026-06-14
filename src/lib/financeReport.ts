// src/lib/financeReport.ts
// Report data aggregation service — builds YTD report payload for Excel, Print, Email
//
// ARCHITECTURE: P&L income/expense figures read exclusively from posted
// FinanceJournalLine entries (GL-first, same source as pnl/route.ts).
// Tax estimates are computed from FinanceIncomeEntry (planning data).
import { prisma } from '@/lib/prisma'
import { DEFAULT_TIMEZONE } from '@/lib/timezone'
import {
  fyDateRangeInTz,
  parseFyLabel,
  fyMonthLabels,
  fyMonthsCompleteInTz,
  fyMonthIndexInTz,
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

import { toMonthlyAmount } from './financeShared'

// NOTE: the July-hardcoded getCurrentFY()/fyDateRange(label) helpers that used to
// live here were removed (P9-FC-02). Server default report periods now derive the
// current FY from family settings + tz via currentFyContextInTz() in finance-fy.ts;
// the client uses the separate financeShared.getCurrentFY (already local-time).

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * True for frequencies that land on a specific date rather than recurring every month.
 */
function isLumpSumFrequency(frequency: string): boolean {
  return frequency === 'yearly' || frequency === 'annual' ||
         frequency === 'halfyearly' || frequency === 'quarterly' ||
         frequency === 'one-off'
}

/**
 * Given an income entry with a lump-sum frequency, return the FY month indices
 * (0-based within the FY) where the payment lands in the given FY.
 * Used to filter relevantIncomeEntries for the tax section.
 */
function lumpSumMonthIndices(
  baseDate: Date,
  frequency: string,
  fyYear: number,
  fyStartMonth: number,
  monthsComplete: number,
  tz: string,
): number[] {
  if (frequency === 'one-off') {
    const idx = fyMonthIndexInTz(baseDate, fyYear, fyStartMonth, tz)
    if (idx >= 0 && idx < monthsComplete) return [idx]
    return []
  }

  const intervalMonths =
    frequency === 'quarterly'  ? 3  :
    frequency === 'halfyearly' ? 6  :
    /* yearly / annual */        12

  const indices: number[] = []
  const maxIterations = Math.ceil(12 / intervalMonths) + 2

  for (let i = -maxIterations; i <= maxIterations; i++) {
    const occurrenceDate = new Date(baseDate)
    occurrenceDate.setMonth(occurrenceDate.getMonth() + i * intervalMonths)
    const idx = fyMonthIndexInTz(occurrenceDate, fyYear, fyStartMonth, tz)
    if (idx >= 0 && idx < monthsComplete) {
      indices.push(idx)
    }
  }

  return [...new Set(indices)].sort((a, b) => a - b)
}

/**
 * Determine which FY month index a date falls in, evaluated in the family tz.
 */
function monthIndexInFY(date: Date, fyYear: number, fyStartMonth: number, tz: string): number {
  return fyMonthIndexInTz(date, fyYear, fyStartMonth, tz)
}

// Subset of the Prisma journal-line include that the section aggregator reads.
interface ReportJournalLine {
  side: string
  amount: number
  glAccount: { name: string; type: string }
  journalEntry: { date: Date; description: string | null }
}

/**
 * Build one entity's report section (income rows + expense categories) from its
 * posted journal lines, using normal-balance rules (income net = credit − debit,
 * expense net = debit − credit).
 *
 * Rows/categories whose net is exactly zero are dropped; net-NEGATIVE rows are
 * KEPT. This matches the on-screen P&L (pnl/route.ts filters `totalPeriod !== 0`).
 * Dropping net-negative rows silently overstated income and NETT — e.g. a posted
 * reversal that lands on an income account (its net is negative) would vanish from
 * the export while the on-screen P&L still counted it. See FINANCE_AUDIT.md §4.
 */
export function aggregateEntitySection(
  entityLines: ReportJournalLine[],
  sectionName: string,
  entityId: string | null,
  fyYear: number,
  fyStartMonth: number,
  tz: string,
  monthsComplete: number,
): ReportSection {
  // ── Income rows ────────────────────────────────────────────────────
  // Group by GL account name; normal balance for income = credit.
  const incomeByAccount = new Map<string, { monthly: number[]; total: number }>()

  for (const line of entityLines.filter(l => l.glAccount.type === 'income')) {
    const netAmount = line.side === 'credit' ? line.amount : -line.amount
    if (netAmount === 0) continue
    const mi = monthIndexInFY(line.journalEntry.date, fyYear, fyStartMonth, tz)
    if (mi < 0 || mi >= monthsComplete) continue

    const key = line.glAccount.name
    if (!incomeByAccount.has(key)) {
      incomeByAccount.set(key, { monthly: new Array(monthsComplete).fill(0), total: 0 })
    }
    const g = incomeByAccount.get(key)!
    g.monthly[mi] = Math.round((g.monthly[mi] + netAmount) * 100) / 100
    g.total       = Math.round((g.total + netAmount) * 100) / 100
  }

  const incomeRows: ReportRow[] = Array.from(incomeByAccount.entries())
    .filter(([, d]) => d.total !== 0)
    .map(([label, d]) => ({ label, monthly: d.monthly, total: d.total }))
    .sort((a, b) => b.total - a.total)

  const incomeSubtotal = Math.round(
    incomeRows.reduce((s, r) => s + r.total, 0) * 100
  ) / 100

  // ── Expense categories ─────────────────────────────────────────────
  // Group by GL account name (= category); rows grouped by journal description.
  // Normal balance for expense = debit.
  const expenseByAccount = new Map<string, Map<string, { monthly: number[]; total: number }>>()

  for (const line of entityLines.filter(l => l.glAccount.type === 'expense')) {
    const netAmount = line.side === 'debit' ? line.amount : -line.amount
    if (netAmount === 0) continue
    const mi = monthIndexInFY(line.journalEntry.date, fyYear, fyStartMonth, tz)
    if (mi < 0 || mi >= monthsComplete) continue

    const acctName = line.glAccount.name
    const rowLabel = line.journalEntry.description || 'Transaction'

    if (!expenseByAccount.has(acctName)) expenseByAccount.set(acctName, new Map())
    const acctRows = expenseByAccount.get(acctName)!

    if (!acctRows.has(rowLabel)) {
      acctRows.set(rowLabel, { monthly: new Array(monthsComplete).fill(0), total: 0 })
    }
    const r = acctRows.get(rowLabel)!
    r.monthly[mi] = Math.round((r.monthly[mi] + netAmount) * 100) / 100
    r.total       = Math.round((r.total + netAmount) * 100) / 100
  }

  const expenseCategories: ReportCategory[] = []
  let expenseSubtotal = 0

  for (const [catName, rowsMap] of expenseByAccount) {
    const rows: ReportRow[] = Array.from(rowsMap.entries())
      .filter(([, d]) => d.total !== 0)
      .map(([label, d]) => ({ label, monthly: d.monthly, total: d.total }))
      .sort((a, b) => b.total - a.total)

    const catSubtotal = Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100
    if (catSubtotal === 0) continue

    expenseCategories.push({ name: catName, rows, subtotal: catSubtotal })
    expenseSubtotal += catSubtotal
  }

  expenseCategories.sort((a, b) => b.subtotal - a.subtotal)
  expenseSubtotal = Math.round(expenseSubtotal * 100) / 100

  const sectionNett = Math.round((incomeSubtotal - expenseSubtotal) * 100) / 100

  return {
    name: sectionName,
    entityId,
    income:   { rows: incomeRows, subtotal: incomeSubtotal },
    expenses: { categories: expenseCategories, subtotal: expenseSubtotal },
    nett:     sectionNett,
  }
}

// ─── Main Builder ──────────────────────────────────────────────────────────────

/**
 * Build a complete YTD report payload for the given family and financial year.
 *
 * P&L figures are GL-first: reads exclusively from posted FinanceJournalLine
 * entries (income and expense GL account types). Matches the source used by
 * pnl/route.ts — export and on-screen figures will always agree.
 *
 * @param fyStartMonth The family's financial year start month (1-12). Default 7 (July).
 * @param tz          The family's IANA timezone. Default DEFAULT_TIMEZONE.
 */
export async function buildYtdReport(
  familyId: string,
  year: string,
  fyStartMonth: number = 7,
  tz: string = DEFAULT_TIMEZONE,
): Promise<ReportPayload> {
  const fyYear = parseFyLabel(year)
  const { start, end } = fyDateRangeInTz(fyYear, fyStartMonth, tz)
  const now = new Date()

  const monthsComplete = fyMonthsCompleteInTz(now, fyYear, fyStartMonth, tz)
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
  const entityMap = new Map<string, { name: string; isDefault: boolean }>()
  for (const e of entities) {
    entityMap.set(e.id, { name: e.name, isDefault: e.isDefault })
  }

  // ── GL journal lines — single source of truth for P&L ───────────────────
  // Fetches all posted income and expense lines for the FY.
  // Income section: GL accounts with type 'income'
  // Expense section: GL accounts with type 'expense'
  const journalLines = await prisma.financeJournalLine.findMany({
    where: {
      journalEntry: {
        familyId,
        isPosted: true,
        date: { gte: start, lte: end },
      },
      glAccount: {
        type: { in: ['expense', 'income'] },
      },
    },
    include: {
      glAccount: { select: { id: true, name: true, type: true } },
      journalEntry: {
        select: { id: true, description: true, date: true, entityId: true },
      },
    },
    orderBy: { journalEntry: { date: 'asc' } },
  })

  // ── Income entries — for tax estimation section only ─────────────────────
  const incomeEntries = await prisma.financeIncomeEntry.findMany({
    where: { familyId, isActive: true },
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

  // Filter to entries that have occurrences in this FY (used by tax section)
  const relevantIncomeEntries = incomeEntries.filter(inc => {
    if (isLumpSumFrequency(inc.frequency) || inc.incomeType === 'one-off') {
      const baseDate = (inc.received && inc.receivedDate)
        ? new Date(inc.receivedDate)
        : new Date(inc.nextExpectedDate)
      const indices = lumpSumMonthIndices(baseDate, inc.frequency, fyYear, fyStartMonth, monthsComplete, tz)
      return indices.length > 0
    }
    return true
  })

  // ── Members for tax reporting ──────────────────────────────────────────
  const members = await prisma.user.findMany({
    where: { familyId },
    select: { id: true, name: true },
  })

  // ── Build sections per entity ──────────────────────────────────────────
  const sections: ReportSection[] = []

  // Collect unique entityIds from GL lines only — sections only appear if
  // there are actual posted entries for that entity.
  const entityIds = new Set<string | null>()
  for (const line of journalLines) entityIds.add(line.journalEntry.entityId ?? null)

  const sortedEntityIds = Array.from(entityIds).sort((a, b) => {
    if (a === null && b === null) return 0
    if (a === null) return -1
    if (b === null) return 1
    const aInfo = entityMap.get(a)
    const bInfo = entityMap.get(b)
    if (aInfo?.isDefault && !bInfo?.isDefault) return -1
    if (!aInfo?.isDefault && bInfo?.isDefault) return 1
    return (aInfo?.name ?? '').localeCompare(bInfo?.name ?? '')
  })

  let totalIncome = 0
  let totalExpenses = 0

  for (const entityId of sortedEntityIds) {
    const entityLines = journalLines.filter(
      l => (l.journalEntry.entityId ?? null) === entityId
    )
    if (entityLines.length === 0) continue

    const entityInfo = entityId ? entityMap.get(entityId) : null
    const sectionName = entityInfo?.name ?? 'Personal'

    const section = aggregateEntitySection(
      entityLines, sectionName, entityId, fyYear, fyStartMonth, tz, monthsComplete
    )

    sections.push(section)
    totalIncome   += section.income.subtotal
    totalExpenses += section.expenses.subtotal
  }

  // ── Tax data (estimated — reads from income entries) ─────────────────────
  // The tax section is a planning/estimation tool. It reads from FinanceIncomeEntry
  // because that table carries fields (isTaxTracked, taxRate, memberId) that are
  // not present on journal lines. Figures here are projections, not GL amounts.
  const hasTaxIncome = relevantIncomeEntries.some(inc => inc.taxClassification)

  let tax: ReportPayload['tax'] = null

  if (hasTaxIncome) {
    const taxByEntity: TaxByEntity[] = []
    for (const entity of entities) {
      const entityIncome = relevantIncomeEntries
        .filter(inc => inc.entityId === entity.id && inc.isTaxTracked)
        .reduce((sum, inc) => sum + toMonthlyAmount(inc.amount, inc.frequency) * monthsComplete, 0)

      if (entityIncome > 0) {
        taxByEntity.push({
          entityId:       entity.id,
          entityName:     entity.name,
          income:         Math.round(entityIncome * 100) / 100,
          expenses:       0,
          taxableIncome:  Math.round(entityIncome * 100) / 100,
          estimatedTax:   Math.round(Math.max(0, entityIncome) * 0.25 * 100) / 100,
        })
      }
    }

    const taxByMember: TaxByMember[] = []
    for (const member of members) {
      const memberIncome = relevantIncomeEntries.filter(
        inc => (inc.memberId ?? null) === member.id || inc.memberId === null
      )
      const taxableIncome = memberIncome
        .filter(inc => inc.isTaxTracked)
        .reduce((sum, inc) => sum + toMonthlyAmount(inc.amount, inc.frequency) * monthsComplete, 0)

      if (taxableIncome > 0) {
        taxByMember.push({
          memberId:                  member.id,
          memberName:                member.name,
          taxableIncome:             Math.round(taxableIncome * 100) / 100,
          deductions:                0,
          totalTaxable:              Math.round(taxableIncome * 100) / 100,
          paygWithheld:              0,
          taxPayments:               0,
          taxCreditForDivs:          0,
          estimatedTaxPayable:       Math.round(estimateTax(taxableIncome) * 100) / 100,
          estimatedRefundOrOwing:    0,
          sgcEmployer:               0,
          superContributionsVoluntary: 0,
          superCapUsed:              0,
          superCapLimit:             30000,
        })
      }
    }

    tax = {
      byMember: taxByMember,
      joint: { bankInterest: 0, otherJointIncome: 0, total: 0 },
      byEntity: taxByEntity,
    }
  }

  return {
    meta: {
      financialYear: year,
      generatedAt:   new Date().toISOString(),
      periodLabel,
      monthsComplete,
      months,
    },
    sections,
    totals: {
      totalIncome:    Math.round(totalIncome * 100) / 100,
      totalExpenses:  Math.round(totalExpenses * 100) / 100,
      totalNett:      Math.round((totalIncome - totalExpenses) * 100) / 100,
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
