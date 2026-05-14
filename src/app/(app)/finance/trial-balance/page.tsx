'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  CheckCircle2, AlertTriangle, ArrowLeft, ChevronRight,
  Search, X, BookOpen, Scale,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn, todayAU } from '@/lib/utils'
import { PrintButton } from '@/components/print/PrintButton'
import { PrintWrapper } from '@/components/print/PrintWrapper'
import { ExcelButton } from '@/components/print/ExcelButton'
import * as XLSX from 'xlsx'
import {
  buildCoverSheet, headerStyle, headerLeftStyle, sectionStyle, subSectionStyle,
  totalStyle, totalLabelStyle, grandTotalStyle, grandTotalLabelStyle,
  dataStyle, dataLabelStyle, setCols, freeze, styleRow, FMT, sc,
} from '@/lib/excelStyles'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TBAccount {
  id: string
  name: string
  type: string
  glCode: string | null
  parentId: string | null
  parentName: string | null
  totalDebit: number
  totalCredit: number
  netBalance: number
}

interface TrialBalanceData {
  mode: 'trial-balance'
  accounts: TBAccount[]
  grandTotalDebit: number
  grandTotalCredit: number
  isBalanced: boolean
  difference: number
  from: string | null
  to: string | null
}

interface GLLine {
  id: string
  date: string
  reference: string
  description: string
  type: 'journal' | 'transaction'
  entryType: string
  debit: number
  credit: number
  movement: number
  balance: number
  lineDescription: string | null
}

interface GLAccount {
  id: string; name: string; type: string; glCode: string | null
  parentName: string | null; openingBalance: number
}

interface GeneralLedgerData {
  mode: 'general-ledger'
  glAccount: GLAccount
  openingBalance: number
  closingBalance: number
  totalDebit: number
  totalCredit: number
  lines: GLLine[]
  from: string | null
  to: string | null
}

type Data = TrialBalanceData | GeneralLedgerData | null

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

