// src/lib/financeShared.ts
// Client-safe helpers and types — NO prisma imports (avoids better-sqlite3 bundling issues)

// ─── Shared Types ─────────────────────────────────────────────────────────

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
  income: { rows: ReportRow[]; subtotal: number }
  expenses: { categories: ReportCategory[]; subtotal: number }
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
  entityId: string | null
  entityName: string
  byMember: TaxByMember[]
}

export interface ReportPayload {
  meta: {
    financialYear: string
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
  tax: { byEntity: TaxByEntity[]; byMember: TaxByMember[] } | null
}

// ─── Pure Helpers ──────────────────────────────────────────────────────────

export const MONTH_LABELS = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

/**
 * Convert "2026-27" → { start: 2026-07-01, end: 2027-06-30 }
 */
export function fyDateRange(fy: string): { start: Date; end: Date } {
  const startYear = parseInt(fy.split('-')[0])
  return {
    start: new Date(`${startYear}-07-01T00:00:00.000Z`),
    end: new Date(`${startYear + 1}-06-30T23:59:59.999Z`),
  }
}

/**
 * Get current financial year string e.g. "2026-27"
 */
export function getCurrentFY(): string {
  const now = new Date()
  const y = now.getFullYear()
  return now.getMonth() >= 6
    ? `${y}-${String(y + 1).slice(2)}`
    : `${y - 1}-${String(y).slice(2)}`
}

/**
 * Get the month index (0-11) within the FY for a given date.
 *
 * IMPORTANT: This function uses a hardcoded July FY start (AU default).
 * For configurable FY start months, use fyMonthIndex() from finance-fy.ts instead.
 *
 * Jul=0, Aug=1, ..., Jun=11
 *
 * @deprecated For new code, import fyMonthIndex from '@/lib/finance-fy' and pass
 * the family's fyStartMonth. This function is kept for backward compatibility only.
 */
export function fyMonthIndex(date: Date, _fyStartYear?: number): number {
  // fyStartYear parameter is unused — this always uses July as FY start.
  // The parameter is kept to avoid breaking existing call sites.
  const m = date.getMonth()
  return m >= 6 ? m - 6 : m + 6
}

/**
 * Convert frequency string to times-per-month multiplier.
 */
export function timesPerMonth(frequency: string): number {
  switch (frequency) {
    case 'weekly':      return 52 / 12
    case 'fortnightly': return 26 / 12
    case 'monthly':     return 1
    case 'quarterly':   return 1 / 3
    case 'halfyearly':  return 1 / 6
    case 'yearly':      return 1 / 12
    default:            return 0
  }
}
