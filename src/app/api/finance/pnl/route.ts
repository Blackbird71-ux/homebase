import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { currentFyYear, fyDateRangeInTz, monthRangeInTz, quarterRangeInTz } from '@/lib/finance-fy'

// ── Helpers ──────────────────────────────────────────────────────────────

function toPeriodAmount(amount: number, frequency: string, periodMonths: number): number {
  // Used ONLY for weekly / fortnightly / monthly — frequencies that genuinely
  // recur within any given period. Lump-sum frequencies (yearly, halfyearly,
  // quarterly) must NOT be averaged; they are filtered separately.
  let timesPerMonth: number
  if (frequency === 'weekly')           timesPerMonth = 52 / 12
  else if (frequency === 'fortnightly') timesPerMonth = 26 / 12
  else                                   timesPerMonth = 1  // monthly and fallback
  return amount * timesPerMonth * periodMonths
}

/** True for frequencies that deliver a lump sum on a specific date, not every period. */
function isLumpSum(frequency: string): boolean {
  return frequency === 'yearly' || frequency === 'halfyearly' || frequency === 'quarterly'
}

/**
 * Compute period start/end using the family's IANA timezone (P2 fix #2).
 * All boundaries are UTC instants corresponding to midnight / end-of-day in
 * the family's timezone — correct regardless of the NAS system timezone.
 */
function getPeriodBounds(
  period: string,
  anchor: Date,
  fyStartMonth: number,
  tz: string,
): { start: Date; end: Date; periodMonths: number } {
  // Use the anchor date's local calendar year/month as the reference,
  // but compute the actual UTC boundaries in the family's timezone.
  const year  = anchor.getFullYear()
  const month = anchor.getMonth() + 1 // 1-based

  if (period === 'month') {
    const { start, end } = monthRangeInTz(year, month, tz)
    return { start, end, periodMonths: 1 }
  }
  if (period === 'quarter') {
    const { start, end } = quarterRangeInTz(year, month, tz)
    return { start, end, periodMonths: 3 }
  }
  // year — FY-aware using the family's timezone
  const fyYear    = currentFyYear(fyStartMonth)
  const fyOffset  = month < fyStartMonth ? 1 : 0
  const startYear = fyYear - fyOffset
  const { start, end } = fyDateRangeInTz(startYear, fyStartMonth, tz)
  return { start, end, periodMonths: 12 }
}

