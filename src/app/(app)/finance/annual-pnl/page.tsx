'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, DollarSign, ReceiptText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  addMonths, startOfMonth, endOfMonth, getMonth, getYear,
} from 'date-fns'
import { fyMonthLabels, currentFyYear, fyLabel as fyLabelUtil } from '@/lib/finance-fy'

// Given a FY start year (e.g. 2025 for FY2025-26), FY start month (0-based),
// and a column index 0–11, return the calendar Date for that month
function fyColDate(fyStartYear: number, col: number, fyStartMonth: number): Date {
  const calMonth = (fyStartMonth + col) % 12
  const calYear  = fyStartMonth + col >= 12 ? fyStartYear + 1 : fyStartYear
  return new Date(calYear, calMonth, 1)
}

function fmtCurrency(n: number) {
  if (n === 0) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function fmtShort(n: number) {
  if (n === 0) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(0)}k`
  return `${sign}$${abs.toFixed(0)}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category { id: string; name: string; color: string | null; type: string }

interface Bill {
  id: string; name: string; amount: number; frequency: string
  nextDueDate: string; paid: boolean; paidDate: string | null
  isActive: boolean; billType: string; entityId: string | null
  category: Category | null
}

interface IncomeEntry {
  id: string; name: string; amount: number; frequency: string
  incomeType: string; nextExpectedDate: string; isActive: boolean
  received: boolean; receivedDate: string | null
  isTaxTracked: boolean; taxRate: number | null
  entityId: string | null; category: Category | null
}

interface Tx {
  id: string; amount: number; type: string; date: string
  description: string | null; payee: string | null
  isTransfer: boolean; entityId: string | null; category: Category | null
}

interface Entity { id: string; name: string; type: string; isDefault: boolean }

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPeriodAmount(amount: number, frequency: string): number {
  // Return monthly equivalent
  if (frequency === 'weekly')       return amount * 52 / 12
  if (frequency === 'fortnightly')  return amount * 26 / 12
  if (frequency === 'quarterly')    return amount / 3
  if (frequency === 'halfyearly')   return amount / 6
  if (frequency === 'yearly')       return amount / 12
  return amount // monthly default
}

function isInMonth(dateStr: string, colDate: Date): boolean {
  const d = new Date(dateStr)
  return getMonth(d) === getMonth(colDate) && getYear(d) === getYear(colDate)
}

// ── Row types for the table ───────────────────────────────────────────────────

interface TableRow {
  key: string
  label: string
  color: string | null
  side: 'income' | 'expense'
  monthly: number[]   // [0..11] monthly amounts
  total: number
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnnualPnLPage() {
  const [bills, setBills]       = useState<Bill[]>([])
  const [income, setIncome]     = useState<IncomeEntry[]>([])
  const [transactions, setTxs]  = useState<Tx[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [selectedEntityId, setSelectedEntityId] = useState<string>('')
  const [fyStartMonth, setFyStartMonth] = useState<number>(7) // default July
  const [fyStartYear, setFyStartYear]   = useState<number>(() => currentFyYear(7))
  const [loading, setLoading]   = useState(true)
  const [txLoading, setTxLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'cash' | 'forecast'>('forecast')

  const fyMonthLabelsArr = useMemo(() => fyMonthLabels(fyStartMonth), [fyStartMonth])

  // Build array of 12 month start Dates for the selected FY
  const fyMonths = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => fyColDate(fyStartYear, i, fyStartMonth)),
    [fyStartYear, fyStartMonth])

  const fyFrom = fyMonths[0]
  const fyTo   = endOfMonth(fyMonths[11])

  // ── Load static data ──────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        // Load FY start month from settings
        const familyRes = await fetch('/api/settings/family')
        if (familyRes.ok) {
          const family = await familyRes.json()
          const fsm = family.financeYearStartMonth ?? 7
          setFyStartMonth(fsm)
          setFyStartYear(currentFyYear(fsm))
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
    load()
  }, [])

  // ── Load transactions for the full FY ────────────────────────────────────
  useEffect(() => {
    async function loadTxs() {
      setTxLoading(true)
      try {
        const params = new URLSearchParams({
          startDate: fyFrom.toISOString().split('T')[0],
          endDate:   fyTo.toISOString().split('T')[0],
          limit:     '2000',
        })
        if (selectedEntityId) params.set('entityId', selectedEntityId)
        const res = await fetch(`/api/finance/transactions?${params}`)
        if (res.ok) {
          const d = await res.json()
          setTxs((d.transactions ?? []).filter((t: Tx) => !t.isTransfer))
        }
      } finally { setTxLoading(false) }
    }
    loadTxs()
  }, [fyStartYear, selectedEntityId])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build income rows ─────────────────────────────────────────────────────
  const incomeRows = useMemo((): TableRow[] => {
    const map = new Map<string, TableRow>()

    function getRow(key: string, label: string, color: string | null): TableRow {
      if (!map.has(key)) map.set(key, { key, label, color, side: 'income', monthly: Array(12).fill(0), total: 0 })
      return map.get(key)!
    }

    // From income entries
    for (const e of income) {
      if (!e.isActive) continue
      if (selectedEntityId && e.entityId !== selectedEntityId) continue
      const key   = e.category?.id ?? '__none__'
      const label = e.category?.name ?? 'Uncategorised'
      const color = e.category?.color ?? null
      const row   = getRow(key, label, color)

      if (e.received && e.receivedDate) {
        // Slot by actual received date
        for (let col = 0; col < 12; col++) {
          if (isInMonth(e.receivedDate, fyMonths[col])) {
            row.monthly[col] += e.amount
          }
        }
      } else if (viewMode === 'forecast') {
        // Distribute recurring income across months based on expected cadence
        if (e.incomeType === 'one-off') {
          // One-off: slot to expected month if in FY
          for (let col = 0; col < 12; col++) {
            if (isInMonth(e.nextExpectedDate, fyMonths[col])) {
              row.monthly[col] += e.amount
            }
          }
        } else {
          // Recurring: spread monthly equivalent across all 12 months
          const monthlyAmt = toPeriodAmount(e.amount, e.frequency)
          for (let col = 0; col < 12; col++) {
            row.monthly[col] += monthlyAmt
          }
        }
      }
    }

    // From actual income-type transactions (always show)
    for (const tx of transactions) {
      if (tx.type !== 'income') continue
      if (selectedEntityId && tx.entityId !== selectedEntityId) continue
      const key   = tx.category?.id ?? '__tx_none__'
      const label = tx.category?.name ?? 'Uncategorised'
      const color = tx.category?.color ?? null
      const row   = getRow(key, label, color)
      for (let col = 0; col < 12; col++) {
        if (isInMonth(tx.date, fyMonths[col])) {
          row.monthly[col] += tx.amount
        }
      }
    }

    for (const row of map.values()) {
      row.total = row.monthly.reduce((s, v) => s + v, 0)
    }
    return Array.from(map.values()).filter(r => r.total > 0).sort((a, b) => b.total - a.total)
  }, [income, transactions, fyMonths, viewMode, selectedEntityId])

  // ── Build expense rows ────────────────────────────────────────────────────
  const expenseRows = useMemo((): TableRow[] => {
    const map = new Map<string, TableRow>()

    function getRow(key: string, label: string, color: string | null): TableRow {
      if (!map.has(key)) map.set(key, { key, label, color, side: 'expense', monthly: Array(12).fill(0), total: 0 })
      return map.get(key)!
    }

    // From bills
    for (const b of bills) {
      if (!b.isActive) continue
      if (selectedEntityId && b.entityId !== selectedEntityId) continue
      if (b.category?.type === 'transfer' || b.category?.type === 'income') continue
      if (b.billType === 'transfer') continue

      const key   = b.category?.id ?? '__none__'
      const label = b.category?.name ?? 'Uncategorised'
      const color = b.category?.color ?? null
      const row   = getRow(key, label, color)

      if (b.paid && b.paidDate) {
        for (let col = 0; col < 12; col++) {
          if (isInMonth(b.paidDate, fyMonths[col])) {
            row.monthly[col] += b.amount
          }
        }
      } else if (viewMode === 'forecast') {
        if (b.billType === 'one-off') {
          for (let col = 0; col < 12; col++) {
            if (isInMonth(b.nextDueDate, fyMonths[col])) {
              row.monthly[col] += b.amount
            }
          }
        } else {
          const monthlyAmt = toPeriodAmount(b.amount, b.frequency)
          for (let col = 0; col < 12; col++) {
            row.monthly[col] += monthlyAmt
          }
        }
      }
    }

    // From actual expense-type transactions (always show)
    for (const tx of transactions) {
      if (tx.type !== 'expense') continue
      if (selectedEntityId && tx.entityId !== selectedEntityId) continue
      const key   = tx.category?.id ?? '__tx_none__'
      const label = tx.category?.name ?? 'Uncategorised'
      const color = tx.category?.color ?? null
      const row   = getRow(key, label, color)
      for (let col = 0; col < 12; col++) {
        if (isInMonth(tx.date, fyMonths[col])) {
          row.monthly[col] += tx.amount
        }
      }
    }

    for (const row of map.values()) {
      row.total = row.monthly.reduce((s, v) => s + v, 0)
    }
    return Array.from(map.values()).filter(r => r.total > 0).sort((a, b) => b.total - a.total)
  }, [bills, transactions, fyMonths, viewMode, selectedEntityId])

  // ── Totals ────────────────────────────────────────────────────────────────
  const monthlyIncome   = useMemo(() => Array.from({ length: 12 }, (_, i) => incomeRows.reduce((s, r) => s + r.monthly[i], 0)), [incomeRows])
  const monthlyExpenses = useMemo(() => Array.from({ length: 12 }, (_, i) => expenseRows.reduce((s, r) => s + r.monthly[i], 0)), [expenseRows])
  const monthlyNet      = useMemo(() => Array.from({ length: 12 }, (_, i) => monthlyIncome[i] - monthlyExpenses[i]), [monthlyIncome, monthlyExpenses])

  const totalIncome   = incomeRows.reduce((s, r) => s + r.total, 0)
  const totalExpenses = expenseRows.reduce((s, r) => s + r.total, 0)
  const totalNet      = totalIncome - totalExpenses

  // Current month column (highlight today)
  const now = new Date()
  const currentCol = fyMonths.findIndex(m => getMonth(m) === getMonth(now) && getYear(m) === getYear(now))

  if (loading) return <div className="p-4 text-muted-foreground">Loading annual P&L…</div>

  return (
    <div className="space-y-4">

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* FY navigator */}
        <div className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
          <button onClick={() => setFyStartYear(y => y - 1)} className="p-1 hover:bg-accent rounded text-muted-foreground">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold px-2 min-w-[90px] text-center">{fyLabelUtil(fyStartYear, fyStartMonth)}</span>
          <button onClick={() => setFyStartYear(y => y + 1)} className="p-1 hover:bg-accent rounded text-muted-foreground">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Cash / Forecast */}
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
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

        {/* Entity filter */}
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

        {txLoading && <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>}
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-green-500" /> Total Income
          </div>
          <p className="text-2xl font-bold text-green-600">{fmtCurrency(totalIncome)}</p>
        </div>
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" /> Total Expenses
          </div>
          <p className="text-2xl font-bold text-red-600">{fmtCurrency(totalExpenses)}</p>
        </div>
        <div className={cn('rounded-lg border p-3',
          totalNet >= 0 ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5')}>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <DollarSign className={cn('h-3.5 w-3.5', totalNet >= 0 ? 'text-green-500' : 'text-red-500')} />
            Net {totalNet >= 0 ? 'Profit' : 'Loss'}
          </div>
          <p className={cn('text-2xl font-bold', totalNet >= 0 ? 'text-green-600' : 'text-red-600')}>
            {fmtCurrency(totalNet)}
          </p>
        </div>
      </div>

      {/* ── Main table ────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[180px] sticky left-0 bg-muted/40 z-10">
                Category
              </th>
              {fyMonthLabelsArr.map((m, i) => (
                <th key={i} className={cn(
                  'text-right px-2 py-2 font-medium text-muted-foreground w-[70px]',
                  i === currentCol && 'text-primary',
                )}>
                  {m}
                </th>
              ))}
              <th className="text-right px-3 py-2 font-semibold w-[80px]">Total</th>
            </tr>
          </thead>
          <tbody>

            {/* ── INCOME ──────────────────────────────────────────────────── */}
            <tr className="border-b border-border bg-green-500/5">
              <td colSpan={14} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-green-600 sticky left-0 bg-green-500/5">
                Income
              </td>
            </tr>

            {incomeRows.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No income data for this period.
                  {viewMode === 'cash' && ' Switch to Forecast to include scheduled income.'}
                </td>
              </tr>
            ) : incomeRows.map(row => (
              <tr key={row.key} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                <td className="px-3 py-1.5 sticky left-0 bg-background z-10 hover:bg-accent/30">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color ?? '#22C55E' }} />
                    <span className="truncate text-xs font-medium">{row.label}</span>
                  </div>
                </td>
                {row.monthly.map((v, i) => (
                  <td key={i} className={cn(
                    'text-right px-2 py-1.5 tabular-nums text-xs',
                    v > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground/40',
                    i === currentCol && 'bg-primary/5',
                  )}>
                    {fmtShort(v)}
                  </td>
                ))}
                <td className="text-right px-3 py-1.5 tabular-nums text-xs font-semibold text-green-600 dark:text-green-400">
                  {fmtCurrency(row.total)}
                </td>
              </tr>
            ))}

            {/* Income totals */}
            <tr className="border-b-2 border-border bg-green-500/5 font-semibold">
              <td className="px-3 py-2 text-xs font-bold text-green-700 dark:text-green-400 sticky left-0 bg-green-500/5 z-10">
                Total Income
              </td>
              {monthlyIncome.map((v, i) => (
                <td key={i} className={cn(
                  'text-right px-2 py-2 tabular-nums text-xs font-bold text-green-600 dark:text-green-400',
                  i === currentCol && 'bg-primary/5',
                )}>
                  {fmtShort(v)}
                </td>
              ))}
              <td className="text-right px-3 py-2 tabular-nums text-xs font-bold text-green-600 dark:text-green-400">
                {fmtCurrency(totalIncome)}
              </td>
            </tr>

            {/* ── EXPENSES ────────────────────────────────────────────────── */}
            <tr className="border-b border-border bg-red-500/5">
              <td colSpan={14} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-red-600 sticky left-0 bg-red-500/5">
                Expenses
              </td>
            </tr>

            {expenseRows.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No expense data for this period.
                  {viewMode === 'cash' && ' Switch to Forecast to include upcoming bills.'}
                </td>
              </tr>
            ) : expenseRows.map(row => (
              <tr key={row.key} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                <td className="px-3 py-1.5 sticky left-0 bg-background z-10 hover:bg-accent/30">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color ?? '#EF4444' }} />
                    <span className="truncate text-xs font-medium">{row.label}</span>
                  </div>
                </td>
                {row.monthly.map((v, i) => (
                  <td key={i} className={cn(
                    'text-right px-2 py-1.5 tabular-nums text-xs',
                    v > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground/40',
                    i === currentCol && 'bg-primary/5',
                  )}>
                    {fmtShort(v)}
                  </td>
                ))}
                <td className="text-right px-3 py-1.5 tabular-nums text-xs font-semibold text-red-600 dark:text-red-400">
                  {fmtCurrency(row.total)}
                </td>
              </tr>
            ))}

            {/* Expense totals */}
            <tr className="border-b-2 border-border bg-red-500/5 font-semibold">
              <td className="px-3 py-2 text-xs font-bold text-red-700 dark:text-red-400 sticky left-0 bg-red-500/5 z-10">
                Total Expenses
              </td>
              {monthlyExpenses.map((v, i) => (
                <td key={i} className={cn(
                  'text-right px-2 py-2 tabular-nums text-xs font-bold text-red-600 dark:text-red-400',
                  i === currentCol && 'bg-primary/5',
                )}>
                  {fmtShort(v)}
                </td>
              ))}
              <td className="text-right px-3 py-2 tabular-nums text-xs font-bold text-red-600 dark:text-red-400">
                {fmtCurrency(totalExpenses)}
              </td>
            </tr>

            {/* ── NET ROW ──────────────────────────────────────────────────── */}
            <tr className="bg-muted/60">
              <td className="px-3 py-2.5 text-sm font-bold sticky left-0 bg-muted/60 z-10">
                NET
              </td>
              {monthlyNet.map((v, i) => (
                <td key={i} className={cn(
                  'text-right px-2 py-2.5 tabular-nums text-xs font-bold',
                  v > 0 ? 'text-green-600 dark:text-green-400' : v < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
                  i === currentCol && 'bg-primary/10',
                )}>
                  {fmtShort(v)}
                </td>
              ))}
              <td className={cn(
                'text-right px-3 py-2.5 tabular-nums text-sm font-bold',
                totalNet > 0 ? 'text-green-600 dark:text-green-400' : totalNet < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground',
              )}>
                {fmtCurrency(totalNet)}
              </td>
            </tr>

          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {viewMode === 'cash'
          ? 'Cash basis — confirmed paid bills, received income, and actual transactions only. Future months will be empty until items are confirmed.'
          : 'Forecast — recurring bills and income spread evenly across months at their monthly equivalent. Actual transactions always show where available.'}
      </p>
    </div>
  )
}
