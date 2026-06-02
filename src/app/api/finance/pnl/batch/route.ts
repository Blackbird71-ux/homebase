import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { getFamilyTimezone } from '@/lib/family'
import { localMidnightToUtc } from '@/lib/timezone'

// ── Batch P&L ────────────────────────────────────────────────────────────────
//
// Returns GL actuals for all months in a date range in one DB round-trip.
// Replaces the Annual P&L page making 12 separate /api/finance/pnl calls.
//
// Query params:
//   from      ISO date string for the first day of the range (e.g. "2025-07-01")
//   to        ISO date string for the last day of the range  (e.g. "2026-06-30")
//   entityId  optional — filter to a specific entity

export async function GET(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const familyId = user.familyId

  const fromRaw = searchParams.get('from')
  const toRaw   = searchParams.get('to')
  const entityId = searchParams.get('entityId') ?? undefined

  if (!fromRaw || !toRaw) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
  }

  const tz = await getFamilyTimezone(familyId)

  // Interpret from/to as calendar days in the family timezone. new Date(toRaw) pins
  // the upper bound to UTC midnight, which for east-of-UTC zones (Sydney = UTC+10)
  // drops entries timestamped later on the final day. Anchor both bounds to the
  // family tz and extend the end to cover the whole last calendar day.
  const rangeStart = localMidnightToUtc(fromRaw, tz)
  const rangeEnd   = new Date(localMidnightToUtc(toRaw, tz).getTime() + 86_400_000 - 1)

  // Single DB query for all posted income/expense journal lines in the full range
  const journalLines = await prisma.financeJournalLine.findMany({
    where: {
      journalEntry: {
        familyId,
        isPosted: true,
        date: { gte: rangeStart, lte: rangeEnd },
        ...(entityId ? { entityId } : {}),
      },
      glAccount: {
        type: { in: ['expense', 'income'] },
        hideFromReports: false,
      },
    },
    select: {
      side: true,
      amount: true,
      glAccount: { select: { id: true, name: true, type: true, color: true } },
      journalEntry: { select: { date: true } },
    },
  })

  // Build a map of month-key → { incomeMap, expenseMap }
  // month-key format: "YYYY-MM" (calendar month of the journal entry date in the family tz)
  type GroupEntry = { key: string; label: string; color: string | null; totalPeriod: number }
  type MonthData = {
    incomeMap:  Map<string, GroupEntry>
    expenseMap: Map<string, GroupEntry>
  }
  const monthMap = new Map<string, MonthData>()

  // Build the set of month keys that span the range so every month appears in the result
  // even if it has no transactions.
  const monthKeys: string[] = []
  {
    let cur = new Date(rangeStart)
    while (cur <= rangeEnd) {
      const key = `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`
      monthKeys.push(key)
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1))
    }
  }
  for (const k of monthKeys) {
    monthMap.set(k, { incomeMap: new Map(), expenseMap: new Map() })
  }

  for (const line of journalLines) {
    const d   = new Date(line.journalEntry.date)
    // Determine calendar month in family timezone
    const tzDate = new Intl.DateTimeFormat('en-AU', { timeZone: tz, year: 'numeric', month: '2-digit' })
      .formatToParts(d)
    const yr  = tzDate.find(p => p.type === 'year')!.value
    const mo  = tzDate.find(p => p.type === 'month')!.value
    const key = `${yr}-${mo}`

    const month = monthMap.get(key)
    if (!month) continue

    const acct = line.glAccount
    let netAmount: number
    if (acct.type === 'income') {
      netAmount = line.side === 'credit' ? line.amount : -line.amount
    } else {
      netAmount = line.side === 'debit' ? line.amount : -line.amount
    }
    if (netAmount === 0) continue

    const map = acct.type === 'income' ? month.incomeMap : month.expenseMap
    if (!map.has(acct.id)) {
      map.set(acct.id, { key: acct.id, label: acct.name, color: (acct as any).color ?? null, totalPeriod: 0 })
    }
    map.get(acct.id)!.totalPeriod += netAmount
  }

  // Convert to serialisable result keyed by "YYYY-MM"
  const result: Record<string, {
    incomeGroups:  GroupEntry[]
    expenseGroups: GroupEntry[]
    totalIncome:   number
    totalExpenses: number
    netProfit:     number
  }> = {}

  for (const [monthKey, { incomeMap, expenseMap }] of monthMap) {
    const incomeGroups  = Array.from(incomeMap.values()).filter(g => g.totalPeriod !== 0).sort((a, b) => b.totalPeriod - a.totalPeriod)
    const expenseGroups = Array.from(expenseMap.values()).filter(g => g.totalPeriod !== 0).sort((a, b) => b.totalPeriod - a.totalPeriod)
    const totalIncome   = incomeGroups.reduce((s, g) => s + g.totalPeriod, 0)
    const totalExpenses = expenseGroups.reduce((s, g) => s + g.totalPeriod, 0)
    result[monthKey] = {
      incomeGroups,
      expenseGroups,
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
    }
  }

  return NextResponse.json(result)
}
