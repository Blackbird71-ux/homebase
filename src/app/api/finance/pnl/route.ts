import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { currentFyYear, fyDateRangeInTz, monthRangeInTz, quarterRangeInTz } from '@/lib/finance-fy'

// ── GL-first P&L ─────────────────────────────────────────────────────────────
//
// ARCHITECTURE: The P&L reads EXCLUSIVELY from posted FinanceJournalLine entries.
// No reads from FinanceRecurringBill or FinanceIncomeEntry tables for financial
// figures. If something is not in the GL (isPosted=true journal entry), it is
// not on the P&L. This is the Xero standard.
//
// Income recognition: when invoiceReceived=true fires on an income entry, a
//   posted journal entry is created: DR AR / CR Income. Income appears from
//   that date.
//
// Expense recognition: when invoiceReceived=true fires on a bill, a posted
//   journal entry is created: DR Expense / CR AP. Expense appears from that date.
//
// The dual-source read and its deduplication bugs are completely eliminated.

function getPeriodBounds(
  period: string,
  anchor: Date,
  fyStartMonth: number,
  tz: string,
): { start: Date; end: Date; periodMonths: number } {
  const year  = anchor.getFullYear()
  const month = anchor.getMonth() + 1

  if (period === 'month') {
    const { start, end } = monthRangeInTz(year, month, tz)
    return { start, end, periodMonths: 1 }
  }
  if (period === 'quarter') {
    const { start, end } = quarterRangeInTz(year, month, tz)
    return { start, end, periodMonths: 3 }
  }
  const fyYear   = currentFyYear(fyStartMonth)
  const fyOffset = month < fyStartMonth ? 1 : 0
  const startYear = fyYear - fyOffset
  const { start, end } = fyDateRangeInTz(startYear, fyStartMonth, tz)
  return { start, end, periodMonths: 12 }
}

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)

  const entityId   = searchParams.get('entityId') ?? undefined
  const period     = searchParams.get('period') ?? 'month'
  const anchorRaw  = searchParams.get('anchor')
  const anchor     = anchorRaw ? new Date(anchorRaw) : new Date()
  const familyId   = session.familyId

  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { financeYearStartMonth: true, timezone: true },
  })
  const fyStartMonth = family?.financeYearStartMonth ?? 7
  const tz = family?.timezone ?? 'Australia/Sydney'

  const { start, end } = getPeriodBounds(period, anchor, fyStartMonth, tz)

  // ── Entities for tabs ───────────────────────────────────────────────────
  const entities = await prisma.financeEntity.findMany({
    where: { familyId },
    select: { id: true, name: true, type: true, isDefault: true },
    orderBy: { name: 'asc' },
  })

  // ── READ FROM GL ONLY ───────────────────────────────────────────────────
  // Fetch all posted journal lines for income and expense GL accounts in period.
  // This is the SINGLE source of truth. No bill/income table reads.
  const journalLines = await prisma.financeJournalLine.findMany({
    where: {
      journalEntry: {
        familyId,
        isPosted: true,
        date: { gte: start, lte: end },
        ...(entityId ? { entityId } : {}),
      },
      glAccount: {
        type: { in: ['expense', 'income'] },
      },
    },
    include: {
      glAccount: { select: { id: true, name: true, type: true, color: true } },
      journalEntry: {
        select: { id: true, reference: true, date: true, description: true, type: true, entityId: true },
      },
    },
    orderBy: { journalEntry: { date: 'asc' } },
  })

  // ── Group by GL account ─────────────────────────────────────────────────
  // Income accounts: CR increases (normal balance), DR decreases
  // Expense accounts: DR increases (normal balance), CR decreases
  const incomeMap  = new Map<string, { key: string; label: string; color: string | null; totalPeriod: number; count: number; items: any[] }>()
  const expenseMap = new Map<string, { key: string; label: string; color: string | null; totalPeriod: number; count: number; items: any[] }>()

  for (const line of journalLines) {
    const acct = line.glAccount
    let netAmount: number

    if (acct.type === 'income') {
      // Normal balance = credit. CR increases income, DR decreases.
      netAmount = line.side === 'credit' ? line.amount : -line.amount
    } else {
      // expense: normal balance = debit. DR increases expense, CR decreases.
      netAmount = line.side === 'debit' ? line.amount : -line.amount
    }

    if (netAmount === 0) continue

    const map    = acct.type === 'income' ? incomeMap : expenseMap
    const key    = acct.id
    const label  = acct.name
    const color  = (acct as any).color ?? null

    if (!map.has(key)) map.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
    const g = map.get(key)!
    g.totalPeriod += netAmount
    g.count++
    g.items.push({
      id:          line.journalEntry.id,
      name:        line.journalEntry.description,
      amount:      line.amount,
      periodAmount: netAmount,
      isOneOff:    true,
      paid:        true,
      received:    true,
      date:        line.journalEntry.date.toISOString().split('T')[0],
      reference:   line.journalEntry.reference ?? null,
      jeType:      line.journalEntry.type,
      source:      'journal',
      side:        line.side,
    })
  }

  // ── Sort and total ──────────────────────────────────────────────────────
  const incomeGroups  = Array.from(incomeMap.values())
    .filter(g => g.totalPeriod !== 0)
    .sort((a, b) => b.totalPeriod - a.totalPeriod)

  const expenseGroups = Array.from(expenseMap.values())
    .filter(g => g.totalPeriod !== 0)
    .sort((a, b) => b.totalPeriod - a.totalPeriod)

  const totalIncome   = incomeGroups.reduce((s, g) => s + g.totalPeriod, 0)
  const totalExpenses = expenseGroups.reduce((s, g) => s + g.totalPeriod, 0)
  const netProfit     = totalIncome - totalExpenses

  const fmt = (d: Date) => d.toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: tz,
  })
  const label = `${fmt(start)} \u2013 ${fmt(end)}`

  return NextResponse.json({
    incomeGroups,
    expenseGroups,
    totalIncome,
    totalExpenses,
    estimatedTax: 0,   // Tax tracking moved to tax report
    netProfit,
    period,
    label,
    from: start.toISOString().split('T')[0],
    to:   end.toISOString().split('T')[0],
    entities,
    source: 'gl',   // Confirms this is GL-only data — useful for debugging
  })
}
