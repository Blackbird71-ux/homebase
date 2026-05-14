'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import {
  ChevronLeft, ChevronRight, ArrowLeft, TrendingUp, TrendingDown, DollarSign,
  ReceiptText, List, X,
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, subMonths, addMonths, subQuarters, addQuarters,
  subYears, addYears, getQuarter, getYear,
} from 'date-fns'
import { cn } from '@/lib/utils'
import { fyStartYear, fyLabel as fyLabelUtil, fyDateRange } from '@/lib/finance-fy'
import { PrintButton } from '@/components/print/PrintButton'
import { PrintWrapper } from '@/components/print/PrintWrapper'

// ─── Types ────────────────────────────────────────────────────────────────────

type PeriodMode = 'month' | 'quarter' | 'year'
type ViewMode = 'accrual'  | 'forecast'

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
  invoiceTxId: string | null
  transactionId: string | null
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
  source?: string
}

interface GroupRow {
  key: string; label: string; color: string | null
  totalPeriod: number; count: number; items: DrillItem[]
}

interface Entity { id: string; name: string; type: string; isDefault: boolean; color: string | null }

// Journal line group: income or expense GL accounts from posted journal entries
interface JournalGroup {
  glAccountId: string
  name: string
  type: string   // 'income' | 'expense'
  totalDebit: number
  totalCredit: number
  entityId?: string | null
}

// ─── Ledger modal types ───────────────────────────────────────────────────────