// ── Route ────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)

  const entityId = searchParams.get('entityId') ?? undefined
  const period = searchParams.get('period') ?? 'month'
  const anchorRaw = searchParams.get('anchor')

  const anchor = anchorRaw ? new Date(anchorRaw) : new Date()
  const familyId = session.familyId

  // Load family's financial year start month AND timezone (P2 fix #2)
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { financeYearStartMonth: true, timezone: true },
  })
  const fyStartMonth = family?.financeYearStartMonth ?? 7
  const tz = family?.timezone ?? 'Australia/Sydney'

  const { start, end, periodMonths } = getPeriodBounds(period, anchor, fyStartMonth, tz)

  const entityFilter = entityId ? { entityId } : {}

  // ── 1. Entities (for tabs) ─────────────────────────────────────────────
  const entities = await prisma.financeEntity.findMany({
    where: { familyId },
    select: { id: true, name: true, type: true, isDefault: true },
    orderBy: { name: 'asc' },
  })

  // ── 2. Bills (recurring planned expenses) ─────────────────────────────
  const bills = await prisma.financeRecurringBill.findMany({
    where: { familyId, isActive: true, ...entityFilter },
    include: {
      category: { select: { id: true, name: true, color: true, type: true } },
      payments: { select: { amount: true, paymentDate: true } },
    },
  })

  // ── 3. Income entries (recurring planned income) ──────────────────────
  const incomeEntries = await prisma.financeIncomeEntry.findMany({
    where: { familyId, isActive: true, ...entityFilter },
    include: { category: { select: { id: true, name: true, color: true } } },
  })

  // ── 4. Actual transactions within the period ──────────────────────────
  // Only cleared (settled/reconciled) transactions are recognised.
  // P2 fix #3: isCleared:true ensures pending transactions do not appear.
  // P2 fix #2: start/end are now UTC instants aligned to the family's timezone.
  const transactions = await prisma.financeTransaction.findMany({
    where: {
      familyId,
      isTransfer: false,
      isCleared: true,
      date: { gte: start, lte: end },
      type: { not: 'opening_balance' },
      ...entityFilter,
    },
    include: {
      category: { select: { id: true, name: true, color: true, type: true } },
    },
    orderBy: { date: 'desc' },
  })

  // ── 5. Journal line balances for expense / income GL accounts ─────────
  // P0 fix: posted journal entries (e.g. depreciation, accruals) now feed the P&L.
  const journalExpenseByCategory = new Map<string, { name: string; color: string | null; total: number }>()
  const journalIncomeByCategory  = new Map<string, { name: string; color: string | null; total: number }>()

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
    },
  })

  for (const line of journalLines) {
    const acct = line.glAccount
    let netAmount: number
    if (acct.type === 'expense') {
      netAmount = line.side === 'debit' ? line.amount : -line.amount
    } else {
      netAmount = line.side === 'credit' ? line.amount : -line.amount
    }

    if (acct.type === 'expense') {
      const existing = journalExpenseByCategory.get(acct.id)
      if (existing) {
        existing.total += netAmount
      } else {
        journalExpenseByCategory.set(acct.id, { name: acct.name, color: (acct as any).color ?? null, total: netAmount })
      }
    } else {
      const existing = journalIncomeByCategory.get(acct.id)
      if (existing) {
        existing.total += netAmount
      } else {
        journalIncomeByCategory.set(acct.id, { name: acct.name, color: (acct as any).color ?? null, total: netAmount })
      }
    }
  }

  const startTs = start.getTime()
  const endTs   = end.getTime()

  // ── 6. Deduplication sets (P0 fix: no double-counting) ────────────────
  const billIdWithTxInPeriod = new Set<string>()
  const txIdsInPeriod = new Set(transactions.map(t => t.id))

  for (const tx of transactions) {
    if (tx.recurringBillId) {
      billIdWithTxInPeriod.add(tx.recurringBillId)
    }
  }

  const incomeEntryIdsWithTxInPeriod = new Set<string>()
  if (txIdsInPeriod.size > 0) {
    const incomeEntriesWithTx = await prisma.financeIncomeEntry.findMany({
      where: {
        familyId,
        OR: [
          { invoiceTxId: { in: [...txIdsInPeriod] } },
          { receiptTxId: { in: [...txIdsInPeriod] } },
          { transactionId: { in: [...txIdsInPeriod] } },
        ],
      },
      select: { id: true },
    })
    for (const ie of incomeEntriesWithTx) {
      incomeEntryIdsWithTxInPeriod.add(ie.id)
    }
  }

  // ── 7. Filter income entries within period ────────────────────────────
  const relevantIncome = incomeEntries.filter(e => {
    if (!e.isActive) return false
    if (incomeEntryIdsWithTxInPeriod.has(e.id)) return false

    if (e.received && e.receivedDate) {
      const ts = new Date(e.receivedDate).getTime()
      return ts >= startTs && ts <= endTs
    }
    const dueTs = new Date(e.nextExpectedDate).getTime()
    if (e.incomeType === 'one-off' || isLumpSum(e.frequency)) {
      return dueTs >= startTs && dueTs <= endTs
    }
    return dueTs <= endTs
  })

  // ── 8. Filter bills within period ─────────────────────────────────────
  const relevantExpenses = bills.filter(b => {
    if (!b.isActive) return false
    if (b.category?.type === 'transfer' || b.category?.type === 'income') return false
    if (b.billType === 'transfer') return false
    if (billIdWithTxInPeriod.has(b.id)) return false

    if (b.paid && b.paidDate) {
      const ts = new Date(b.paidDate).getTime()
      return ts >= startTs && ts <= endTs
    }
    const dueTs = new Date(b.nextDueDate).getTime()
    if (b.billType === 'one-off' || isLumpSum(b.frequency)) {
      return dueTs >= startTs && dueTs <= endTs
    }
    return dueTs <= endTs
  })

  // ── 9. Group income ───────────────────────────────────────────────────
  const incomeMap = new Map<string, { key: string; label: string; color: string | null; totalPeriod: number; count: number; items: any[]; isJournal?: boolean }>()

  for (const e of relevantIncome) {
    const key   = e.category?.id ?? '__none__'
    const label = e.category?.name ?? 'Uncategorised'
    const color = e.category?.color ?? null
    if (!incomeMap.has(key)) incomeMap.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
    const g = incomeMap.get(key)!
    const isOneOff = e.incomeType === 'one-off' || isLumpSum(e.frequency)
    const periodAmt = isOneOff ? e.amount : toPeriodAmount(e.amount, e.frequency, periodMonths)
    g.totalPeriod += periodAmt
    g.count++
    g.items.push({
      id: e.id, name: e.name, amount: e.amount, periodAmount: periodAmt,
      isOneOff, received: e.received ?? false,
      date: e.received && e.receivedDate
        ? e.receivedDate.toISOString().split('T')[0]
        : e.nextExpectedDate.toISOString().split('T')[0],
      source: 'entry',
    })
  }

  for (const tx of transactions) {
    if (tx.type !== 'income') continue
    const key   = tx.category?.id ?? '__none__'
    const label = tx.category?.name ?? 'Uncategorised'
    const color = tx.category?.color ?? null
    if (!incomeMap.has(key)) incomeMap.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
    const g = incomeMap.get(key)!
    g.totalPeriod += tx.amount
    g.count++
    g.items.push({
      id: tx.id, name: tx.description ?? tx.payee ?? 'Income', amount: tx.amount,
      periodAmount: tx.amount, isOneOff: true, received: true,
      date: tx.date.toISOString().split('T')[0],
      source: 'transaction',
    })
  }

  for (const [catId, data] of journalIncomeByCategory) {
    if (data.total <= 0) continue
    const key = `__journal_income_${catId}__`
    if (!incomeMap.has(key)) incomeMap.set(key, { key, label: data.name, color: data.color, totalPeriod: 0, count: 0, items: [], isJournal: true })
    const g = incomeMap.get(key)!
    g.totalPeriod += data.total
    g.count++
    g.items.push({
      id: catId, name: data.name, amount: data.total, periodAmount: data.total,
      isOneOff: true, received: true, date: start.toISOString().split('T')[0], source: 'journal',
    })
  }

  // ── 10. Group expenses ────────────────────────────────────────────────
  const expenseMap = new Map<string, { key: string; label: string; color: string | null; totalPeriod: number; count: number; items: any[]; isJournal?: boolean }>()

  for (const b of relevantExpenses) {
    const key   = b.category?.id ?? '__none__'
    const label = b.category?.name ?? 'Uncategorised'
    const color = b.category?.color ?? null
    if (!expenseMap.has(key)) expenseMap.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
    const g = expenseMap.get(key)!
    const isOneOff = b.billType === 'one-off' || isLumpSum(b.frequency)
    const periodAmt = isOneOff ? b.amount : toPeriodAmount(b.amount, b.frequency, periodMonths)
    g.totalPeriod += periodAmt
    g.count++
    g.items.push({
      id: b.id, name: b.name, amount: b.amount, periodAmount: periodAmt,
      isOneOff, paid: b.paid ?? false,
      date: b.paid && b.paidDate
        ? b.paidDate.toISOString().split('T')[0]
        : b.nextDueDate.toISOString().split('T')[0],
      source: 'bill',
    })
  }

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    const key   = tx.category?.id ?? '__none__'
    const label = tx.category?.name ?? 'Uncategorised'
    const color = tx.category?.color ?? null
    if (!expenseMap.has(key)) expenseMap.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
    const g = expenseMap.get(key)!
    g.totalPeriod += tx.amount
    g.count++
    g.items.push({
      id: tx.id, name: tx.description ?? tx.payee ?? 'Expense', amount: tx.amount,
      periodAmount: tx.amount, isOneOff: true, paid: true,
      date: tx.date.toISOString().split('T')[0],
      source: 'transaction',
    })
  }

  for (const [catId, data] of journalExpenseByCategory) {
    if (data.total <= 0) continue
    const key = `__journal_expense_${catId}__`
    if (!expenseMap.has(key)) expenseMap.set(key, { key, label: data.name, color: data.color, totalPeriod: 0, count: 0, items: [], isJournal: true })
    const g = expenseMap.get(key)!
    g.totalPeriod += data.total
    g.count++
    g.items.push({
      id: catId, name: data.name, amount: data.total, periodAmount: data.total,
      isOneOff: true, paid: true, date: start.toISOString().split('T')[0], source: 'journal',
    })
  }

  // ── 11. Totals ─────────────────────────────────────────────────────────
  const incomeGroups  = Array.from(incomeMap.values()).sort((a, b) => b.totalPeriod - a.totalPeriod)
  const expenseGroups = Array.from(expenseMap.values()).sort((a, b) => b.totalPeriod - a.totalPeriod)

  const totalIncome   = incomeGroups.reduce((s, g) => s + g.totalPeriod, 0)
  const totalExpenses = expenseGroups.reduce((s, g) => s + g.totalPeriod, 0)

  let estimatedTax = 0
  for (const e of relevantIncome) {
    if (e.isTaxTracked && e.taxRate != null) {
      const isOneOff = e.incomeType === 'one-off'
      const periodAmt = isOneOff ? e.amount : toPeriodAmount(e.amount, e.frequency, periodMonths)
      estimatedTax += periodAmt * (e.taxRate / 100)
    }
  }

  const netProfit = totalIncome - totalExpenses - estimatedTax

  // ── 12. Label ─────────────────────────────────────────────────────────
  const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz })
  const label = `${fmt(start)} \u2013 ${fmt(end)}`

  return NextResponse.json({
    incomeGroups,
    expenseGroups,
    totalIncome,
    totalExpenses,
    estimatedTax,
    netProfit,
    period,
    label,
    from: start.toISOString().split('T')[0],
    to:   end.toISOString().split('T')[0],
    entities,
  })
}
