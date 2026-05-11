'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, ArrowLeft, TrendingUp, TrendingDown, DollarSign,
  ReceiptText,
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, subMonths, addMonths, subQuarters, addQuarters,
  subYears, addYears, getQuarter, getYear,
} from 'date-fns'
import { cn } from '@/lib/utils'
import { fyStartYear, fyLabel as fyLabelUtil, fyDateRange } from '@/lib/finance-fy'

// ─── Types ────────────────────────────────────────────────────────────────────

type PeriodMode = 'month' | 'quarter' | 'year'
type ViewMode   = 'cash'  | 'forecast'

interface Bill {
  id: string; name: string; amount: number; frequency: string
  nextDueDate: string; paid: boolean; paidDate: string | null
  isActive: boolean; billType: string
  entityId: string | null
  paymentTxId: string | null
  category: { id: string; name: string; color: string | null; type: string } | null
}

interface IncomeEntry {
  id: string; name: string; amount: number; frequency: string
  incomeType: string; nextExpectedDate: string; isActive: boolean
  received: boolean; receivedDate: string | null
  isTaxTracked: boolean; taxRate: number | null
  entityId: string | null
  receiptTxId: string | null
  category: { id: string; name: string; color: string | null } | null
}

interface Tx {
  id: string; amount: number; type: string; date: string
  description: string | null; payee: string | null
  isTransfer: boolean; entityId: string | null
  recurringBillId: string | null
  category: { id: string; name: string; color: string | null; type: string } | null
}

interface DrillItem {
  id: string; name: string; amount: number; periodAmount: number
  isOneOff: boolean; received?: boolean; paid?: boolean; date: string
}

interface GroupRow {
  key: string; label: string; color: string | null
  totalPeriod: number; count: number; items: DrillItem[]
}

interface Entity { id: string; name: string; type: string; isDefault: boolean; color: string | null }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPeriodAmount(amount: number, frequency: string, periodMonths: number): number {
  // Converts a recurring amount to the period equivalent — used ONLY for
  // weekly / fortnightly / monthly which genuinely recur within any period.
  // quarterly / halfyearly / yearly are lump-sum payments that land on a
  // specific date; they must NOT be averaged — they are handled separately.
  let tpm: number
  if (frequency === 'weekly')           tpm = 52 / 12
  else if (frequency === 'fortnightly') tpm = 26 / 12
  else                                   tpm = 1   // monthly and fallback
  return amount * tpm * periodMonths
}

/**
 * Returns true for frequencies where the full amount arrives as a lump sum
 * on a specific date rather than recurring within every period.
 */
