'use client'

import { useEffect, useState, useMemo } from 'react'
import { type PeriodMode, toPeriodAmount, isLumpSum, getPeriodBounds, navigateAnchor, localYmd } from '@/lib/finance-period'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ViewMode = 'accrual' | 'forecast'

export interface PLBill {
  id: string; name: string; amount: number; frequency: string
  nextDueDate: string; paid: boolean; paidDate: string | null
  isActive: boolean; billType: string
  entityId: string | null
  paymentTxId: string | null
  category: { id: string; name: string; color: string | null; type: string } | null
}

export interface PLIncomeEntry {
  id: string; name: string; amount: number; frequency: string
  incomeType: string; nextExpectedDate: string; isActive: boolean
  received: boolean; receivedDate: string | null
  isTaxTracked: boolean; taxRate: number | null
  entityId: string | null
  receiptTxId: string | null
  invoiceTxId: string | null
  transactionId: string | null
  journalEntryId?: string | null
  category: { id: string; name: string; color: string | null } | null
}

export interface PLTx {
  id: string; amount: number; type: string; date: string
  description: string | null; payee: string | null
  isTransfer: boolean; entityId: string | null
  recurringBillId: string | null
  hasPostedPnlJournal?: boolean
  category: { id: string; name: string; color: string | null; type: string } | null
}

export interface PLDrillItem {
  id: string; name: string; amount: number; periodAmount: number
  isOneOff: boolean; received?: boolean; paid?: boolean; date: string
  source?: string
}

export interface PLGroupRow {
  key: string; label: string; color: string | null
  totalPeriod: number; count: number; items: PLDrillItem[]
}

export interface PLEntity {
  id: string; name: string; type: string; isDefault: boolean; color: string | null
}

export interface PLJournalGroup {
  glAccountId: string
  name: string
  type: string
  totalDebit: number
  totalCredit: number
  entityId?: string | null
}

