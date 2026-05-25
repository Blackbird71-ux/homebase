import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'

// ─── Types ────────────────────────────────────────────────────────────────────
// The budget page uses IncomeStream objects. We derive them from FinanceIncomeEntry
// records so there is a single source of truth — the budgetIncomeStreams JSON
// blob on the Family table is no longer used for anything.

export interface IncomeStream {
  id: string
  name: string
  amount: number
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'bimonthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'custom'
  customInterval?: number | null
  customUnit?: 'days' | 'weeks' | 'months' | 'years' | null
  isIncluded: boolean
  entityId?: string | null
  isTaxTracked: boolean
  taxRate: number | null
}

/** Convert a stream's amount to a monthly equivalent for budget summaries. */
export function streamToMonthly(s: IncomeStream): number {
  const { amount, frequency, customInterval, customUnit } = s
  switch (frequency) {
    case 'weekly':      return amount * 52 / 12
    case 'fortnightly': return amount * 26 / 12
    case 'monthly':     return amount
    // bimonthly = every 2 months = 6×/year → monthly equivalent = amount / 2
    case 'bimonthly':   return amount / 2
    case 'quarterly':   return amount / 3
    case 'halfyearly':  return amount / 6
    case 'yearly':      return amount / 12
    case 'custom': {
      if (!customInterval || !customUnit || customInterval <= 0) return amount
      let periodsPerYear: number
      switch (customUnit) {
        case 'days':   periodsPerYear = 365 / customInterval; break
        case 'weeks':  periodsPerYear = 52  / customInterval; break
        case 'months': periodsPerYear = 12  / customInterval; break
        case 'years':  periodsPerYear = 1   / customInterval; break
        default:       periodsPerYear = 1
      }
      return amount * periodsPerYear / 12
    }
    default: return amount
  }
}

// ─── Map FinanceIncomeEntry frequency to IncomeStream frequency ───────────────
function mapFrequency(freq: string): IncomeStream['frequency'] {
  const valid = ['weekly', 'fortnightly', 'monthly', 'bimonthly', 'quarterly', 'halfyearly', 'yearly']
  if (valid.includes(freq)) return freq as IncomeStream['frequency']
  // one-off / custom / unknown → treat as monthly for the budget planner
  return 'monthly'
}

/**
 * GET /api/finance/income-streams
 * Returns active FinanceIncomeEntry records shaped as IncomeStream objects.
 * Only the most-recent (non-received parent) entry per income name/entity is
 * returned — i.e. we deduplicate by (name + entityId) so recurring series
 * appear as a single stream rather than every occurrence.
 */
export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch all active, non-received entries without a parent (root of each series)
  // A root entry has no parentIncomeId — it's the original recurring entry.
  // Child occurrences spawned by mark-received also have no parent-level context
  // in the budget planner, so we show the latest pending child per series.
  const entries = await prisma.financeIncomeEntry.findMany({
    where: {
      familyId: user.familyId,
      isActive: true,
      received: false,  // Only pending/upcoming entries for forward-looking budget
    },
    select: {
      id: true,
      name: true,
      amount: true,
      frequency: true,
      incomeType: true,
      entityId: true,
      isActive: true,
      parentIncomeId: true,
      nextExpectedDate: true,
      isTaxTracked: true,
      taxRate: true,
    },
    orderBy: { nextExpectedDate: 'asc' },
  })

  // Deduplicate: for each unique (name, entityId) pair, keep one entry.
  // Prefer child occurrences (latest) over the original root if it's been spent.
  const seen = new Map<string, typeof entries[0]>()
  for (const e of entries) {
    const key = `${e.name}__${e.entityId ?? ''}`
    if (!seen.has(key)) {
      seen.set(key, e)
    } else {
      // Keep the one with the earlier nextExpectedDate (i.e. next in line)
      const existing = seen.get(key)!
      if (new Date(e.nextExpectedDate) < new Date(existing.nextExpectedDate)) {
        seen.set(key, e)
      }
    }
  }

  const streams: IncomeStream[] = Array.from(seen.values()).map(e => ({
    id: e.id,
    name: e.name,
    amount: e.amount,
    frequency: mapFrequency(e.frequency),
    customInterval: null,
    customUnit: null,
    isIncluded: true,  // All active income entries are included by default
    entityId: e.entityId ?? null,
    isTaxTracked: e.isTaxTracked,
    taxRate: e.taxRate,
  }))

  return NextResponse.json(streams)
}

/**
 * PUT /api/finance/income-streams
 * Previously persisted streams as a JSON blob on the Family table.
 * This endpoint is now a no-op stub — the budget page reads directly from
 * FinanceIncomeEntry via GET above. We keep the endpoint so existing client
 * code that calls PUT doesn't break; it returns the current stream list.
 */
export async function PUT(_request: NextRequest) {
  // Re-read and return the current live list (ignore the request body)
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const entries = await prisma.financeIncomeEntry.findMany({
    where: { familyId: user.familyId, isActive: true, received: false },
    select: { id: true, name: true, amount: true, frequency: true, incomeType: true, entityId: true, isActive: true, parentIncomeId: true, nextExpectedDate: true, isTaxTracked: true, taxRate: true },
    orderBy: { nextExpectedDate: 'asc' },
  })
  const seen = new Map<string, typeof entries[0]>()
  for (const e of entries) {
    const key = `${e.name}__${e.entityId ?? ''}`
    if (!seen.has(key)) { seen.set(key, e) } else {
      const existing = seen.get(key)!
      if (new Date(e.nextExpectedDate) < new Date(existing.nextExpectedDate)) { seen.set(key, e) }
    }
  }
  const streams: IncomeStream[] = Array.from(seen.values()).map(e => ({
    id: e.id, name: e.name, amount: e.amount, frequency: mapFrequency(e.frequency),
    customInterval: null, customUnit: null, isIncluded: true, entityId: e.entityId ?? null,
    isTaxTracked: e.isTaxTracked, taxRate: e.taxRate,
  }))
  return NextResponse.json(streams)
}
