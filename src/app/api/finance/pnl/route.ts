import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { currentFyYear } from '@/lib/finance-fy'

// ── Helpers ──────────────────────────────────────────────────────────────

function toPeriodAmount(amount: number, frequency: string, periodMonths: number): number {
  let timesPerMonth: number
  if (frequency === 'weekly')           timesPerMonth = 52 / 12
  else if (frequency === 'fortnightly') timesPerMonth = 26 / 12
  else if (frequency === 'quarterly')   timesPerMonth = 1 / 3
  else if (frequency === 'halfyearly')  timesPerMonth = 1 / 6
  else if (frequency === 'yearly')      timesPerMonth = 1 / 12
  else                                   timesPerMonth = 1
  return amount * timesPerMonth * periodMonths
}

function getPeriodBounds(period: string, anchor: Date, fyStartMonth: number = 7): { start: Date; end: Date; periodMonths: number } {
  const year = anchor.getFullYear()
  const month = anchor.getMonth()

  if (period === 'month') {
    const start = new Date(year, month, 1)
    const end = new Date(year, month + 1, 0)
    return { start, end, periodMonths: 1 }
  }
  if (period === 'quarter') {
    const q = Math.floor(month / 3)
    const start = new Date(year, q * 3, 1)
    const end = new Date(year, q * 3 + 3, 0)
    return { start, end, periodMonths: 3 }
  }
  // year — anchor to FY start month
  const fyYear = currentFyYear(fyStartMonth)
  // If anchor is in the second half of the FY (before the start month), use previous FY year
  const fyOffset = month < (fyStartMonth - 1) ? 1 : 0
  const startYear = fyYear - fyOffset
  const start = new Date(startYear, fyStartMonth - 1, 1)
  const end = new Date(startYear + 1, fyStartMonth - 1, 0)
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

  // Load family's financial year start month setting
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { financeYearStartMonth: true },
  })
  const fyStartMonth = family?.financeYearStartMonth ?? 7

  const { start, end, periodMonths } = getPeriodBounds(period, anchor, fyStartMonth)

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
    include: { category: { select: { id: true, name: true, color: true, type: true } } },
  })

  // ── 3. Income entries (recurring planned income) ──────────────────────
  const incomeEntries = await prisma.financeIncomeEntry.findMany({
    where: { familyId, isActive: true, ...entityFilter },
    include: { category: { select: { id: true, name: true, color: true } } },
  })

  // ── 4. Actual transactions within the period ──────────────────────────
  // These are real, confirmed transactions — the source of truth for cash P&L
  const transactions = await prisma.financeTransaction.findMany({
    where: {
      familyId,
      isTransfer: false,
      date: { gte: start, lte: end },
      type: { not: 'opening_balance' },
      ...entityFilter,
    },
    include: {
      category: { select: { id: true, name: true, color: true, type: true } },
    },
    orderBy: { date: 'desc' },
  })

  const startTs = start.getTime()
  const endTs   = end.getTime()

  // ── 5. Filter income entries within period ────────────────────────────
  const relevantIncome = incomeEntries.filter(e => {
    if (!e.isActive) return false
    if (e.received && e.receivedDate) {
      const ts = new Date(e.receivedDate).getTime()
      return ts >= startTs && ts <= endTs
    }
    const dueTs = new Date(e.nextExpectedDate).getTime()
    if (e.incomeType === 'one-off') return dueTs >= startTs && dueTs <= endTs
    return dueTs <= endTs
  })

  // ── 6. Filter bills within period ─────────────────────────────────────
  const relevantExpenses = bills.filter(b => {
    if (!b.isActive) return false
    if (b.category?.type === 'transfer' || b.category?.type === 'income') return false
    if (b.billType === 'transfer') return false
    if (b.paid && b.paidDate) {
      const ts = new Date(b.paidDate).getTime()
      return ts >= startTs && ts <= endTs
    }
    const dueTs = new Date(b.nextDueDate).getTime()
    if (b.billType === 'one-off') return dueTs >= startTs && dueTs <= endTs
    return dueTs <= endTs
  })

  // ── 7. Group income: entries + income-type transactions ───────────────
  const incomeMap = new Map<string, { key: string; label: string; color: string | null; totalPeriod: number; count: number; items: any[] }>()

  // From income entries
  for (const e of relevantIncome) {
    const key   = e.category?.id ?? '__none__'
    const label = e.category?.name ?? 'Uncategorised'
    const color = e.category?.color ?? null
    if (!incomeMap.has(key)) incomeMap.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
    const g = incomeMap.get(key)!
    const isOneOff = e.incomeType === 'one-off'
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

  // From actual income-type transactions
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

  // ── 8. Group expenses: bills + expense-type transactions ──────────────
  const expenseMap = new Map<string, { key: string; label: string; color: string | null; totalPeriod: number; count: number; items: any[] }>()

  // From bills
  for (const b of relevantExpenses) {
    const key   = b.category?.id ?? '__none__'
    const label = b.category?.name ?? 'Uncategorised'
    const color = b.category?.color ?? null
    if (!expenseMap.has(key)) expenseMap.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
    const g = expenseMap.get(key)!
    const isOneOff = b.billType === 'one-off'
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

  // From actual expense-type transactions
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

  // ── 9. Totals ─────────────────────────────────────────────────────────
  const incomeGroups  = Array.from(incomeMap.values()).sort((a, b) => b.totalPeriod - a.totalPeriod)
  const expenseGroups = Array.from(expenseMap.values()).sort((a, b) => b.totalPeriod - a.totalPeriod)

  const totalIncome   = incomeGroups.reduce((s, g) => s + g.totalPeriod, 0)
  const totalExpenses = expenseGroups.reduce((s, g) => s + g.totalPeriod, 0)

  // Estimated tax from tax-tracked income entries
  let estimatedTax = 0
  for (const e of relevantIncome) {
    if (e.isTaxTracked && e.taxRate != null) {
      const isOneOff = e.incomeType === 'one-off'
      const periodAmt = isOneOff ? e.amount : toPeriodAmount(e.amount, e.frequency, periodMonths)
      estimatedTax += periodAmt * (e.taxRate / 100)
    }
  }

  const netProfit = totalIncome - totalExpenses - estimatedTax

  // ── 10. Label ─────────────────────────────────────────────────────────
  const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  const label = `${fmt(start)} – ${fmt(end)}`

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