function fmtCompact(n: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

const TYPE_ORDER: Record<string, number> = {
  asset: 1, liability: 2, equity: 3, income: 4, expense: 5, transfer: 6,
}

const TYPE_LABEL: Record<string, string> = {
  asset: 'Assets', liability: 'Liabilities', equity: 'Equity',
  income: 'Income', expense: 'Expenses', transfer: 'Transfers',
}

const TYPE_COLOR: Record<string, string> = {
  asset:     'text-blue-600 dark:text-blue-400',
  liability: 'text-red-600  dark:text-red-400',
  equity:    'text-purple-600 dark:text-purple-400',
  income:    'text-green-600 dark:text-green-400',
  expense:   'text-orange-600 dark:text-orange-400',
  transfer:  'text-muted-foreground',
}

const TYPE_BG: Record<string, string> = {
  asset:     'bg-blue-500/5',
  liability: 'bg-red-500/5',
  equity:    'bg-purple-500/5',
  income:    'bg-green-500/5',
  expense:   'bg-orange-500/5',
  transfer:  'bg-muted/30',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TrialBalancePage() {
  const [data, setData]         = useState<Data>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  // Filter state
  const [from, setFrom]         = useState('')
  const [to, setTo]             = useState(todayAU())
  const [entityId, setEntityId] = useState('')
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([])
  const [search, setSearch]     = useState('')

  // GL drill-down state
  const printRef = useRef<HTMLDivElement>(null)
  const [glAccountId, setGlAccountId] = useState<string | null>(null)

  // ── Load entities once ────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/finance/entities')
      .then(r => r.ok ? r.json() : [])
      .then(setEntities)
      .catch(() => {})
  }, [])

  // ── Fetch report ──────────────────────────────────────────────────────────
  const load = useCallback(async (glId?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (from)     params.set('from', from)
      if (to)       params.set('to', to)
      if (entityId) params.set('entityId', entityId)
      if (glId)     params.set('glAccountId', glId)

      const res = await fetch(`/api/finance/trial-balance?${params}`)
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setError(e.error ?? 'Failed to load')
        return
      }
      setData(await res.json())
    } catch (e: any) {
      setError(e.message ?? 'Network error')
    } finally {
      setLoading(false)
    }
  }, [from, to, entityId])

  useEffect(() => { load(glAccountId ?? undefined) }, [load, glAccountId])

  function drillInto(accountId: string) {
    setGlAccountId(accountId)
    setSearch('')
  }

  function backToTrialBalance() {
    setGlAccountId(null)
  }

  // ── Build Excel workbook ─────────────────────────────────────────────────
  function buildExcelWorkbook(): XLSX.WorkBook {
    const wb  = XLSX.utils.book_new()
    const now = format(new Date(), 'd MMM yyyy h:mm a')
    const TYPE_LABELS: Record<string, string> = {
      asset: 'Assets', liability: 'Liabilities', equity: 'Equity',
      income: 'Income', expense: 'Expenses', transfer: 'Transfers',
    }
    const TYPE_KEYS = ['asset', 'liability', 'equity', 'income', 'expense', 'transfer']

    XLSX.utils.book_append_sheet(wb, buildCoverSheet({
      reportTitle: printTitle,
      dateRange:   printDateRange,
      generatedAt: now,
    }), 'Info')

    // ── Trial Balance sheet ─────────────────────────────────────────
    if (data?.mode === 'trial-balance') {
      const tb  = data as TrialBalanceData
      const aoa: any[][] = []
      aoa.push(['GL Code', 'Account Name', 'Account Type', 'Parent Group', 'Total Debits ($)', 'Total Credits ($)', 'Net Balance ($)'])

      for (const typeKey of TYPE_KEYS) {
        const rows = tb.accounts.filter(a =>
          typeKey === 'transfer'
            ? !TYPE_KEYS.slice(0, 5).includes(a.type)
            : a.type === typeKey
        )
        if (rows.length === 0) continue
        aoa.push([TYPE_LABELS[typeKey] ?? typeKey, '', '', '', '', '', ''])
        for (const a of rows) {
          aoa.push([
            a.glCode ?? '',
            a.parentName ? `${a.parentName} — ${a.name}` : a.name,
            a.type, a.parentName ?? '',
            a.totalDebit  || null,
            a.totalCredit || null,
            a.netBalance  || null,
          ])
        }
        const dr = rows.reduce((s, a) => s + a.totalDebit, 0)
        const cr = rows.reduce((s, a) => s + a.totalCredit, 0)
        aoa.push([`${TYPE_LABELS[typeKey]} Total`, '', '', '', dr || null, cr || null, (dr - cr) || null])
      }
      aoa.push([])
      aoa.push(['GRAND TOTAL', '', '', '', tb.grandTotalDebit, tb.grandTotalCredit, tb.grandTotalDebit - tb.grandTotalCredit])
      aoa.push([tb.isBalanced ? '✓ Ledger is balanced' : `⚠ Out of balance by ${Math.abs(tb.difference).toFixed(2)}`, '', '', '', '', '', ''])

      const ws = XLSX.utils.aoa_to_sheet(aoa)
      setCols(ws, [10, 38, 14, 22, 18, 18, 18])
      freeze(ws, 1, 2)
      styleRow(ws, 0, 0, 6, headerStyle())
      sc(ws, 0, 0, headerLeftStyle())
      sc(ws, 0, 1, headerLeftStyle())

      let dataIdx = 0
      for (let r = 1; r < aoa.length; r++) {
        const row   = aoa[r]
        const label = String(row?.[0] ?? '')
        if (!row?.length) continue
        const isSect  = Object.values(TYPE_LABELS).includes(label)
        const isSub   = label.endsWith(' Total') && !label.startsWith('GRAND')
        const isGrand = label === 'GRAND TOTAL'
        const isNote  = label.startsWith('✓') || label.startsWith('⚠')
        if (isSect) {
          styleRow(ws, r, 0, 6, sectionStyle())
        } else if (isSub) {
          sc(ws, r, 0, totalLabelStyle()); for (let c = 1; c <= 6; c++) sc(ws, r, c, totalStyle())
        } else if (isGrand) {
          sc(ws, r, 0, grandTotalLabelStyle()); for (let c = 1; c <= 6; c++) sc(ws, r, c, grandTotalStyle())
        } else if (isNote) {
          sc(ws, r, 0, { font: { italic: true, name: 'Arial', sz: 9,
            color: { rgb: tb.isBalanced ? '375623' : 'C00000' } } })
        } else {
          const alt = dataIdx % 2 === 1
          sc(ws, r, 0, dataLabelStyle(alt))
          sc(ws, r, 1, dataLabelStyle(alt))
          sc(ws, r, 2, dataLabelStyle(alt))
          sc(ws, r, 3, dataLabelStyle(alt))
          for (let c = 4; c <= 6; c++) sc(ws, r, c, dataStyle(alt))
          dataIdx++
        }
      }
      XLSX.utils.book_append_sheet(wb, ws, 'Trial Balance')
    }

    // ── General Ledger sheet ────────────────────────────────────────
    if (data?.mode === 'general-ledger') {
      const gl  = data as GeneralLedgerData
      const aoa: any[][] = []
      const acctTitle = gl.glAccount.glCode
        ? `${gl.glAccount.glCode} — ${gl.glAccount.name}`
        : gl.glAccount.name
      aoa.push([acctTitle, '', '', '', '', '', ''])
      aoa.push(['Date', 'Reference', 'Description', 'Entry Type', 'Debit ($)', 'Credit ($)', 'Balance ($)'])
      aoa.push([gl.from ? new Date(gl.from) : 'All time', '', 'Opening balance', '', null, null, gl.openingBalance])
      for (const l of gl.lines) {
        aoa.push([
          new Date(l.date),
          l.reference || '',
          l.description + (l.lineDescription ? ` — ${l.lineDescription}` : ''),
          l.type === 'journal' ? l.entryType : 'transaction',
          l.debit  || null,
          l.credit || null,
          l.balance,
        ])
      }
      aoa.push([])
      aoa.push(['Closing Balance', '', `${gl.lines.length} lines`, '', gl.totalDebit, gl.totalCredit, gl.closingBalance])

      const ws = XLSX.utils.aoa_to_sheet(aoa)
      setCols(ws, [14, 10, 42, 16, 16, 16, 16])
      freeze(ws, 2, 1)
      styleRow(ws, 0, 0, 6, headerLeftStyle())
      styleRow(ws, 1, 0, 6, headerStyle())
      sc(ws, 1, 0, headerLeftStyle())
      sc(ws, 1, 2, headerLeftStyle())
      sc(ws, 1, 3, headerLeftStyle())
      // Opening balance row
      styleRow(ws, 2, 0, 6, subSectionStyle())
      // Data rows
      for (let r = 3; r < aoa.length - 2; r++) {
        const alt = (r - 3) % 2 === 1
        sc(ws, r, 0, { ...dataLabelStyle(alt), numFmt: FMT.DATE })
        sc(ws, r, 1, dataLabelStyle(alt))
        sc(ws, r, 2, dataLabelStyle(alt))
        sc(ws, r, 3, dataLabelStyle(alt))
        for (let c = 4; c <= 6; c++) sc(ws, r, c, dataStyle(alt))
      }
      const closeR = aoa.length - 1
      sc(ws, closeR, 0, grandTotalLabelStyle())
      sc(ws, closeR, 2, grandTotalLabelStyle())
      for (let c = 3; c <= 6; c++) sc(ws, closeR, c, grandTotalStyle())
      XLSX.utils.book_append_sheet(wb, ws, 'General Ledger')
    }

    return wb
  }

  // ── Group TB accounts by type ─────────────────────────────────────────────
  function groupAccounts(accounts: TBAccount[]) {
    const groups = new Map<string, TBAccount[]>()
    const order  = ['asset', 'liability', 'equity', 'income', 'expense', 'transfer']
    for (const type of order) groups.set(type, [])
    for (const acct of accounts) {
      const key = acct.type in TYPE_ORDER ? acct.type : 'transfer'
      groups.get(key)?.push(acct)
    }
    return groups
  }

  // Filter accounts by search
  const filteredAccounts = data?.mode === 'trial-balance'
    ? data.accounts.filter(a =>
        !search || a.name.toLowerCase().includes(search.toLowerCase())
          || (a.glCode ?? '').toLowerCase().includes(search.toLowerCase())
          || (a.parentName ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : []

  const tbData = data?.mode === 'trial-balance' ? data : null
  const glData = data?.mode === 'general-ledger' ? data : null
  const grouped = tbData ? groupAccounts(filteredAccounts) : null

  // Build a date range string for the print header
  const printDateRange = data?.from && data?.to
    ? `${format(new Date(data.from), 'd MMM yyyy')} – ${format(new Date(data.to), 'd MMM yyyy')}`
    : data?.to ? `Up to ${format(new Date(data.to), 'd MMM yyyy')}` : 'All time'
  const printTitle = glAccountId
    ? `General Ledger${glData ? ` — ${glData.glAccount.name}` : ''}`
    : 'Trial Balance'

  return (
    <div className="space-y-5 pb-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {glAccountId && (
            <button
              onClick={backToTrialBalance}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Trial Balance
            </button>
          )}
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              {glAccountId
                ? <><BookOpen className="h-5 w-5 text-primary" /> General Ledger</>
                : <><Scale className="h-5 w-5 text-primary" /> Trial Balance</>
              }
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {glAccountId
                ? 'All movements for a single GL account with running balance'
                : 'Posted journal lines and cleared transactions by GL account — DR must equal CR'
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton
            printRef={printRef}
            reportTitle={printTitle}
            dateRange={printDateRange}
            disabled={!data || loading}
          />
          <ExcelButton
            buildWorkbook={buildExcelWorkbook}
            filename={`HomeBase - ${printTitle} - ${printDateRange}.xlsx`}
            disabled={!data || loading}
          />
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">From date</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">To date</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
        {entities.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Entity</label>
            <select value={entityId} onChange={e => setEntityId(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
              <option value="">All entities</option>
              {entities.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
            </select>
          </div>
        )}
        {/* Search — only on trial balance */}
        {!glAccountId && (
          <div className="relative">
            <label className="text-xs text-muted-foreground block mb-1">Search accounts</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Name or GL code…"
                className="pl-8 pr-8 rounded-md border border-input bg-background px-3 py-1.5 text-sm w-48"
              />
              {search && (
                <button onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Printable region ───────────────────────────────────────────────── */}
      <PrintWrapper
        ref={printRef}
        reportTitle={printTitle}
        dateRange={printDateRange}
        meta={tbData ? `${tbData.isBalanced ? '✓ Balanced' : '⚠ Out of balance'} · ${tbData.accounts.length} accounts` : undefined}
      >

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">
          {error}
          <button onClick={() => load(glAccountId ?? undefined)}
            className="ml-3 underline hover:no-underline">Retry</button>
        </div>
      )}

      {loading && !data && (
        <div className="p-4 text-muted-foreground text-sm">Loading…</div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TRIAL BALANCE VIEW                                                  */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tbData && !glAccountId && grouped && (
        <>
          {/* Balance status banner */}
          <div className={cn(
            'rounded-lg border px-4 py-3 flex items-center gap-3',
            tbData.isBalanced
              ? 'border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400'
              : 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400',
          )}>
            {tbData.isBalanced
              ? <CheckCircle2 className="h-4 w-4 shrink-0" />
              : <AlertTriangle className="h-4 w-4 shrink-0" />
            }
            <span className="text-sm font-medium">
              {tbData.isBalanced
                ? `Ledger is balanced — Total Debits = Total Credits = ${fmt(tbData.grandTotalDebit)}`
                : `Out of balance by ${fmt(tbData.difference)} — investigate unbalanced journal entries`
              }
            </span>
            <span className="ml-auto text-xs opacity-70">
              {tbData.accounts.length} accounts · {tbData.from && tbData.to
                ? `${format(new Date(tbData.from), 'd MMM yyyy')} – ${format(new Date(tbData.to), 'd MMM yyyy')}`
                : tbData.to ? `up to ${format(new Date(tbData.to), 'd MMM yyyy')}` : 'all time'
              }
            </span>
          </div>

          {/* Summary stat cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground mb-1">Total Debits</p>
              <p className="text-xl font-bold text-green-600">{fmtCompact(tbData.grandTotalDebit)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground mb-1">Total Credits</p>
              <p className="text-xl font-bold text-red-600">{fmtCompact(tbData.grandTotalCredit)}</p>
            </div>
            <div className={cn('rounded-lg border p-3',
              tbData.isBalanced ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5')}>
              <p className="text-xs text-muted-foreground mb-1">Difference</p>
              <p className={cn('text-xl font-bold', tbData.isBalanced ? 'text-green-600' : 'text-red-600')}>
                {tbData.isBalanced ? '✓ Nil' : fmt(tbData.difference)}
              </p>
            </div>
          </div>

          {/* Account table — grouped by type */}
          {filteredAccounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {search ? 'No accounts match your search.' : 'No posted journal entries found for this period.'}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Table header */}
              <div className="grid text-xs font-medium text-muted-foreground bg-muted/40 border-b border-border px-4 py-2.5"
                style={{ gridTemplateColumns: '3rem 1fr 6rem 7rem 7rem 7rem' }}>
                <span>Code</span>
                <span>Account</span>
                <span className="text-center">Type</span>
                <span className="text-right">Debit</span>
                <span className="text-right">Credit</span>
                <span className="text-right">Net Balance</span>
              </div>

              {/* Grouped rows */}
              {Array.from(grouped.entries())
                .filter(([, rows]) => rows.length > 0)
                .map(([type, rows]) => {
                  const typeTotalDR = rows.reduce((s, a) => s + a.totalDebit,  0)
                  const typeTotalCR = rows.reduce((s, a) => s + a.totalCredit, 0)
                  return (
                    <div key={type}>
                      {/* Type section header */}
                      <div className={cn('px-4 py-1.5 border-b border-border/50 flex items-center justify-between', TYPE_BG[type])}>
                        <span className={cn('text-xs font-semibold uppercase tracking-wider', TYPE_COLOR[type])}>
                          {TYPE_LABEL[type] ?? type}
                        </span>
                        <div className="flex gap-6 text-xs text-muted-foreground">
                          <span>DR {fmtCompact(typeTotalDR)}</span>
                          <span>CR {fmtCompact(typeTotalCR)}</span>
                        </div>
                      </div>

                      {/* Account rows */}
                      {rows.map(acct => (
                        <button
                          key={acct.id}
                          onClick={() => drillInto(acct.id)}
                          className="w-full grid items-center px-4 py-2.5 border-b border-border/40 hover:bg-accent/40 transition-colors text-left group"
                          style={{ gridTemplateColumns: '3rem 1fr 6rem 7rem 7rem 7rem' }}
                          title="Click to view General Ledger for this account"
                        >
                          <span className="text-[11px] font-mono text-muted-foreground/70">
                            {acct.glCode ?? '—'}
                          </span>
                          <div className="min-w-0">
                            <span className="text-sm font-medium group-hover:text-primary transition-colors">
                              {acct.parentName ? `${acct.parentName} — ${acct.name}` : acct.name}
                            </span>
                          </div>
                          <div className="text-center">
                            <span className={cn(
                              'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                              TYPE_BG[acct.type], TYPE_COLOR[acct.type],
                            )}>
                              {acct.type}
                            </span>
                          </div>
                          <span className="text-right text-sm tabular-nums text-green-700 dark:text-green-400 font-medium">
                            {acct.totalDebit > 0 ? fmt(acct.totalDebit) : '—'}
                          </span>
                          <span className="text-right text-sm tabular-nums text-red-700 dark:text-red-400 font-medium">
                            {acct.totalCredit > 0 ? fmt(acct.totalCredit) : '—'}
                          </span>
                          <div className="flex items-center justify-end gap-1">
                            <span className={cn(
                              'text-sm tabular-nums font-semibold',
                              acct.netBalance > 0  ? 'text-green-600' :
                              acct.netBalance < 0  ? 'text-red-600'   :
                                                     'text-muted-foreground',
                            )}>
                              {fmt(acct.netBalance)}
                            </span>
                            <ChevronRight className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                })}

              {/* Grand totals */}
              <div className={cn(
                'grid items-center px-4 py-3 text-sm font-bold',
                tbData.isBalanced ? 'bg-green-500/5' : 'bg-red-500/5',
              )}
                style={{ gridTemplateColumns: '3rem 1fr 6rem 7rem 7rem 7rem' }}>
                <span />
                <span className="text-foreground">TOTAL</span>
                <span />
                <span className="text-right tabular-nums text-green-700 dark:text-green-400">
                  {fmt(tbData.grandTotalDebit)}
                </span>
                <span className="text-right tabular-nums text-red-700 dark:text-red-400">
                  {fmt(tbData.grandTotalCredit)}
                </span>
                <span className={cn(
                  'text-right tabular-nums',
                  tbData.isBalanced ? 'text-green-600' : 'text-red-600',
                )}>
                  {tbData.isBalanced ? '✓ Balanced' : `Δ ${fmt(tbData.difference)}`}
                </span>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Includes all posted journal entries and cleared transactions with GL account assignments.
            Click any row to view the General Ledger for that account.
            Net Balance = Total Debits − Total Credits. A balanced ledger has Net Balance = 0 overall.
          </p>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* GENERAL LEDGER VIEW                                                 */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {glData && glAccountId && (
        <>
          {/* GL account header */}
          <div className={cn('rounded-lg border p-4 space-y-2', TYPE_BG[glData.glAccount.type])}>
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                {glData.glAccount.glCode && (
                  <span className="text-[11px] font-mono text-muted-foreground mr-2">
                    {glData.glAccount.glCode}
                  </span>
                )}
                <span className="text-base font-bold">
                  {glData.glAccount.parentName
                    ? `${glData.glAccount.parentName} — ${glData.glAccount.name}`
                    : glData.glAccount.name}
                </span>
                <span className={cn('ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full', TYPE_BG[glData.glAccount.type], TYPE_COLOR[glData.glAccount.type])}>
                  {glData.glAccount.type}
                </span>
              </div>
              <div className="ml-auto flex gap-6 text-sm">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Opening Balance</p>
                  <p className="font-semibold">{fmt(glData.openingBalance)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Closing Balance</p>
                  <p className={cn('font-bold text-lg',
                    glData.closingBalance > 0 ? 'text-green-600' :
                    glData.closingBalance < 0 ? 'text-red-600' : 'text-muted-foreground')}>
                    {fmt(glData.closingBalance)}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground pt-1 border-t border-border/30">
              <span>Total Debits: <span className="font-medium text-foreground">{fmt(glData.totalDebit)}</span></span>
              <span>Total Credits: <span className="font-medium text-foreground">{fmt(glData.totalCredit)}</span></span>
              <span>{glData.lines.length} line{glData.lines.length !== 1 ? 's' : ''}</span>
              {glData.from && glData.to && (
                <span className="ml-auto">
                  {format(new Date(glData.from), 'd MMM yyyy')} – {format(new Date(glData.to), 'd MMM yyyy')}
                </span>
              )}
            </div>
          </div>

          {/* GL ledger table */}
          {glData.lines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">No transactions for this account in the selected period.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Table header */}
              <div className="grid text-xs font-medium text-muted-foreground bg-muted/40 border-b border-border px-4 py-2.5"
                style={{ gridTemplateColumns: '7rem 5rem 1fr 7rem 7rem 8rem' }}>
                <span>Date</span>
                <span>Ref</span>
                <span>Description</span>
                <span className="text-right">Debit</span>
                <span className="text-right">Credit</span>
                <span className="text-right">Balance</span>
              </div>

              {/* Opening balance row */}
              <div className="grid items-center px-4 py-2 bg-muted/20 border-b border-border/50 text-xs text-muted-foreground"
                style={{ gridTemplateColumns: '7rem 5rem 1fr 7rem 7rem 8rem' }}>
                <span>{glData.from ? format(new Date(glData.from), 'd MMM yyyy') : 'All time'}</span>
                <span />
                <span className="italic">Opening balance</span>
                <span />
                <span />
                <span className="text-right font-medium text-foreground tabular-nums">{fmt(glData.openingBalance)}</span>
              </div>

              {/* Transaction rows */}
              {glData.lines.map((line, idx) => (
                <div
                  key={`${line.id}-${idx}`}
                  className={cn(
                    'grid items-start px-4 py-2.5 border-b border-border/40 text-sm hover:bg-accent/30 transition-colors',
                    line.type === 'transaction' && 'bg-blue-500/3',
                  )}
                  style={{ gridTemplateColumns: '7rem 5rem 1fr 7rem 7rem 8rem' }}
                >
                  <span className="text-xs text-muted-foreground pt-0.5">
                    {format(new Date(line.date), 'd MMM yyyy')}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground pt-0.5">
                    {line.reference || '—'}
                  </span>
                  <div className="min-w-0 pr-2">
                    <p className="font-medium truncate">{line.description}</p>
                    {line.lineDescription && (
                      <p className="text-xs text-muted-foreground italic truncate">{line.lineDescription}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                        line.type === 'journal'
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                      )}>
                        {line.type === 'journal' ? line.entryType : 'tx'}
                      </span>
                    </div>
                  </div>
                  <span className="text-right tabular-nums text-green-700 dark:text-green-400 font-medium pt-0.5">
                    {line.debit > 0 ? fmt(line.debit) : '—'}
                  </span>
                  <span className="text-right tabular-nums text-red-700 dark:text-red-400 font-medium pt-0.5">
                    {line.credit > 0 ? fmt(line.credit) : '—'}
                  </span>
                  <span className={cn(
                    'text-right tabular-nums font-semibold pt-0.5',
                    line.balance > 0  ? 'text-foreground' :
                    line.balance < 0  ? 'text-red-600 dark:text-red-400' :
                                        'text-muted-foreground',
                  )}>
                    {fmt(line.balance)}
                  </span>
                </div>
              ))}

              {/* Closing balance row */}
              <div className="grid items-center px-4 py-3 bg-muted/30 text-sm font-bold"
                style={{ gridTemplateColumns: '7rem 5rem 1fr 7rem 7rem 8rem' }}>
                <span />
                <span />
                <span className="text-foreground">Closing Balance</span>
                <span className="text-right tabular-nums text-green-700 dark:text-green-400">{fmt(glData.totalDebit)}</span>
                <span className="text-right tabular-nums text-red-700 dark:text-red-400">{fmt(glData.totalCredit)}</span>
                <span className={cn(
                  'text-right tabular-nums text-lg',
                  glData.closingBalance > 0 ? 'text-green-600' :
                  glData.closingBalance < 0 ? 'text-red-600' : 'text-muted-foreground',
                )}>
                  {fmt(glData.closingBalance)}
                </span>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Shows all posted journal lines and cleared transactions for this GL account in date order.
            Journal entries are shown as DR/CR per double-entry rules.
            Transactions marked with "tx" are cleared bank movements assigned to this GL account.
            Balance is running total from opening balance.
          </p>
        </>
      )}

      {/* ── End printable region ──────────────────────────────────────────── */}
      </PrintWrapper>
    </div>
  )
}
