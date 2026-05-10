import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

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

function getPeriodBounds(period: string, anchor: Date): { start: Date; end: Date; periodMonths: number } {
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
  // year
  const start = new Date(year, 0, 1)
  const end = new Date(year, 11, 31)
  return { start, end, periodMonths: 12 }
}

// ── Types ────────────────────────────────────────────────────────────────

interface DrillItem {
  id: string
  name: string
  amount: number
  periodAmount: number
  isOneOff: boolean
  paid?: boolean
  received?: boolean
  date: string
}

interface GroupRow {
  key: string
  label: string
  color: string | null
  totalPeriod: number
  count: number
  items: DrillItem[]
}

interface PnLResponse {
  incomeGroups: GroupRow[]
  expenseGroups: GroupRow[]
  totalIncome: number
  totalExpenses: number
  estimatedTax: number
  netProfit: number
  period: string
  label: string
  from: string
  to: string
  entities: { id: string; name: string; type: string; isDefault: boolean }[]
}

// ── Route ────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)

  const entityId = searchParams.get('entityId') ?? undefined
  const period = searchParams.get('period') ?? 'month'
  const anchorRaw = searchParams.get('anchor') // ISO date string

  const anchor = anchorRaw ? new Date(anchorRaw) : new Date()
  const { start, end, periodMonths } = getPeriodBounds(period, anchor)

  // ── 1. Fetch entities ──────────────────────────────────────────────────
  const entities = await prisma.financeEntity.findMany({
    where: { familyId: session.familyId },
    select: { id: true, name: true, type: true, isDefault: true },
    orderBy: { name: 'asc' },
  })

  // ── 2. Build entity filter ────────────────────────────────────────────
  const entityFilter = entityId ? { entityId } : {}

  // ── 3. Fetch bills ────────────────────────────────────────────────────
  const bills = await prisma.financeRecurringBill.findMany({
    where: {
      familyId: session.familyId,
      isActive: true,
      ...entityFilter,
    },
    include: {
      category: { select: { id: true, name: true, color: true, type: true } },
    },
  })

  // ── 4. Fetch income entries ───────────────────────────────────────────
  const incomeEntries = await prisma.financeIncomeEntry.findMany({
    where: {
      familyId: session.familyId,
      isActive: true,
      ...entityFilter,
    },
    include: {
      category: { select: { id: true, name: true, color: true } },
    },
  })

  // ── 5. Filter income entries within period ────────────────────────────
  const startTs = start.getTime()
  const endTs = end.getTime()

  const relevantIncome = incomeEntries.filter(e => {
    if (!e.isActive) return false
    // Received income — slot by received date
    if (e.received && e.receivedDate) {
      const ts = new Date(e.receivedDate).getTime()
      return ts >= startTs && ts <= endTs
    }
    // Pending income — slot by expected date
    const dueTs = new Date(e.nextExpectedDate).getTime()
    if (e.incomeType === 'one-off') return dueTs >= startTs && dueTs <= endTs
    return dueTs <= endTs
  })

  // ── 6. Group income by category ───────────────────────────────────────
  const incomeMap = new Map<string, GroupRow>()
  for (const e of relevantIncome) {
    const key = e.category?.id ?? '__none__'
    const label = e.category?.name ?? 'Uncategorised'
    const color = e.category?.color ?? null
    if (!incomeMap.has(key)) incomeMap.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
    const g = incomeMap.get(key)!
    const isOneOff = e.incomeType === 'one-off'
    const periodAmt = isOneOff ? e.amount : toPeriodAmount(e.amount, e.frequency, periodMonths)
    g.totalPeriod += periodAmt
    g.count++
    g.items.push({
      id: e.id,
      name: e.name,
      amount: e.amount,
      periodAmount: periodAmt,
      isOneOff,
      received: e.received ?? false,
      date: e.received && e.receivedDate ? e.receivedDate.toISOString().split('T')[0] : e.nextExpectedDate.toISOString().split('T')[0],
    })
  }

  // ── 7. Filter bills within period ─────────────────────────────────────
  const relevantExpenses = bills.filter(b => {
    if (!b.isActive) return false
    // Exclude transfers and income-type category
    if (b.category?.type === 'transfer' || b.category?.type === 'income') return false
    if (b.billType === 'transfer') return false
    // Paid bills — slot by paid date
    if (b.paid && b.paidDate) {
      const ts = new Date(b.paidDate).getTime()
      return ts >= startTs && ts <= endTs
    }
    // Unpaid bills — slot by due date
    const dueTs = new Date(b.nextDueDate).getTime()
    if (b.billType === 'one-off') return dueTs >= startTs && dueTs <= endTs
    return dueTs <= endTs
  })

  // ── 8. Group expenses by category ─────────────────────────────────────
  const expenseMap = new Map<string, GroupRow>()
  for (const b of relevantExpenses) {
    const key = b.category?.id ?? '__none__'
    const label = b.category?.name ?? 'Uncategorised'
    const color = b.category?.color ?? null
    if (!expenseMap.has(key)) expenseMap.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
    const g = expenseMap.get(key)!
    const isOneOff = b.billType === 'one-off'
    const periodAmt = isOneOff ? b.amount : toPeriodAmount(b.amount, b.frequency, periodMonths)
    g.totalPeriod += periodAmt
    g.count++
    g.items.push({
      id: b.id,
      name: b.name,
      amount: b.amount,
      periodAmount: periodAmt,
      isOneOff,
      paid: b.paid ?? false,
      date: b.paid && b.paidDate ? b.paidDate.toISOString().split('T')[0] : b.nextDueDate.toISOString().split('T')[0],
    })
  }

  // ── 9. Calculate totals ──────────────────────────────────────────────
  const incomeGroups = Array.from(incomeMap.values()).sort((a, b) => b.totalPeriod - a.totalPeriod)
  const expenseGroups = Array.from(expenseMap.values()).sort((a, b) => b.totalPeriod - a.totalPeriod)

  const totalIncome = incomeGroups.reduce((s, g) => s + g.totalPeriod, 0)
  const totalExpenses = expenseGroups.reduce((s, g) => s + g.totalPeriod, 0)

  // Estimated tax — sum of tax-tracked income * taxRate
  let estimatedTax = 0
  for (const e of relevantIncome) {
    if (e.isTaxTracked && e.taxRate != null) {
      const isOneOff = e.incomeType === 'one-off'
      const periodAmt = isOneOff ? e.amount : toPeriodAmount(e.amount, e.frequency, periodMonths)
      estimatedTax += periodAmt * (e.taxRate / 100)
    }
  }

  const netProfit = totalIncome - totalExpenses - estimatedTax

  // ── 10. Build label ──────────────────────────────────────────────────
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
    to: end.toISOString().split('T')[0],
    entities,
  } satisfies PnLResponse)
}