interface LedgerTx {
  id: string; date: string; description: string | null; payee: string | null
  amount: number; type: string; isCleared: boolean
  category: { name: string } | null
  account: { name: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPeriodAmount(amount: number, frequency: string, periodMonths: number): number {
  let tpm: number
  if (frequency === 'weekly')           tpm = 52 / 12
  else if (frequency === 'fortnightly') tpm = 26 / 12
  else                                   tpm = 1
  return amount * tpm * periodMonths
}

function isLumpSum(frequency: string): boolean {
  return frequency === 'yearly' || frequency === 'halfyearly' || frequency === 'quarterly'
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function getPeriodBounds(mode: PeriodMode, anchor: Date, fyStartMonth: number = 7): { start: Date; end: Date; label: string } {
  if (mode === 'month')   return { start: startOfMonth(anchor),   end: endOfMonth(anchor),   label: format(anchor, 'MMMM yyyy') }
  if (mode === 'quarter') return { start: startOfQuarter(anchor), end: endOfQuarter(anchor), label: `Q${getQuarter(anchor)} ${getYear(anchor)}` }
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
  const [journalGroups, setJournalGroups] = useState<JournalGroup[]>([])
  const [entities, setEntities]   = useState<Entity[]>([])
  const [fyStartMonth, setFyStartMonth] = useState<number>(7)
  const [selectedEntityId, setSelectedEntityId] = useState<string>('')
  const [loading, setLoading]     = useState(true)
  const [txLoading, setTxLoading] = useState(false)
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [viewMode, setViewMode]   = useState<ViewMode>('accrual')
  const [anchor, setAnchor]       = useState<Date>(new Date())
  const [drillSide, setDrillSide] = useState<'income' | 'expense' | null>(null)
  const [drillKey, setDrillKey]   = useState<string | null>(null)

  // Ledger panel state
  const [ledgerOpen, setLedgerOpen]   = useState(false)
  const [ledgerLabel, setLedgerLabel] = useState('')
  const [ledgerTxs, setLedgerTxs]    = useState<LedgerTx[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)

  const printRef = useRef<HTMLDivElement>(null)

  const { start, end, label } = getPeriodBounds(periodMode, anchor, fyStartMonth)
  const periodMonths = periodMode === 'month' ? 1 : periodMode === 'quarter' ? 3 : 12

  async function loadStatic() {
    setLoading(true)
    try {
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

  async function loadTransactions(from: Date, to: Date) {
    setTxLoading(true)
    try {
      const params = new URLSearchParams({
        startDate: from.toISOString().split('T')[0],
        endDate:   to.toISOString().split('T')[0],
        isCleared: 'true',
        limit:     '200',
      })
      const res = await fetch(`/api/finance/transactions?${params}`)
      if (res.ok) {
        const d = await res.json()
        setTxs((d.transactions ?? []).filter((t: Tx) => !t.isTransfer))
      }
    } finally { setTxLoading(false) }
  }

  async function loadJournalGroups(from: Date, to: Date, entityId?: string) {
    try {
      const params = new URLSearchParams({
        from: from.toISOString().split('T')[0],
        to:   to.toISOString().split('T')[0],
      })
      if (entityId) params.set('entityId', entityId)
      const res = await fetch(`/api/finance/trial-balance?${params}`)
      if (res.ok) {
        const d = await res.json()
        // Keep only income and expense GL accounts with non-zero net movement
        const groups: JournalGroup[] = (d.accounts ?? [])
          .filter((a: any) => a.type === 'income' || a.type === 'expense')
          .map((a: any) => ({
            glAccountId: a.id,
            name: a.name,
            type: a.type,
            totalDebit: a.totalDebit,
            totalCredit: a.totalCredit,
            entityId: null,
          }))
        setJournalGroups(groups)
      }
    } catch { /* non-fatal */ }
  }

  useEffect(() => { loadStatic() }, [])
  useEffect(() => { setDrillSide(null); setDrillKey(null) }, [periodMode, anchor, viewMode, selectedEntityId])
  useEffect(() => {
    loadTransactions(start, end)
    loadJournalGroups(start, end, selectedEntityId || undefined)
  }, [start.toISOString(), end.toISOString(), selectedEntityId])

  const startTs = start.getTime()
  const endTs   = end.getTime()

  const defaultEntityId = useMemo(
    () => entities.find(en => en.isDefault)?.id ?? null,
    [entities],
  )

  function matchesEntity(itemEntityId: string | null): boolean {
    if (!selectedEntityId) return true
    if (!itemEntityId) return selectedEntityId === defaultEntityId
    return itemEntityId === selectedEntityId
  }

  // ── FIXED dedup logic ───────────────────────────────────────────────────────
  // P&L double-count fix: only exclude a transaction if it was specifically
  // created by the bill/income PATCH flow (i.e. it has recurringBillId set,
  // OR it matches the receiptTxId/invoiceTxId on an income entry).
  //
  // OLD (BROKEN): excluded ALL income-type transactions — this incorrectly
  // removed standalone QuickAdd income entries.
  //
  // NEW (CORRECT): only exclude transactions that are already represented by
  // a bill/income entry in the P&L (via recurringBillId or receipt linkage).
  
  const billLinkedTxIds = useMemo(
    () => new Set(transactions.filter(t => t.recurringBillId).map(t => t.id)),
    [transactions],
  )

  // Transactions that are linked to income entries via receiptTxId, invoiceTxId, or transactionId (legacy)
  // This prevents double-counting when income is marked received and a transaction is created.
  const incomeLinkedTxIds = useMemo(() => {
    const linked = new Set<string>()
    for (const entry of income) {
      if (entry.receiptTxId) linked.add(entry.receiptTxId)
      if (entry.invoiceTxId) linked.add(entry.invoiceTxId)
      if (entry.transactionId) linked.add(entry.transactionId)
    }
    return linked
  }, [income])

  // GL account IDs that are covered by journal lines for this period.
  // Also build a set of income entry IDs that have a journalEntryId linked —
  // those entries are represented by the journal pathway, not the entries pathway.
  const journalIncomeGlIds = useMemo(
    () => new Set(journalGroups.filter(g => g.type === 'income').map(g => g.glAccountId)),
    [journalGroups],
  )

  // Income entry IDs that have a linked journal entry — suppress from entries pathway
  // regardless of category matching to avoid any double-count.
  const incomeEntriesWithJournal = useMemo(
    () => new Set(income.filter((e: any) => e.journalEntryId).map(e => e.id)),
    [income],
  )

  // ── Relevant income ────────────────────────────────────────────────────────
  const relevantIncome = useMemo(() => {
    // Income entries: skip if a linked receipt/invoice tx is already in the period
    // (the tx will be counted in the txItems below)
    const entryItems = income.filter(e => {
      if (!e.isActive) return false
      if (!matchesEntity(e.entityId)) return false
      // Skip if this entry's receipt/invoice/legacy transaction already appears in this period's transactions
      if (e.receiptTxId && transactions.some(t => t.id === e.receiptTxId)) return false
      if (e.invoiceTxId && transactions.some(t => t.id === e.invoiceTxId)) return false
      if (e.transactionId && transactions.some(t => t.id === e.transactionId)) return false
      // Skip entries that have a linked journal entry — they appear via the journal
      // lines pathway (journalItems) to avoid double-counting.
      if (incomeEntriesWithJournal.has(e.id)) return false
      if (e.received && e.receivedDate) {
        const ts = new Date(e.receivedDate).getTime()
        return ts >= startTs && ts <= endTs
      }
      if (viewMode === 'accrual') return false
      if (e.incomeType === 'one-off' || isLumpSum(e.frequency)) {
        const dueTs = new Date(e.nextExpectedDate).getTime()
        return dueTs >= startTs && dueTs <= endTs
      }
      const dueTs = new Date(e.nextExpectedDate).getTime()
      return dueTs <= endTs
    }).map(e => ({
      key:   e.category?.id ?? '__none__',
      label: e.category?.name ?? 'Uncategorised',
      color: e.category?.color ?? null,
      item: {
        id: e.id, name: e.name, amount: e.amount,
        periodAmount: (e.incomeType === 'one-off' || isLumpSum(e.frequency))
          ? e.amount
          : toPeriodAmount(e.amount, e.frequency, periodMonths),
        isOneOff: e.incomeType === 'one-off' || isLumpSum(e.frequency),
        received: e.received,
        date: e.received && e.receivedDate ? e.receivedDate : e.nextExpectedDate,
        source: 'entry',
      },
    }))

    // Actual income-type transactions: exclude any that are already linked to
    // income entries (avoiding double-count) but include standalone ones (QuickAdd)
    const txItems = transactions
      .filter(t => t.type === 'income' && matchesEntity(t.entityId) && !incomeLinkedTxIds.has(t.id))
      .map(t => ({
        key:   t.category?.id ?? '__tx_none__',
        label: t.category?.name ?? 'Uncategorised',
        color: t.category?.color ?? null,
        item: {
          id: t.id,
          name: t.description ?? t.payee ?? 'Income',
          amount: t.amount, periodAmount: t.amount,
          isOneOff: true, received: true, date: t.date,
          source: 'transaction',
        },
      }))

    // Journal line income items: posted journal entries with income-type GL accounts.
    // These represent accrual income recognised via double-entry (e.g. DR AR / CR income).
    // Net income for each GL account = total credits minus total debits (normal balance for income).
    const journalItems = journalGroups
      .filter(g => g.type === 'income' && (g.totalCredit - g.totalDebit) > 0.005)
      .map(g => ({
        key:   g.glAccountId,
        label: g.name,
        color: null as string | null,
        item: {
          id: g.glAccountId,
          name: g.name,
          amount: g.totalCredit - g.totalDebit,
          periodAmount: g.totalCredit - g.totalDebit,
          isOneOff: true,
          received: true,
          date: start.toISOString(),
          source: 'journal',
        },
      }))

    return [...entryItems, ...txItems, ...journalItems]
  }, [income, transactions, journalGroups, journalIncomeGlIds, incomeEntriesWithJournal, startTs, endTs, start, viewMode, selectedEntityId, periodMonths, incomeLinkedTxIds])

  // ── Relevant expenses ──────────────────────────────────────────────────────
  const relevantExpenses = useMemo(() => {
    const billItems = bills.filter(b => {
      if (!b.isActive) return false
      if (!matchesEntity(b.entityId)) return false
      if (b.category?.type === 'transfer' || b.category?.type === 'income') return false
      if (b.billType === 'transfer') return false
      // Skip bill if a linked transaction is already in the period tx list
      if (b.paymentTxId && billLinkedTxIds.has(b.paymentTxId)) return false
      if (b.paid && b.paidDate) {
        const ts = new Date(b.paidDate).getTime()
        return ts >= startTs && ts <= endTs
      }
      if (viewMode === 'accrual') return false
      if (b.billType === 'one-off' || isLumpSum(b.frequency)) {
        const dueTs = new Date(b.nextDueDate).getTime()
        return dueTs >= startTs && dueTs <= endTs
      }
      const dueTs = new Date(b.nextDueDate).getTime()
      return dueTs <= endTs
    }).map(b => ({
      key:   b.category?.id ?? '__none__',
      label: b.category?.name ?? 'Uncategorised',
      color: b.category?.color ?? null,
      item: {
        id: b.id, name: b.name, amount: b.amount,
        periodAmount: (b.billType === 'one-off' || isLumpSum(b.frequency))
          ? b.amount
          : toPeriodAmount(b.amount, b.frequency, periodMonths),
        isOneOff: b.billType === 'one-off' || isLumpSum(b.frequency),
        paid: b.paid,
        date: b.paid && b.paidDate ? b.paidDate : b.nextDueDate,
        source: 'bill',
      },
    }))

    // Expense transactions: exclude those linked via recurringBillId (already in bill entries)
    const txItems = transactions
      .filter(t => t.type === 'expense' && matchesEntity(t.entityId) && !billLinkedTxIds.has(t.id))
      .map(t => ({
        key:   t.category?.id ?? '__tx_none__',
        label: t.category?.name ?? 'Uncategorised',
        color: t.category?.color ?? null,
        item: {
          id: t.id,
          name: t.description ?? t.payee ?? 'Expense',
          amount: t.amount, periodAmount: t.amount,
          isOneOff: true, paid: true, date: t.date,
          source: 'transaction',
        },
      }))

    // Journal line expense items: posted journal entries with expense-type GL accounts.
    // Net expense = total debits minus total credits (normal balance for expense).
    const journalExpenseGlIds = new Set(journalGroups.filter(g => g.type === 'expense').map(g => g.glAccountId))
    const journalExpItems = journalGroups
      .filter(g => g.type === 'expense' && (g.totalDebit - g.totalCredit) > 0.005)
      .map(g => ({
        key:   g.glAccountId,
        label: g.name,
        color: null as string | null,
        item: {
          id: g.glAccountId,
          name: g.name,
          amount: g.totalDebit - g.totalCredit,
          periodAmount: g.totalDebit - g.totalCredit,
          isOneOff: true, paid: true,
          date: start.toISOString(),
          source: 'journal',
        },
      }))
    // Suppress bill entries whose category is covered by a journal expense line
    const filteredBillItems = billItems.filter(b => !b.item.id || !journalExpenseGlIds.has(b.key))

    return [...filteredBillItems, ...txItems, ...journalExpItems]
  }, [bills, transactions, journalGroups, startTs, endTs, start, viewMode, selectedEntityId, periodMonths, billLinkedTxIds])

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
          total += e.amount * (e.taxRate / 100)
        }
      } else if (viewMode === 'forecast') {
        const dueTs = new Date(e.nextExpectedDate).getTime()
        if (e.incomeType === 'one-off' || isLumpSum(e.frequency)) {
          if (dueTs >= startTs && dueTs <= endTs) {
            total += e.amount * (e.taxRate / 100)
          }
        } else if (dueTs <= endTs) {
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

  // ── Ledger: load transactions for a category in this period ───────────────
  async function openLedger(categoryId: string, categoryLabel: string) {
    setLedgerLabel(categoryLabel)
    setLedgerOpen(true)
    setLedgerLoading(true)
    setLedgerTxs([])
    try {
      const params = new URLSearchParams({
        startDate:  start.toISOString().split('T')[0],
        endDate:    end.toISOString().split('T')[0],
        isCleared:  'true',
        limit:      '200',
      })
      // If it's a real category ID (not a __none__ key), filter by it
      if (!categoryId.startsWith('__')) {
        params.set('categoryId', categoryId)
      }
      const res = await fetch(`/api/finance/transactions?${params}`)
      if (res.ok) {
        const d = await res.json()
        setLedgerTxs((d.transactions ?? []).filter((t: any) => !t.isTransfer))
      }
    } finally { setLedgerLoading(false) }
  }

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

        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          <button onClick={() => setViewMode('accrual')}
            className={cn('px-3 py-1 text-xs rounded-md font-medium transition-colors',
              viewMode === 'accrual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
            Accrual
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

        {txLoading && <span className="text-xs text-muted-foreground animate-pulse">Loading transactions…</span>}
        <div className="ml-auto" data-print-hide>
          <PrintButton
            printRef={printRef}
            reportTitle="Profit & Loss"
            dateRange={label}
            disabled={loading}
          />
        </div>
      </div>

      {viewMode === 'accrual' && (
        <p className="text-xs text-muted-foreground -mt-2">
          <span className="font-medium text-primary">Accrual basis</span> — income and expenses recognised when invoiced or received, regardless of when cash is exchanged.
        </p>
      )}
      {viewMode === 'forecast' && (
        <p className="text-xs text-muted-foreground -mt-2">
          <span className="font-medium text-amber-500">Forecast</span> — recognised items use actual dates; upcoming scheduled items use estimated dates.
        </p>
      )}

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      {/* ── Printable region ───────────────────────────────────────────────── */}
      <PrintWrapper
        ref={printRef}
        reportTitle="Profit & Loss"
        dateRange={label}
        meta={`Income: ${fmtCurrency(totalIncome)} · Expenses: ${fmtCurrency(totalExpenses)} · Net: ${fmtCurrency(netProfit)}`}
      >

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

      {/* ── Ledger panel ──────────────────────────────────────────────────── */}
      {ledgerOpen && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <List className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Ledger — {ledgerLabel}</span>
              <span className="text-xs text-muted-foreground">({start ? format(start, 'd MMM') : ''} – {end ? format(end, 'd MMM yyyy') : ''})</span>
            </div>
            <button onClick={() => setLedgerOpen(false)} className="p-1 hover:bg-accent rounded text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          {ledgerLoading ? (
            <p className="text-xs text-muted-foreground">Loading transactions…</p>
          ) : ledgerTxs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No cleared transactions found in this period for this category.</p>
          ) : (
            <div className="space-y-1.5">
              {ledgerTxs.map(t => (
                <div key={t.id} className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">{format(new Date(t.date), 'd MMM yyyy')}</span>
                  <span className="flex-1 min-w-0 truncate">{t.description ?? t.payee ?? 'Transaction'}</span>
                  {t.category && <span className="text-xs text-muted-foreground shrink-0">{t.category.name}</span>}
                  {t.account  && <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{t.account.name}</span>}
                  <span className={cn('font-semibold shrink-0 tabular-nums',
                    t.type === 'income' ? 'text-green-600' : 'text-red-600')}>
                    {t.type === 'income' ? '+' : '-'}{fmtCurrency(t.amount)}
                  </span>
                </div>
              ))}
              <div className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                {ledgerTxs.length} transaction{ledgerTxs.length !== 1 ? 's' : ''} · Total:{' '}
                <span className="font-medium text-foreground">
                  {fmtCurrency(ledgerTxs.reduce((s, t) => t.type === 'income' ? s + t.amount : s - t.amount, 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

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
            {/* Ledger button — only for real category IDs (not __none__ virtual keys) */}
            {!drillKey?.startsWith('__') && (
              <button
                onClick={() => openLedger(drillKey!, drillGroup.label)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary border border-border rounded-md px-2 py-1 ml-2"
                title="View all transactions for this category"
              >
                <List className="h-3 w-3" /> Ledger
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {drillGroup.items.map(item => (
              <div key={item.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{item.name}</span>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {item.isOneOff && <span className="text-orange-500 mr-2">One-off</span>}
                    {item.source === 'transaction' && <span className="text-blue-500 mr-2">Transaction</span>}
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
          {/* ── Income section ─────────────────────────────────────────────── */}
          <div>
            <h2 className="text-lg font-semibold text-green-600 mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Income
            </h2>
            {incomeGroups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No income for this period.
                  {viewMode === 'accrual' && ' Switch to Forecast to include scheduled income.'}
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
                    <div key={g.key} className="group">
                      <button onClick={() => { setDrillSide('income'); setDrillKey(g.key) }}
                        className="w-full text-left hover:bg-accent/50 rounded-md p-1.5 -mx-1.5 transition-colors">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color ?? '#22C55E' }} />
                          <span className="text-sm flex-1 font-medium">{g.label}</span>
                          <span className="text-xs text-muted-foreground">{g.count} item{g.count !== 1 ? 's' : ''}</span>
                          <span className="text-sm font-semibold min-w-[80px] text-right text-green-600">{fmtCurrency(g.totalPeriod)}</span>
                          {/* Ledger button for real categories */}
                          {!g.key.startsWith('__') && (
                            <button
                              onClick={e => { e.stopPropagation(); openLedger(g.key, g.label) }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded text-muted-foreground transition-opacity"
                              title="View ledger"
                            >
                              <List className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color ?? '#22C55E' }} />
                        </div>
                      </button>
                    </div>
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
                  {viewMode === 'accrual' && ' Switch to Forecast to include upcoming bills.'}
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
                    <div key={g.key} className="group">
                      <button onClick={() => { setDrillSide('expense'); setDrillKey(g.key) }}
                        className="w-full text-left hover:bg-accent/50 rounded-md p-1.5 -mx-1.5 transition-colors">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color ?? '#EF4444' }} />
                          <span className="text-sm flex-1 font-medium">{g.label}</span>
                          <span className="text-xs text-muted-foreground">{g.count} item{g.count !== 1 ? 's' : ''}</span>
                          <span className="text-sm font-semibold min-w-[80px] text-right text-red-600">{fmtCurrency(g.totalPeriod)}</span>
                          {!g.key.startsWith('__') && (
                            <button
                              onClick={e => { e.stopPropagation(); openLedger(g.key, g.label) }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded text-muted-foreground transition-opacity"
                              title="View ledger"
                            >
                              <List className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color ?? '#EF4444' }} />
                        </div>
                      </button>
                    </div>
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

      {/* ── End printable region ──────────────────────────────────────────── */}
      </PrintWrapper>
    </div>
  )
}