export interface PLLedgerTx {
  id: string; date: string; description: string | null; payee: string | null
  amount: number; type: string; isCleared: boolean
  category: { name: string } | null
  account: { name: string } | null
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useProfitLoss() {
  const [bills, setBills]               = useState<PLBill[]>([])
  const [income, setIncome]             = useState<PLIncomeEntry[]>([])
  const [transactions, setTxs]          = useState<PLTx[]>([])
  const [journalGroups, setJournalGroups] = useState<PLJournalGroup[]>([])
  const [entities, setEntities]         = useState<PLEntity[]>([])
  const [fyStartMonth, setFyStartMonth] = useState<number>(7)
  const [selectedEntityId, setSelectedEntityId] = useState<string>('')
  const [loading, setLoading]           = useState(true)
  const [txLoading, setTxLoading]       = useState(false)
  const [periodMode, setPeriodMode]     = useState<PeriodMode>('month')
  const [viewMode, setViewMode]         = useState<ViewMode>('accrual')
  const [anchor, setAnchor]             = useState<Date>(new Date())
  const [drillSide, setDrillSide]       = useState<'income' | 'expense' | null>(null)
  const [drillKey, setDrillKey]         = useState<string | null>(null)

  // Ledger panel state
  const [ledgerOpen, setLedgerOpen]       = useState(false)
  const [ledgerLabel, setLedgerLabel]     = useState('')
  const [ledgerTxs, setLedgerTxs]         = useState<PLLedgerTx[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)

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
        startDate: localYmd(from),
        endDate:   localYmd(to),
        isCleared: 'true',
        limit:     '200',
      })
      const res = await fetch(`/api/finance/transactions?${params}`)
      if (res.ok) {
        const d = await res.json()
        setTxs((d.transactions ?? []).filter((t: PLTx) => !t.isTransfer))
      }
    } finally { setTxLoading(false) }
  }

  async function loadJournalGroups(from: Date, to: Date, entityId?: string) {
    try {
      const params = new URLSearchParams({
        from: localYmd(from),
        to:   localYmd(to),
      })
      if (entityId) params.set('entityId', entityId)
      const res = await fetch(`/api/finance/trial-balance?${params}`)
      if (res.ok) {
        const d = await res.json()
        const groups: PLJournalGroup[] = (d.accounts ?? [])
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const billLinkedTxIds = useMemo(
    () => new Set(transactions.filter(t => t.recurringBillId).map(t => t.id)),
    [transactions],
  )

  const incomeLinkedTxIds = useMemo(() => {
    const linked = new Set<string>()
    for (const entry of income) {
      if (entry.receiptTxId) linked.add(entry.receiptTxId)
      if (entry.invoiceTxId) linked.add(entry.invoiceTxId)
      if (entry.transactionId) linked.add(entry.transactionId)
    }
    return linked
  }, [income])

  const journalIncomeGlIds = useMemo(
    () => new Set(journalGroups.filter(g => g.type === 'income').map(g => g.glAccountId)),
    [journalGroups],
  )

  const incomeEntriesWithJournal = useMemo(
    () => new Set(income.filter((e: any) => e.journalEntryId).map(e => e.id)),
    [income],
  )

  const relevantIncome = useMemo(() => {
    const entryItems = income.filter(e => {
      if (!e.isActive) return false
      if (!matchesEntity(e.entityId)) return false
      if (e.receiptTxId && transactions.some(t => t.id === e.receiptTxId)) return false
      if (e.invoiceTxId && transactions.some(t => t.id === e.invoiceTxId)) return false
      if (e.transactionId && transactions.some(t => t.id === e.transactionId)) return false
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

    const txItems = transactions
      .filter(t => t.type === 'income' && matchesEntity(t.entityId) && !incomeLinkedTxIds.has(t.id) && !t.hasPostedPnlJournal)
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

  const relevantExpenses = useMemo(() => {
    const billItems = bills.filter(b => {
      if (!b.isActive) return false
      if (!matchesEntity(b.entityId)) return false
      if (b.category?.type === 'transfer' || b.category?.type === 'income') return false
      if (b.billType === 'transfer') return false
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

    const txItems = transactions
      .filter(t => t.type === 'expense' && matchesEntity(t.entityId) && !billLinkedTxIds.has(t.id) && !t.hasPostedPnlJournal)
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
    const filteredBillItems = billItems.filter(b => !journalExpenseGlIds.has(b.key))

    return [...filteredBillItems, ...txItems, ...journalExpItems]
  }, [bills, transactions, journalGroups, startTs, endTs, start, viewMode, selectedEntityId, periodMonths, billLinkedTxIds])

  const incomeGroups = useMemo((): PLGroupRow[] => {
    const map = new Map<string, PLGroupRow>()
    for (const { key, label, color, item } of relevantIncome) {
      if (!map.has(key)) map.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
      const g = map.get(key)!
      g.totalPeriod += item.periodAmount
      g.count++
      g.items.push(item)
    }
    return Array.from(map.values()).sort((a, b) => b.totalPeriod - a.totalPeriod)
  }, [relevantIncome])

  const expenseGroups = useMemo((): PLGroupRow[] => {
    const map = new Map<string, PLGroupRow>()
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

  const netProfit  = totalIncome - totalExpenses - estimatedTax
  const maxIncome  = incomeGroups[0]?.totalPeriod ?? 0
  const maxExpense = expenseGroups[0]?.totalPeriod ?? 0

  const drillGroup = drillSide === 'income' && drillKey
    ? incomeGroups.find(g => g.key === drillKey)
    : drillSide === 'expense' && drillKey
    ? expenseGroups.find(g => g.key === drillKey)
    : null

  async function openLedger(categoryId: string, categoryLabel: string) {
    setLedgerLabel(categoryLabel)
    setLedgerOpen(true)
    setLedgerLoading(true)
    setLedgerTxs([])
    try {
      const params = new URLSearchParams({
        startDate: localYmd(start),
        endDate:   localYmd(end),
        isCleared: 'true',
        limit:     '200',
      })
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

  return {
    // State
    loading, txLoading,
    periodMode, setPeriodMode,
    viewMode, setViewMode,
    anchor, setAnchor,
    selectedEntityId, setSelectedEntityId,
    entities,
    // Period derived
    start, end, label, periodMonths,
    // Computed P&L data
    incomeGroups, expenseGroups,
    totalIncome, totalExpenses,
    estimatedTax, netProfit,
    maxIncome, maxExpense,
    // Drill
    drillSide, setDrillSide,
    drillKey, setDrillKey,
    drillGroup,
    // Ledger panel
    ledgerOpen, setLedgerOpen,
    ledgerLabel, ledgerTxs, ledgerLoading,
    openLedger,
    // Navigation helper (re-exported so page doesn't need the finance-period import)
    navigateAnchor,
  }
}
