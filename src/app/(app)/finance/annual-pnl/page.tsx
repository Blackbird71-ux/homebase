'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  format, startOfMonth, endOfMonth, getMonth, getYear,
} from 'date-fns'
import { PageHero } from '@/components/shared/PageHero'
import { fyMonthLabels, currentFyYear, fyLabel as fyLabelUtil } from '@/lib/finance-fy'
import { PrintButton } from '@/components/print/PrintButton'
import { PrintWrapper } from '@/components/print/PrintWrapper'
import { ExcelButton } from '@/components/print/ExcelButton'
import * as XLSX from 'xlsx'
import {
  buildCoverSheet, headerStyle, headerLeftStyle, sectionStyle,
  totalStyle, totalLabelStyle, grandTotalStyle, grandTotalLabelStyle,
  dataStyle, dataLabelStyle, positiveStyle, negativeStyle,
  setCols, freeze, styleRow, sc,
} from '@/lib/excelStyles'

// Given a FY start year (e.g. 2025 for FY2025-26), FY start month (0-based),
// and a column index 0–11, return the calendar Date for that month
function fyColDate(fyStartYear: number, col: number, fyStartMonth: number): Date {
  const calMonth = (fyStartMonth + col) % 12
  const calYear  = fyStartMonth + col >= 12 ? fyStartYear + 1 : fyStartYear
  return new Date(calYear, calMonth, 1)
}