function isLumpSum(frequency: string): boolean {
  return frequency === 'yearly' || frequency === 'halfyearly' || frequency === 'quarterly'
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function getPeriodBounds(mode: PeriodMode, anchor: Date, fyStartMonth: number = 7): { start: Date; end: Date; label: string } {
  if (mode === 'month')   return { start: startOfMonth(anchor),   end: endOfMonth(anchor),   label: format(anchor, 'MMMM yyyy') }
  if (mode === 'quarter') return { start: startOfQuarter(anchor), end: endOfQuarter(anchor), label: `Q${getQuarter(anchor)} ${getYear(anchor)}` }
  // FY-aware year mode
  const fYear = fyStartYear(anchor, fyStartMonth)
  const { start, end } = fyDateRange(fYear, fyStartMonth)
  return { start, end, label: fyLabelUtil(fYear, fyStartMonth) }
}

function navigateAnchor(mode: PeriodMode, anchor: Date, dir: -1 | 1): Date {
  if (mode === 'month')   return dir === -1 ? subMonths(anchor, 1)   : addMonths(anchor, 1)
  if (mode === 'quarter') return dir === -1 ? subQuarters(anchor, 1) : addQuarters(anchor, 1)
  return dir === -1 ? subYears(anchor, 1) : addYears(anchor, 1)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfitLossPage() {
  const [bills, setBills]         = useState<Bill[]>([])
  const [income, setIncome]       = useState<IncomeEntry[]>([])
  const [transactions, setTxs]    = useState<Tx[]>([])
  const [entities, setEntities]   = useState<Entity[]>([])
  const [fyStartMonth, setFyStartMonth] = useState<number>(7)
  const [selectedEntityId, setSelectedEntityId] = useState<string>('')
  const [loading, setLoading]     = useState(true)
  const [txLoading, setTxLoading] = useState(false)
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [viewMode, setViewMode]   = useState<ViewMode>('cash')
  const [anchor, setAnchor]       = useState<Date>(new Date())
  const [drillSide, setDrillSide] = useState<'income' | 'expense' | null>(null)
  const [drillKey, setDrillKey]   = useState<string | null>(null)

  const { start, end, label } = getPeriodBounds(periodMode, anchor, fyStartMonth)
  const periodMonths = periodMode === 'month' ? 1 : periodMode === 'quarter' ? 3 : 12

  // ── Load static data (bills + income + entities) once ─────────────────────
  async function loadStatic() {
    setLoading(true)
    try {
      // Load FY start month from settings
      const familyRes = await fetch('/api/settings/family')
      if (familyRes.ok) {
        const family = await familyRes.json()
        setFyStartMonth(family.financeYearStartMonth ?? 7)
      }

      const [bRes, iRes, eRes] = await Promise.all([
        fetch('/api/finance/bills?includeAll=true'),
        fetch('/api/finance/income'),
        fetch('/api/finance/entities'),
      ])
      if (bRes.ok) setBills(await bRes.json())
      if (iRes.ok) setIncome(await iRes.json())
      if (eRes.ok) setEntities(await eRes.json())
    } finally { setLoading(false) }
  }

  // ── Load transactions for the current period ──────────────────────────────
  // P2 fix #3: always request isCleared=true — only settled transactions belong
  // in a P&L. Pending/uncleared amounts are not yet recognised income or expense.
  async function loadTransactions(from: Date, to: Date) {
    setTxLoading(true)
    try {
      const params = new URLSearchParams({
        startDate:  from.toISOString().split('T')[0],
        endDate:    to.toISOString().split('T')[0],
        isCleared:  'true',
        limit:      '500',
      })
      const res = await fetch(`/api/finance/transactions?${params}`)
      if (res.ok) {
        const d = await res.json()
        setTxs((d.transactions ?? []).filter((t: Tx) => !t.isTransfer))
      }
    } finally { setTxLoading(false) }
  }

  useEffect(() => { loadStatic() }, [])
  useEffect(() => { setDrillSide(null); setDrillKey(null) }, [periodMode, anchor, viewMode, selectedEntityId])
  useEffect(() => { loadTransactions(start, end) }, [start.toISOString(), end.toISOString()])

  const startTs = start.getTime()
  const endTs   = end.getTime()

  // ── The default entity ID for the "null = personal/default" semantics ─────
  const defaultEntityId = useMemo(
    () => entities.find(en => en.isDefault)?.id ?? null,
    [entities],
  )

  /** True when the item's entity matches the current filter (or the item is unassigned and the default entity is selected). */
  function matchesEntity(itemEntityId: string | null): boolean {
    if (!selectedEntityId) return true   // "All" tab — include everything
    if (!itemEntityId) return selectedEntityId === defaultEntityId   // unassigned → only on default entity tab
    return itemEntityId === selectedEntityId
  }

  // ── Dedup: transaction IDs linked to bills/income (avoid double-counting) ──
  // When a bill is paid or income received, the PATCH endpoint creates a cleared
  // transaction. Without dedup, the P&L counts the amount twice — once from the
  // bill/income entry and once from the transaction.
  /** Set of transaction IDs that are linked to bills via recurringBillId. */
  const billLinkedTxIds = useMemo(
    () => new Set(transactions.filter(t => t.recurringBillId).map(t => t.id)),
    [transactions],
  )
  /** Set of cleared income transaction IDs that have a corresponding receiptTxId on the income entry. */
  const receiptLinkedTxIds = useMemo(
    () => new Set(transactions.filter(t => t.type === 'income').map(t => t.id)),
    [transactions],
  )

  // ── Relevant income: entries + income-type transactions ───────────────────
  const relevantIncome = useMemo(() => {
    const entryItems = income.filter(e => {
      if (!e.isActive) return false
      if (!matchesEntity(e.entityId)) return false
      // If this income entry has a receipt transaction that's already loaded,
      // skip the entry (the transaction already represents the cash inflow)
      if (e.receiptTxId && receiptLinkedTxIds.has(e.receiptTxId)) return false
      if (e.received && e.receivedDate) {
        // Confirmed received — show only in the period the money actually landed
        const ts = new Date(e.receivedDate).getTime()
        return ts >= startTs && ts <= endTs
      }
      if (viewMode === 'cash') return false
      // Forecast: one-off and lump-sum frequencies must fall within the period window
      if (e.incomeType === 'one-off' || isLumpSum(e.frequency)) {
        const dueTs = new Date(e.nextExpectedDate).getTime()
        return dueTs >= startTs && dueTs <= endTs
      }
      // Genuinely recurring (weekly / fortnightly / monthly): include if due date
      // is on or before period end (it will recur within the period)
      const dueTs = new Date(e.nextExpectedDate).getTime()
      return dueTs <= endTs
    }).map(e => ({
      key:   e.category?.id ?? '__none__',
      label: e.category?.name ?? 'Uncategorised',
      color: e.category?.color ?? null,
      item: {
        id: e.id, name: e.name, amount: e.amount,
        // Lump-sum and one-off always show the full amount — never prorate.
        // Weekly/fortnightly/monthly get their period equivalent.
        periodAmount: (e.incomeType === 'one-off' || isLumpSum(e.frequency))
          ? e.amount
          : toPeriodAmount(e.amount, e.frequency, periodMonths),
        isOneOff: e.incomeType === 'one-off' || isLumpSum(e.frequency),
        received: e.received,
        date: e.received && e.receivedDate ? e.receivedDate : e.nextExpectedDate,
      },
    }))

    // Actual income-type transactions are always cash — include in both modes
    const txItems = transactions
      .filter(t => t.type === 'income' && matchesEntity(t.entityId))
      .map(t => ({
        key:   t.category?.id ?? '__tx_none__',
        label: t.category?.name ?? 'Uncategorised',
        color: t.category?.color ?? null,
        item: {
          id: t.id,
          name: t.description ?? t.payee ?? 'Income',
          amount: t.amount, periodAmount: t.amount,
          isOneOff: true, received: true, date: t.date,
        },
      }))

    return [...entryItems, ...txItems]
  }, [income, transactions, startTs, endTs, viewMode, selectedEntityId, periodMonths, receiptLinkedTxIds])

  // ── Relevant expenses: bills + expense-type transactions ──────────────────
  const relevantExpenses = useMemo(() => {
    const billItems = bills.filter(b => {
      if (!b.isActive) return false
      if (!matchesEntity(b.entityId)) return false
      if (b.category?.type === 'transfer' || b.category?.type === 'income') return false
      if (b.billType === 'transfer') return false
      // If this bill has a payment transaction that's already loaded, skip the bill
      // (the transaction already represents the cash outflow)
      if (b.paymentTxId && billLinkedTxIds.has(b.paymentTxId)) return false
      if (b.paid && b.paidDate) {
        // Confirmed paid — show only in the period the payment actually occurred
        const ts = new Date(b.paidDate).getTime()
        return ts >= startTs && ts <= endTs
      }
      if (viewMode === 'cash') return false
      // Forecast: one-off and lump-sum frequencies must fall within the period window
      if (b.billType === 'one-off' || isLumpSum(b.frequency)) {
        const dueTs = new Date(b.nextDueDate).getTime()
        return dueTs >= startTs && dueTs <= endTs
      }
      // Genuinely recurring (weekly / fortnightly / monthly): include if due date
      // is on or before period end
      const dueTs = new Date(b.nextDueDate).getTime()
      return dueTs <= endTs
    }).map(b => ({
      key:   b.category?.id ?? '__none__',
      label: b.category?.name ?? 'Uncategorised',
      color: b.category?.color ?? null,
      item: {
        id: b.id, name: b.name, amount: b.amount,
        // Lump-sum bills always show their full amount — never prorate.
        periodAmount: (b.billType === 'one-off' || isLumpSum(b.frequency))
          ? b.amount
          : toPeriodAmount(b.amount, b.frequency, periodMonths),
        isOneOff: b.billType === 'one-off' || isLumpSum(b.frequency),
        paid: b.paid,
        date: b.paid && b.paidDate ? b.paidDate : b.nextDueDate,
      },
    }))

    // Actual expense-type transactions are always cash — include in both modes
    const txItems = transactions
      .filter(t => t.type === 'expense' && matchesEntity(t.entityId))
      .map(t => ({
        key:   t.category?.id ?? '__tx_none__',
        label: t.category?.name ?? 'Uncategorised',
        color: t.category?.color ?? null,
        item: {
          id: t.id,
          name: t.description ?? t.payee ?? 'Expense',
          amount: t.amount, periodAmount: t.amount,
          isOneOff: true, paid: true, date: t.date,
        },
      }))

    return [...billItems, ...txItems]
  }, [bills, transactions, startTs, endTs, viewMode, selectedEntityId, periodMonths, billLinkedTxIds])

  // ── Group into category rows ───────────────────────────────────────────────
  const incomeGroups = useMemo((): GroupRow[] => {
    const map = new Map<string, GroupRow>()
    for (const { key, label, color, item } of relevantIncome) {
      if (!map.has(key)) map.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
      const g = map.get(key)!
      g.totalPeriod += item.periodAmount
      g.count++
      g.items.push(item)
    }
    return Array.from(map.values()).sort((a, b) => b.totalPeriod - a.totalPeriod)
  }, [relevantIncome])

  const expenseGroups = useMemo((): GroupRow[] => {
    const map = new Map<string, GroupRow>()
    for (const { key, label, color, item } of relevantExpenses) {
      if (!map.has(key)) map.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
      const g = map.get(key)!
      g.totalPeriod += item.periodAmount
      g.count++
      g.items.push(item)
    }
    return Array.from(map.values()).sort((a, b) => b.totalPeriod - a.totalPeriod)
  }, [relevantExpenses])

  const totalIncome   = incomeGroups.reduce((s, g) => s + g.totalPeriod, 0)
  const totalExpenses = expenseGroups.reduce((s, g) => s + g.totalPeriod, 0)

  const estimatedTax = useMemo(() => {
    let total = 0
    for (const e of income) {
      if (!e.isTaxTracked || e.taxRate == null) continue
      if (!e.isActive) continue
      if (!matchesEntity(e.entityId)) continue
      if (e.received && e.receivedDate) {
        const ts = new Date(e.receivedDate).getTime()
        if (ts >= startTs && ts <= endTs) {
          // Tax on the actual amount received (never prorate)
          total += e.amount * (e.taxRate / 100)
        }
      } else if (viewMode === 'forecast') {
        const dueTs = new Date(e.nextExpectedDate).getTime()
        if (e.incomeType === 'one-off' || isLumpSum(e.frequency)) {
          // Lump-sum: tax applies if the due date falls within this period
          if (dueTs >= startTs && dueTs <= endTs) {
            total += e.amount * (e.taxRate / 100)
          }
        } else if (dueTs <= endTs) {
          // Recurring: tax on the period equivalent
          const pa = toPeriodAmount(e.amount, e.frequency, periodMonths)
          total += pa * (e.taxRate / 100)
        }
      }
    }
    return total
  }, [income, startTs, endTs, viewMode, selectedEntityId, periodMonths])

  const netProfit   = totalIncome - totalExpenses - estimatedTax
  const maxIncome   = incomeGroups[0]?.totalPeriod ?? 0
  const maxExpense  = expenseGroups[0]?.totalPeriod ?? 0

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

        <div className="flex items-center gap-1 rounded-lg border border-border p-1"
          title="Cash: confirmed transactions only. Forecast: includes upcoming scheduled items.">
          <button onClick={() => setViewMode('cash')}
            className={cn('px-3 py-1 text-xs rounded-md font-medium transition-colors',
              viewMode === 'cash' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
            Cash
          </button>
          <button onClick={() => setViewMode('forecast')}
            className={cn('px-3 py-1 text-xs rounded-md font-medium transition-colors',
              viewMode === 'forecast' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
            + Forecast
          </button>
        </div>

        {entities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setSelectedEntityId('')}
              className={cn('px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                !selectedEntityId ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              All
            </button>
            {entities.map(en => (
              <button key={en.id} onClick={() => setSelectedEntityId(en.id)}
                className={cn('px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                  selectedEntityId === en.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
                {en.name}
              </button>
            ))}
          </div>
        )}

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

        {txLoading && (
          <span className="text-xs text-muted-foreground animate-pulse">Loading transactions…</span>
        )}
      </div>

      {viewMode === 'cash' && (
        <p className="text-xs text-muted-foreground -mt-2">
          <span className="font-medium text-primary">Cash basis</span> — confirmed paid bills, received income, and actual transactions in this period.
        </p>
      )}
      {viewMode === 'forecast' && (
        <p className="text-xs text-muted-foreground -mt-2">
          <span className="font-medium text-amber-500">Forecast included</span> — confirmed items use actual dates; upcoming scheduled items use due dates. Figures may not match your bank.
        </p>
      )}

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

        {estimatedTax > 0 ? (
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <ReceiptText className="h-4 w-4 text-orange-500" /> Estimated Tax
            </div>
            <p className="text-xl font-bold text-orange-600">{fmtCurrency(estimatedTax)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">ATO estimate this {periodMode}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-3 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">No tax-tracked income</p>
          </div>
        )}

        <div className={cn('rounded-lg border p-3',
          netProfit >= 0 ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5')}>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <DollarSign className={cn('h-4 w-4', netProfit >= 0 ? 'text-green-500' : 'text-red-500')} />
            Net Profit / Loss
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
            {drillGroup.color && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: drillGroup.color }} />}
            <span className={cn('text-sm ml-auto font-medium', drillSide === 'income' ? 'text-green-600' : 'text-red-600')}>
              {fmtCurrency(drillGroup.totalPeriod)}
            </span>
          </div>
          <div className="space-y-1.5">
            {drillGroup.items.map(item => (
              <div key={item.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
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
          {/* ── Income section ────────────────────────────────────────────── */}
          <div>
            <h2 className="text-lg font-semibold text-green-600 mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Income
            </h2>
            {incomeGroups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No income for this period.
                  {viewMode === 'cash' && ' Switch to Forecast to include scheduled income.'}
                </p>
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
                        <div className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: g.color ?? '#22C55E' }} />
                        <span className="text-sm flex-1 font-medium">{g.label}</span>
                        <span className="text-xs text-muted-foreground">{g.count} item{g.count !== 1 ? 's' : ''}</span>
                        <span className="text-sm font-semibold min-w-[80px] text-right text-green-600">{fmtCurrency(g.totalPeriod)}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color ?? '#22C55E' }} />
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

          {/* ── Expenses section ──────────────────────────────────────────── */}
          <div>
            <h2 className="text-lg font-semibold text-red-600 mb-2 flex items-center gap-2">
              <TrendingDown className="h-4 w-4" /> Expenses
            </h2>
            {expenseGroups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No expenses for this period.
                  {viewMode === 'cash' && ' Switch to Forecast to include upcoming bills.'}
                </p>
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
                        <div className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: g.color ?? '#EF4444' }} />
                        <span className="text-sm flex-1 font-medium">{g.label}</span>
                        <span className="text-xs text-muted-foreground">{g.count} item{g.count !== 1 ? 's' : ''}</span>
                        <span className="text-sm font-semibold min-w-[80px] text-right text-red-600">{fmtCurrency(g.totalPeriod)}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color ?? '#EF4444' }} />
                      </div>
                    </button>
                  )
                })}
                <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                  <span className="text-muted-foreground font-medium">Total Expenses</span>
                  <span className="font-bold text-red-600">{fmtCurrency(totalExpenses)}</span>
                </div>
                {estimatedTax > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <ReceiptText className="h-3.5 w-3.5 text-orange-500" /> Estimated Tax (ATO)
                    </span>
                    <span className="font-semibold text-orange-600">{fmtCurrency(estimatedTax)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
