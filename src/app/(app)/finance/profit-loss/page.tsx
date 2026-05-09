'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, ArrowLeft, TrendingUp, TrendingDown, DollarSign,
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, subMonths, addMonths, subQuarters, addQuarters,
  subYears, addYears, getQuarter, getYear,
} from 'date-fns'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type PeriodMode = 'month' | 'quarter' | 'year'

interface Bill {
  id: string; name: string; amount: number; frequency: string
  nextDueDate: string; paid: boolean; paidDate: string | null
  isActive: boolean; billType: string
  category: { id: string; name: string; color: string | null } | null
}

interface IncomeEntry {
  id: string; name: string; amount: number; frequency: string
  incomeType: string
  nextExpectedDate: string; isActive: boolean
  received: boolean; receivedDate: string | null
  category: { id: string; name: string; color: string | null } | null
}

interface DrillItem {
  id: string; name: string; amount: number; periodAmount: number
  isOneOff: boolean; received?: boolean; paid?: boolean
  date: string
}

interface GroupRow {
  key: string; label: string; color: string | null
  totalPeriod: number; count: number; items: DrillItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPeriodAmount(amount: number, frequency: string, periodMonths: number): number {
  let timesPerMonth: number
  if (frequency === 'weekly')           timesPerMonth = 52 / 12
  else if (frequency === 'fortnightly') timesPerMonth = 26 / 12
  else if (frequency === 'quarterly')   timesPerMonth = 1 / 3
  else if (frequency === 'yearly')      timesPerMonth = 1 / 12
  else                                   timesPerMonth = 1
  return amount * timesPerMonth * periodMonths
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function getPeriodBounds(mode: PeriodMode, anchor: Date): { start: Date; end: Date; label: string } {
  if (mode === 'month') {
    return { start: startOfMonth(anchor), end: endOfMonth(anchor), label: format(anchor, 'MMMM yyyy') }
  }
  if (mode === 'quarter') {
    return { start: startOfQuarter(anchor), end: endOfQuarter(anchor), label: `Q${getQuarter(anchor)} ${getYear(anchor)}` }
  }
  return { start: startOfYear(anchor), end: endOfYear(anchor), label: `${getYear(anchor)}` }
}

function navigateAnchor(mode: PeriodMode, anchor: Date, dir: -1 | 1): Date {
  if (mode === 'month')   return dir === -1 ? subMonths(anchor, 1)   : addMonths(anchor, 1)
  if (mode === 'quarter') return dir === -1 ? subQuarters(anchor, 1) : addQuarters(anchor, 1)
  return dir === -1 ? subYears(anchor, 1) : addYears(anchor, 1)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfitLossPage() {
  const [bills, setBills]           = useState<Bill[]>([])
  const [incomeEntries, setIncome]  = useState<IncomeEntry[]>([])
  const [loading, setLoading]       = useState(true)
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [anchor, setAnchor]         = useState<Date>(new Date())
  const [drillSide, setDrillSide]   = useState<'income' | 'expense' | null>(null)
  const [drillKey, setDrillKey]     = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [billsRes, incomeRes] = await Promise.all([
        fetch('/api/finance/bills?includeAll=true'),
        fetch('/api/finance/income'),
      ])
      if (billsRes.ok) setBills(await billsRes.json())
      if (incomeRes.ok) setIncome(await incomeRes.json())
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // Reset drill when period changes
  useEffect(() => { setDrillSide(null); setDrillKey(null) }, [periodMode, anchor])

  const { start, end, label } = getPeriodBounds(periodMode, anchor)
  const periodMonths = periodMode === 'month' ? 1 : periodMode === 'quarter' ? 3 : 12

  // ── Filter income entries within this period ──────────────────────────────
  // Cash-basis: received entries use receivedDate; pending use nextExpectedDate.
  const relevantIncome = useMemo(() => {
    const startTs = start.getTime()
    const endTs   = end.getTime()
    return incomeEntries.filter(e => {
      if (!e.isActive) return false
      // For received income, slot by the actual date money arrived
      if (e.received && e.receivedDate) {
        const ts = new Date(e.receivedDate).getTime()
        return ts >= startTs && ts <= endTs
      }
      // For pending income, slot by expected date (forward-looking forecast)
      const dueTs = new Date(e.nextExpectedDate).getTime()
      if (e.incomeType === 'one-off') return dueTs >= startTs && dueTs <= endTs
      return dueTs <= endTs
    })
  }, [incomeEntries, start, end])

  // ── Filter bills within this period ───────────────────────────────────────
  // Cash-basis: paid bills use paidDate; unpaid use nextDueDate.
  // Exclude transfers and income-category items
  const relevantExpenses = useMemo(() => {
    const startTs = start.getTime()
    const endTs   = end.getTime()
    return bills.filter(b => {
      if (!b.isActive) return false
      // Exclude transfers and income-type category
      if ((b.category as any)?.type === 'transfer' || (b.category as any)?.type === 'income') return false
      if (b.billType === 'transfer') return false
      // For paid bills, slot by actual payment date
      if (b.paid && b.paidDate) {
        const ts = new Date(b.paidDate).getTime()
        return ts >= startTs && ts <= endTs
      }
      // For unpaid bills, slot by due date (forward-looking forecast)
      const dueTs = new Date(b.nextDueDate).getTime()
      if (b.billType === 'one-off') return dueTs >= startTs && dueTs <= endTs
      return dueTs <= endTs
    })
  }, [bills, start, end])

  // ── Group income by category ──────────────────────────────────────────────
  const incomeGroups = useMemo((): GroupRow[] => {
    const map = new Map<string, GroupRow>()
    for (const e of relevantIncome) {
      const key   = e.category?.id ?? '__none__'
      const label = e.category?.name ?? 'Uncategorised'
      const color = e.category?.color ?? null
      if (!map.has(key)) map.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
      const g = map.get(key)!
      const isOneOff = e.incomeType === 'one-off'
      const periodAmt = isOneOff ? e.amount : toPeriodAmount(e.amount, e.frequency, periodMonths)
      g.totalPeriod += periodAmt
      g.count++
      g.items.push({ id: e.id, name: e.name, amount: e.amount, periodAmount: periodAmt, isOneOff, received: e.received, date: e.received && e.receivedDate ? e.receivedDate : e.nextExpectedDate })
    }
    return Array.from(map.values()).sort((a, b) => b.totalPeriod - a.totalPeriod)
  }, [relevantIncome, periodMonths])

  // ── Group expenses by category ────────────────────────────────────────────
  const expenseGroups = useMemo((): GroupRow[] => {
    const map = new Map<string, GroupRow>()
    for (const b of relevantExpenses) {
      const key   = b.category?.id ?? '__none__'
      const label = b.category?.name ?? 'Uncategorised'
      const color = b.category?.color ?? null
      if (!map.has(key)) map.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
      const g = map.get(key)!
      const isOneOff = b.billType === 'one-off'
      const periodAmt = isOneOff ? b.amount : toPeriodAmount(b.amount, b.frequency, periodMonths)
      g.totalPeriod += periodAmt
      g.count++
      g.items.push({ id: b.id, name: b.name, amount: b.amount, periodAmount: periodAmt, isOneOff, paid: b.paid, date: b.paid && b.paidDate ? b.paidDate : b.nextDueDate })
    }
    return Array.from(map.values()).sort((a, b) => b.totalPeriod - a.totalPeriod)
  }, [relevantExpenses, periodMonths])

  const totalIncome   = incomeGroups.reduce((s, g) => s + g.totalPeriod, 0)
  const totalExpenses = expenseGroups.reduce((s, g) => s + g.totalPeriod, 0)
  const netProfit     = totalIncome - totalExpenses

  const maxIncome   = incomeGroups.length  > 0 ? incomeGroups[0].totalPeriod  : 0
  const maxExpense  = expenseGroups.length > 0 ? expenseGroups[0].totalPeriod : 0

  const drillGroup = drillSide === 'income' && drillKey
    ? incomeGroups.find(g => g.key === drillKey)
    : drillSide === 'expense' && drillKey
    ? expenseGroups.find(g => g.key === drillKey)
    : null

  if (loading) return <div className="p-4 text-muted-foreground">Loading profit & loss…</div>

  return (
    <div className="space-y-5">
      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          {(['month', 'quarter', 'year'] as const).map(p => (
            <button key={p} onClick={() => setPeriodMode(p)}
              className={cn('px-3 py-1 text-xs rounded-md font-medium transition-colors capitalize',
                periodMode === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {p === 'month' ? 'Month' : p === 'quarter' ? 'Quarter' : 'Year'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
          <button onClick={() => setAnchor(a => navigateAnchor(periodMode, a, -1))}
            className="p-1 hover:bg-accent rounded text-muted-foreground">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium px-1 min-w-[100px] text-center">{label}</span>
          <button onClick={() => setAnchor(a => navigateAnchor(periodMode, a, 1))}
            className="p-1 hover:bg-accent rounded text-muted-foreground">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4 text-green-500" /> Total Income
          </div>
          <p className="text-xl font-bold text-green-600">{fmtCurrency(totalIncome)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{incomeGroups.length} categor{incomeGroups.length !== 1 ? 'ies' : 'y'}</p>
        </div>

        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingDown className="h-4 w-4 text-red-500" /> Total Expenses
          </div>
          <p className="text-xl font-bold text-red-600">{fmtCurrency(totalExpenses)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{expenseGroups.length} categor{expenseGroups.length !== 1 ? 'ies' : 'y'}</p>
        </div>

        <div className={cn('rounded-lg border p-3',
          netProfit >= 0 ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5')}>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <DollarSign className={cn('h-4 w-4', netProfit >= 0 ? 'text-green-500' : 'text-red-500')} /> Net Profit / Loss
          </div>
          <p className={cn('text-xl font-bold', netProfit >= 0 ? 'text-green-600' : 'text-red-600')}>
            {fmtCurrency(netProfit)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {netProfit >= 0 ? 'Profit' : 'Loss'} this {periodMode}
          </p>
        </div>
      </div>

      {/* ── Drill-down panel ──────────────────────────────────────────────── */}
      {drillGroup ? (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => { setDrillSide(null); setDrillKey(null) }}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="font-semibold text-sm">{drillGroup.label}</span>
            {drillGroup.color && (
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: drillGroup.color }} />
            )}
            <span className={cn('text-sm ml-auto font-medium',
              drillSide === 'income' ? 'text-green-600' : 'text-red-600')}>
              {fmtCurrency(drillGroup.totalPeriod)}
            </span>
          </div>
          <div className="space-y-1.5">
            {drillGroup.items.map(item => (
              <div key={item.id}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{item.name}</span>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {item.isOneOff && <span className="text-orange-500 mr-2">One-off</span>}
                    {item.paid !== undefined && (
                      <span className={cn('mr-2', item.paid ? 'text-green-500' : 'text-amber-500')}>
                        {item.paid ? 'Paid' : 'Due'}
                      </span>
                    )}
                    {item.received !== undefined && (
                      <span className={cn('mr-2', item.received ? 'text-green-500' : 'text-amber-500')}>
                        {item.received ? 'Received' : 'Expected'}
                      </span>
                    )}
                    {format(new Date(item.date), 'd MMM yyyy')}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{fmtCurrency(item.amount)}</p>
                  {!item.isOneOff && item.periodAmount !== item.amount && (
                    <p className="text-xs text-muted-foreground">{fmtCurrency(item.periodAmount)} this {periodMode}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ── Income section ──────────────────────────────────────────────── */}
          <div>
            <h2 className="text-lg font-semibold text-green-600 mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Income
            </h2>
            {incomeGroups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">No income for this period.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pb-1 border-b border-border">
                  <span>Category</span>
                  <span>This {periodMode === 'month' ? 'month' : periodMode === 'quarter' ? 'quarter' : 'year'}</span>
                </div>
                {incomeGroups.map(g => {
                  const pct = maxIncome > 0 ? (g.totalPeriod / maxIncome) * 100 : 0
                  return (
                    <button key={g.key} onClick={() => { setDrillSide('income'); setDrillKey(g.key) }}
                      className="w-full text-left hover:bg-accent/50 rounded-md p-1.5 -mx-1.5 transition-colors group">
                      <div className="flex items-center gap-2 mb-1.5">
                        {g.color
                          ? <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                          : <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 shrink-0" />}
                        <span className="text-sm flex-1 font-medium">{g.label}</span>
                        <span className="text-xs text-muted-foreground">{g.count} entr{g.count !== 1 ? 'ies' : 'y'}</span>
                        <span className="text-sm font-semibold min-w-[80px] text-right text-green-600">{fmtCurrency(g.totalPeriod)}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: g.color ?? '#22C55E' }} />
                      </div>
                    </button>
                  )
                })}
                <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                  <span className="text-muted-foreground font-medium">Total Income</span>
                  <span className="font-bold text-green-600">{fmtCurrency(totalIncome)}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Expenses section ────────────────────────────────────────────── */}
          <div>
            <h2 className="text-lg font-semibold text-red-600 mb-2 flex items-center gap-2">
              <TrendingDown className="h-4 w-4" /> Expenses
            </h2>
            {expenseGroups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">No expenses for this period.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pb-1 border-b border-border">
                  <span>Category</span>
                  <span>This {periodMode === 'month' ? 'month' : periodMode === 'quarter' ? 'quarter' : 'year'}</span>
                </div>
                {expenseGroups.map(g => {
                  const pct = maxExpense > 0 ? (g.totalPeriod / maxExpense) * 100 : 0
                  return (
                    <button key={g.key} onClick={() => { setDrillSide('expense'); setDrillKey(g.key) }}
                      className="w-full text-left hover:bg-accent/50 rounded-md p-1.5 -mx-1.5 transition-colors group">
                      <div className="flex items-center gap-2 mb-1.5">
                        {g.color
                          ? <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                          : <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 shrink-0" />}
                        <span className="text-sm flex-1 font-medium">{g.label}</span>
                        <span className="text-xs text-muted-foreground">{g.count} bill{g.count !== 1 ? 's' : ''}</span>
                        <span className="text-sm font-semibold min-w-[80px] text-right text-red-600">{fmtCurrency(g.totalPeriod)}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: g.color ?? '#EF4444' }} />
                      </div>
                    </button>
                  )
                })}
                <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                  <span className="text-muted-foreground font-medium">Total Expenses</span>
                  <span className="font-bold text-red-600">{fmtCurrency(totalExpenses)}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