function fmtCurrency(n: number) {
  if (n === 0) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
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

interface Entity { id: string; name: string; type: string; isDefault: boolean }

// ── Helpers ───────────────────────────────────────────────────────────────────

function toPeriodAmount(amount: number, frequency: string): number {
  if (frequency === 'weekly')       return amount * 52 / 12
  if (frequency === 'fortnightly')  return amount * 26 / 12
  return amount
}

function isLumpSumFrequency(frequency: string): boolean {
  return frequency === 'yearly' || frequency === 'halfyearly' || frequency === 'quarterly'
}

function lumpSumColumns(frequency: string, baseDate: Date, fyMonths: Date[]): number[] {
  const baseMonth = baseDate.getMonth()
  const baseYear  = baseDate.getFullYear()
  const cols: number[] = []
  for (let col = 0; col < 12; col++) {
    const colM = fyMonths[col].getMonth()
    const colY = fyMonths[col].getFullYear()
    if (frequency === 'yearly') {
      if (colM === baseMonth) cols.push(col)
    } else if (frequency === 'halfyearly') {
      for (let offset = -12; offset <= 12; offset += 6) {
        const diff = (colY - baseYear) * 12 + (colM - baseMonth)
        if (diff === offset) { cols.push(col); break }
      }
    } else if (frequency === 'quarterly') {
      for (let offset = -12; offset <= 12; offset += 3) {
        const diff = (colY - baseYear) * 12 + (colM - baseMonth)
        if (diff === offset) { cols.push(col); break }
      }
    }
  }
  return cols
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
  monthly: number[]
  total: number
}

// ── GL actuals types (from /api/finance/pnl) ─────────────────────────────────
interface PnlGroup {
  key: string
  label: string
  color: string | null
  totalPeriod: number
}
interface PnlMonthData {
  incomeGroups: PnlGroup[]
  expenseGroups: PnlGroup[]
  totalIncome: number
  totalExpenses: number
  netProfit: number
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnnualPnLPage() {
  const [bills, setBills]       = useState<Bill[]>([])
  const [income, setIncome]     = useState<IncomeEntry[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [selectedEntityId, setSelectedEntityId] = useState<string>('')
  const [fyStartMonth, setFyStartMonth] = useState<number>(7)
  const [fyStartYear, setFyStartYear]   = useState<number>(() => currentFyYear(7))
  const [loading, setLoading]   = useState(true)
  // GL actuals: one PnlMonthData per column (null = not yet loaded)
  const [glMonths, setGlMonths] = useState<(PnlMonthData | null)[]>(Array(12).fill(null))
  const [glLoading, setGlLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'actuals' | 'forecast'>('actuals')
  const printRef = useRef<HTMLDivElement>(null)

  const fyMonthLabelsArr = useMemo(() => fyMonthLabels(fyStartMonth), [fyStartMonth])

  // ── Build Excel workbook ─────────────────────────────────────────────────
  function buildExcelWorkbook(): XLSX.WorkBook {
    const wb     = XLSX.utils.book_new()
    const now    = format(new Date(), 'd MMM yyyy h:mm a')
    const fyStr  = fyLabelUtil(fyStartYear, fyStartMonth)

    XLSX.utils.book_append_sheet(wb, buildCoverSheet({
      reportTitle: 'Annual P&L',
      dateRange:   fyStr,
      generatedAt: now,
    }), 'Info')

    // Column headers: Category + 12 months + Total
    const monthLabels = fyMonthLabelsArr  // e.g. ['Jul', 'Aug', ...]
    const headerRow   = ['Category', ...monthLabels, 'Total']
    const numCols     = monthLabels.length  // 12
    const totalCol    = numCols + 1         // column index of Total

    const aoa: any[][] = []
    aoa.push([`Annual P&L — ${fyStr} (${viewMode === 'actuals' ? 'Actuals / GL' : 'Forecast'})`, ...new Array(numCols + 1).fill('')])
    aoa.push(headerRow)

    // ── Income section
    aoa.push(['INCOME', ...new Array(numCols).fill(''), ''])
    for (const row of incomeRows) {
      aoa.push([row.label, ...row.monthly.map(v => v || null), row.total || null])
    }
    aoa.push(['Total Income', ...monthlyIncome.map(v => v || null), totalIncome || null])
    aoa.push([])

    // ── Expenses section
    aoa.push(['EXPENSES', ...new Array(numCols).fill(''), ''])
    for (const row of expenseRows) {
      aoa.push([row.label, ...row.monthly.map(v => v || null), row.total || null])
    }
    aoa.push(['Total Expenses', ...monthlyExpenses.map(v => v || null), totalExpenses || null])
    aoa.push([])

    // ── NET row
    aoa.push(['NET PROFIT / (LOSS)', ...monthlyNet.map(v => v || null), totalNet || null])

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    // Column widths: label col 30, 12 month cols 10, total col 14
    setCols(ws, [30, ...new Array(numCols).fill(10), 14])
    freeze(ws, 2, 1)

    // Title row
    styleRow(ws, 0, 0, totalCol, headerLeftStyle())
    // Header row
    styleRow(ws, 1, 0, totalCol, headerStyle())
    sc(ws, 1, 0, headerLeftStyle())

    let r = 2
    // Income section label
    styleRow(ws, r, 0, totalCol, sectionStyle()); r++
    // Income data rows
    let iAlt = 0
    for (const row of incomeRows) {
      const alt = iAlt % 2 === 1
      sc(ws, r, 0, dataLabelStyle(alt))
      for (let c = 1; c <= numCols; c++) sc(ws, r, c, row.monthly[c-1] > 0 ? positiveStyle(alt) : dataStyle(alt))
      sc(ws, r, totalCol, positiveStyle(alt))
      r++; iAlt++
    }
    // Total Income row
    sc(ws, r, 0, totalLabelStyle())
    for (let c = 1; c <= totalCol; c++) sc(ws, r, c, totalStyle())
    r += 2  // skip blank row

    // Expense section label
    styleRow(ws, r, 0, totalCol, sectionStyle()); r++
    // Expense data rows
    let eAlt = 0
    for (const row of expenseRows) {
      const alt = eAlt % 2 === 1
      sc(ws, r, 0, dataLabelStyle(alt))
      for (let c = 1; c <= numCols; c++) sc(ws, r, c, row.monthly[c-1] > 0 ? negativeStyle(alt) : dataStyle(alt))
      sc(ws, r, totalCol, negativeStyle(alt))
      r++; eAlt++
    }
    // Total Expenses row
    sc(ws, r, 0, totalLabelStyle())
    for (let c = 1; c <= totalCol; c++) sc(ws, r, c, totalStyle())
    r += 2  // skip blank row

    // NET row
    sc(ws, r, 0, grandTotalLabelStyle())
    for (let c = 1; c <= totalCol; c++) {
      const val = aoa[r]?.[c] as number
      sc(ws, r, c, val >= 0
        ? grandTotalStyle()
        : { ...grandTotalStyle(), font: { bold: true, color: { rgb: 'FFC7CE' }, name: 'Arial', sz: 11 } })
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Annual P&L')
    return wb
  }

  const fyMonths = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => fyColDate(fyStartYear, i, fyStartMonth)),
    [fyStartYear, fyStartMonth])

  // ── Load static data (settings + forecast sources) ───────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
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

  // ── Load GL actuals: single batch API call for all 12 months ────────────────
  //
  // The /api/finance/pnl/batch endpoint reads all posted FinanceJournalLine
  // entries for the full FY in one DB query and returns data grouped by month.
  useEffect(() => {
    if (viewMode !== 'actuals') return
    let cancelled = false
    setGlMonths(Array(12).fill(null))
    setGlLoading(true)

    async function loadBatch() {
      const from = startOfMonth(fyMonths[0]).toISOString().split('T')[0]
      const to   = endOfMonth(fyMonths[11]).toISOString().split('T')[0]
      const params = new URLSearchParams({ from, to })
      if (selectedEntityId) params.set('entityId', selectedEntityId)
      try {
        const res = await fetch(`/api/finance/pnl/batch?${params}`)
        if (!res.ok || cancelled) return
        const data: Record<string, PnlMonthData> = await res.json()
        if (!cancelled) {
          setGlMonths(fyMonths.map(colDate => {
            const yr  = colDate.getFullYear()
            const mo  = String(colDate.getMonth() + 1).padStart(2, '0')
            const key = `${yr}-${mo}`
            const m   = data[key]
            if (!m) return { incomeGroups: [], expenseGroups: [], totalIncome: 0, totalExpenses: 0, netProfit: 0 }
            return {
              incomeGroups:  m.incomeGroups  ?? [],
              expenseGroups: m.expenseGroups ?? [],
              totalIncome:   m.totalIncome   ?? 0,
              totalExpenses: m.totalExpenses ?? 0,
              netProfit:     m.netProfit     ?? 0,
            }
          }))
        }
      } catch { /* silently leave months empty on error */ }
    }

    loadBatch().finally(() => { if (!cancelled) setGlLoading(false) })

    return () => { cancelled = true }
  }, [fyStartYear, fyStartMonth, selectedEntityId, viewMode])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build income rows ─────────────────────────────────────────────────────
  //
  // Actuals mode: sourced from GL (posted FinanceJournalLine via /api/finance/pnl).
  // Forecast mode: sourced from operational tables — planning projection only.
  const incomeRows = useMemo((): TableRow[] => {
    if (viewMode === 'actuals') {
      const map = new Map<string, TableRow>()
      for (let col = 0; col < 12; col++) {
        const month = glMonths[col]
        if (!month) continue
        for (const g of month.incomeGroups) {
          if (!map.has(g.key)) {
            map.set(g.key, { key: g.key, label: g.label, color: g.color, side: 'income', monthly: Array(12).fill(0), total: 0 })
          }
          map.get(g.key)!.monthly[col] += g.totalPeriod
        }
      }
      for (const row of map.values()) row.total = row.monthly.reduce((s, v) => s + v, 0)
      return Array.from(map.values()).filter(r => r.total !== 0).sort((a, b) => b.total - a.total)
    }

    // Forecast mode — operational tables
    const map = new Map<string, TableRow>()
    function getRow(key: string, label: string, color: string | null): TableRow {
      if (!map.has(key)) map.set(key, { key, label, color, side: 'income', monthly: Array(12).fill(0), total: 0 })
      return map.get(key)!
    }

    for (const e of income) {
      if (!e.isActive) continue
      if (selectedEntityId && e.entityId !== selectedEntityId) continue
      const key   = e.category?.id ?? '__none__'
      const label = e.category?.name ?? 'Uncategorised'
      const color = e.category?.color ?? null
      const row   = getRow(key, label, color)

      if (e.received && e.receivedDate) {
        for (let col = 0; col < 12; col++) {
          if (isInMonth(e.receivedDate, fyMonths[col])) row.monthly[col] += e.amount
        }
      } else {
        if (e.incomeType === 'one-off' || isLumpSumFrequency(e.frequency)) {
          if (e.incomeType === 'one-off') {
            for (let col = 0; col < 12; col++) {
              if (isInMonth(e.nextExpectedDate, fyMonths[col])) row.monthly[col] += e.amount
            }
          } else {
            const hitCols = lumpSumColumns(e.frequency, new Date(e.nextExpectedDate), fyMonths)
            for (const col of hitCols) row.monthly[col] += e.amount
          }
        } else {
          const monthlyAmt = toPeriodAmount(e.amount, e.frequency)
          for (let col = 0; col < 12; col++) row.monthly[col] += monthlyAmt
        }
      }
    }

    for (const row of map.values()) row.total = row.monthly.reduce((s, v) => s + v, 0)
    return Array.from(map.values()).filter(r => r.total > 0).sort((a, b) => b.total - a.total)
  }, [income, glMonths, fyMonths, viewMode, selectedEntityId])

  // ── Build expense rows ────────────────────────────────────────────────────
  const expenseRows = useMemo((): TableRow[] => {
    if (viewMode === 'actuals') {
      const map = new Map<string, TableRow>()
      for (let col = 0; col < 12; col++) {
        const month = glMonths[col]
        if (!month) continue
        for (const g of month.expenseGroups) {
          if (!map.has(g.key)) {
            map.set(g.key, { key: g.key, label: g.label, color: g.color, side: 'expense', monthly: Array(12).fill(0), total: 0 })
          }
          map.get(g.key)!.monthly[col] += g.totalPeriod
        }
      }
      for (const row of map.values()) row.total = row.monthly.reduce((s, v) => s + v, 0)
      return Array.from(map.values()).filter(r => r.total !== 0).sort((a, b) => b.total - a.total)
    }

    // Forecast mode — operational tables
    const map = new Map<string, TableRow>()
    function getRow(key: string, label: string, color: string | null): TableRow {
      if (!map.has(key)) map.set(key, { key, label, color, side: 'expense', monthly: Array(12).fill(0), total: 0 })
      return map.get(key)!
    }

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
          if (isInMonth(b.paidDate, fyMonths[col])) row.monthly[col] += b.amount
        }
      } else {
        if (b.billType === 'one-off' || isLumpSumFrequency(b.frequency)) {
          if (b.billType === 'one-off') {
            for (let col = 0; col < 12; col++) {
              if (isInMonth(b.nextDueDate, fyMonths[col])) row.monthly[col] += b.amount
            }
          } else {
            const hitCols = lumpSumColumns(b.frequency, new Date(b.nextDueDate), fyMonths)
            for (const col of hitCols) row.monthly[col] += b.amount
          }
        } else {
          const monthlyAmt = toPeriodAmount(b.amount, b.frequency)
          for (let col = 0; col < 12; col++) row.monthly[col] += monthlyAmt
        }
      }
    }

    for (const row of map.values()) row.total = row.monthly.reduce((s, v) => s + v, 0)
    return Array.from(map.values()).filter(r => r.total > 0).sort((a, b) => b.total - a.total)
  }, [bills, glMonths, fyMonths, viewMode, selectedEntityId])

  // ── Totals ────────────────────────────────────────────────────────────────
  const monthlyIncome   = useMemo(() => Array.from({ length: 12 }, (_, i) => incomeRows.reduce((s, r) => s + r.monthly[i], 0)), [incomeRows])
  const monthlyExpenses = useMemo(() => Array.from({ length: 12 }, (_, i) => expenseRows.reduce((s, r) => s + r.monthly[i], 0)), [expenseRows])
  const monthlyNet      = useMemo(() => Array.from({ length: 12 }, (_, i) => monthlyIncome[i] - monthlyExpenses[i]), [monthlyIncome, monthlyExpenses])

  const totalIncome   = incomeRows.reduce((s, r) => s + r.total, 0)
  const totalExpenses = expenseRows.reduce((s, r) => s + r.total, 0)
  const totalNet      = totalIncome - totalExpenses

  const now = new Date()
  const currentCol = fyMonths.findIndex(m => getMonth(m) === getMonth(now) && getYear(m) === getYear(now))

  if (loading) return <div className="p-4 text-muted-foreground">Loading annual P&L…</div>

  return (
    <div className="space-y-4">
      <PageHero title="Annual P&L" subtitle="Profit and loss statement for the financial year." />

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

        {/* Actuals / Forecast toggle */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => setViewMode('actuals')}
            className={cn('px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
              viewMode === 'actuals' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
            Actuals (GL)
          </button>
          <button onClick={() => setViewMode('forecast')}
            className={cn('px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
              viewMode === 'forecast' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
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

        {glLoading && <span className="text-xs text-muted-foreground animate-pulse">Loading GL data…</span>}
        <div className="ml-auto" data-print-hide>
          <PrintButton
            printRef={printRef}
            reportTitle="Annual P&L"
            dateRange={fyLabelUtil(fyStartYear, fyStartMonth)}
            landscape
            disabled={loading}
          />
          <ExcelButton
            buildWorkbook={buildExcelWorkbook}
            filename={`HomeBase - Annual P&L - ${fyLabelUtil(fyStartYear, fyStartMonth)}.xlsx`}
            disabled={loading}
            className="ml-2"
          />
        </div>
      </div>

      {/* ── Printable region (landscape) ───────────────────────────────────── */}
      <PrintWrapper
        ref={printRef}
        reportTitle="Annual P&L"
        dateRange={fyLabelUtil(fyStartYear, fyStartMonth)}
        meta={`Income: ${fmtCurrency(totalIncome)} · Expenses: ${fmtCurrency(totalExpenses)} · Net: ${fmtCurrency(totalNet)} · ${viewMode === 'actuals' ? 'Actuals (GL)' : 'Forecast'}`}
      >

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-green-500" /> Total Income
          </div>
          <p className="hb-stat__num hb-stat__num--money text-green-600">{fmtCurrency(totalIncome)}</p>
        </div>
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" /> Total Expenses
          </div>
          <p className="hb-stat__num hb-stat__num--money text-red-600">{fmtCurrency(totalExpenses)}</p>
        </div>
        <div className={cn('rounded-lg border p-3',
          totalNet >= 0 ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5')}>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <DollarSign className={cn('h-3.5 w-3.5', totalNet >= 0 ? 'text-green-500' : 'text-red-500')} />
            Net {totalNet >= 0 ? 'Profit' : 'Loss'}
          </div>
          <p className={cn('hb-stat__num hb-stat__num--money', totalNet >= 0 ? 'text-green-600' : 'text-red-600')}>
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
                  {viewMode === 'actuals' && ' No posted GL journal entries found for income accounts this period.'}
                  {viewMode === 'forecast' && ' Switch to Actuals to see GL-posted income, or add income entries for a forecast.'}
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
                  {viewMode === 'actuals' && ' No posted GL journal entries found for expense accounts this period.'}
                  {viewMode === 'forecast' && ' Switch to Actuals to see GL-posted expenses, or add bills for a forecast.'}
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
        {viewMode === 'actuals'
          ? 'Actuals — sourced from the General Ledger (posted journal entries). Figures match the Trial Balance, P&L, and Balance Sheet exactly. Future months with no posted entries will show —.'
          : 'Forecast — recurring bills and income spread evenly across months at their monthly equivalent. This is a planning projection based on scheduled items, not GL-posted actuals.'}
      </p>

      </PrintWrapper>
    </div>
  )
}
