'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'
import {
  X, BookOpen, ArrowUpRight, ArrowDownLeft, Minus,
  FileText, CreditCard, Loader2, AlertCircle, Download, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type LedgerData, type LedgerRow, type DatePreset,
  fmtDate, buildPresets, exportCsv,
} from './account-ledger-helpers'

// ─── Props ────────────────────────────────────────────────────────────────────

interface AccountLedgerPanelProps {
  categoryId: string | null
  categoryName: string
  onClose: () => void
  fyStartMonth?: number  // 1-based, from family settings. Default 7 (July).
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const AUD = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
const fmt = (n: number) => AUD.format(n)

// ─── Component ────────────────────────────────────────────────────────────────

export default function AccountLedgerPanel({
  categoryId,
  categoryName,
  onClose,
  fyStartMonth = 7,
}: AccountLedgerPanelProps) {
  const presets = buildPresets(fyStartMonth)

  const [data,          setData]          = useState<LedgerData | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [selectedPreset, setSelectedPreset] = useState(0)       // index into presets[]
  const [dateFrom,      setDateFrom]      = useState(presets[0].from)
  const [dateTo,        setDateTo]        = useState(presets[0].to)
  const [showPresets,   setShowPresets]   = useState(false)
  const [showCustom,    setShowCustom]    = useState(false)
  const [customFrom,    setCustomFrom]    = useState('')
  const [customTo,      setCustomTo]      = useState('')

  const presetsRef = useRef<HTMLDivElement>(null)

  useClickOutside(presetsRef, () => setShowPresets(false))

  // Escape key closes panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Fetch data whenever categoryId or dates change
  const fetchLedger = useCallback(async (catId: string, from: string, to: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/finance/categories/${catId}/ledger?from=${from}&to=${to}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setData(await res.json())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load ledger')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (categoryId && dateFrom && dateTo) {
      fetchLedger(categoryId, dateFrom, dateTo)
    }
  }, [categoryId, dateFrom, dateTo, fetchLedger])

  // Reset state when panel is closed/opened with a different category
  useEffect(() => {
    if (!categoryId) {
      setData(null)
      setError(null)
    }
  }, [categoryId])

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handlePresetSelect(idx: number) {
    setShowPresets(false)
    const preset = presets[idx]
    if (!preset.from) {
      // "Custom…"
      setShowCustom(true)
      setCustomFrom(dateFrom)
      setCustomTo(dateTo)
      return
    }
    setShowCustom(false)
    setSelectedPreset(idx)
    setDateFrom(preset.from)
    setDateTo(preset.to)
  }

  function handleApplyCustom() {
    if (!customFrom || !customTo) return
    if (customFrom > customTo) {
      setError('"From" date must be on or before "To" date')
      return
    }
    setError(null)
    setShowCustom(false)
    setSelectedPreset(-1)
    setDateFrom(customFrom)
    setDateTo(customTo)
  }

  const isOpen = !!categoryId

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-[75] bg-black/50 transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Account ledger — ${categoryName}`}
        className={cn(
          'fixed right-0 top-0 z-[80] flex h-full w-full flex-col bg-background shadow-2xl border-l border-border',
          'transition-transform duration-300 ease-in-out',
          'sm:w-[800px] lg:w-[920px]',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-start justify-between border-b bg-muted/30 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground mb-0.5">
              <BookOpen className="h-3.5 w-3.5" />
              Account Ledger
            </div>
            <h2 className="text-xl font-semibold tracking-tight truncate">
              {data?.category.glCode && (
                <span className="mr-2 font-mono text-sm text-muted-foreground">
                  {data.category.glCode}
                </span>
              )}
              {categoryName}
            </h2>
            {data && (
              <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                {data.category.type.replace(/_/g, ' ')} ·{' '}
                {data.category.normalBalance === 'debit' ? 'Debit-normal' : 'Credit-normal'}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 ml-4 shrink-0">
            {data && (
              <button
                onClick={() => exportCsv(data)}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                title="Export to CSV"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-1.5 hover:bg-muted transition-colors"
              aria-label="Close ledger"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Date range controls ─────────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-5 py-3 bg-background">
          {/* Preset selector */}
          <div className="relative" ref={presetsRef}>
            <button
              onClick={() => setShowPresets(v => !v)}
              className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors shadow-sm"
            >
              {selectedPreset >= 0 ? presets[selectedPreset].label : 'Custom range'}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {showPresets && (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-[190px] rounded-lg border border-border bg-popover shadow-lg py-1">
                {presets.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => handlePresetSelect(i)}
                    className={cn(
                      'flex w-full items-center px-3 py-2 text-sm hover:bg-muted transition-colors text-left',
                      selectedPreset === i && 'font-semibold text-primary'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Custom date inputs */}
          {showCustom ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={handleApplyCustom}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Apply
              </button>
              <button
                onClick={() => setShowCustom(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              {dateFrom && dateTo ? `${fmtDate(dateFrom)} → ${fmtDate(dateTo)}` : ''}
            </span>
          )}

          {data && !loading && (
            <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {data.rows.length} {data.rows.length === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>

        {/* ── Body ────────────────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto">

          {/* Loading */}
          {loading && (
            <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading ledger…</span>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="m-5 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive">Failed to load ledger</p>
                <p className="text-xs text-muted-foreground mt-0.5 break-words">{error}</p>
              </div>
              <button
                onClick={() => categoryId && fetchLedger(categoryId, dateFrom, dateTo)}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted transition-colors shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* Ledger content */}
          {data && !loading && !error && (
            <div className="pb-8">

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4 px-5 py-4 border-b bg-muted/10">
                <SummaryCard label="Opening Balance" value={data.openingBalance} />
                <SummaryCard label="Total Debits"   value={data.totals.totalDebits}   variant="debit"  />
                <SummaryCard label="Total Credits"  value={data.totals.totalCredits}  variant="credit" />
              </div>

              {/* Empty state */}
              {data.rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <BookOpen className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm font-medium text-muted-foreground">No activity in this period</p>
                  <p className="text-xs text-muted-foreground/60">
                    Opening balance: {fmt(data.openingBalance)}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/20 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="px-5 py-2.5 text-left whitespace-nowrap">Date</th>
                        <th className="px-4 py-2.5 text-left">Description</th>
                        <th className="px-3 py-2.5 text-left hidden md:table-cell whitespace-nowrap">Ref</th>
                        <th className="px-3 py-2.5 text-center hidden lg:table-cell whitespace-nowrap">Source</th>
                        <th className="px-4 py-2.5 text-right whitespace-nowrap">Debit</th>
                        <th className="px-4 py-2.5 text-right whitespace-nowrap">Credit</th>
                        <th className="px-5 py-2.5 text-right whitespace-nowrap">Balance</th>
                      </tr>
                    </thead>
                    <tbody>

                      {/* Opening balance row */}
                      <tr className="border-b bg-blue-500/5 text-xs text-muted-foreground">
                        <td className="px-5 py-2 whitespace-nowrap">{fmtDate(data.dateFrom)}</td>
                        <td className="px-4 py-2 font-medium italic text-foreground/60">
                          Opening Balance b/f
                        </td>
                        <td className="hidden px-3 py-2 md:table-cell" />
                        <td className="hidden px-3 py-2 lg:table-cell" />
                        <td className="px-4 py-2 text-right" />
                        <td className="px-4 py-2 text-right" />
                        <td className="px-5 py-2 text-right font-mono font-semibold text-foreground">
                          {fmt(data.openingBalance)}
                        </td>
                      </tr>

                      {/* Data rows */}
                      {data.rows.map((row, i) => (
                        <LedgerRowItem key={row.id} row={row} index={i} />
                      ))}
                    </tbody>

                    {/* Closing balance footer */}
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                        <td className="px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                          {fmtDate(data.dateTo)}
                        </td>
                        <td className="px-4 py-3 font-semibold">Closing Balance c/f</td>
                        <td className="hidden px-3 py-3 md:table-cell" />
                        <td className="hidden px-3 py-3 lg:table-cell" />
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {data.totals.totalDebits > 0 ? fmt(data.totals.totalDebits) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {data.totals.totalCredits > 0 ? fmt(data.totals.totalCredits) : '—'}
                        </td>
                        <td className={cn(
                          'px-5 py-3 text-right font-mono text-base font-bold',
                          data.totals.closingBalance < 0 ? 'text-destructive' : 'text-foreground'
                        )}>
                          {fmt(data.totals.closingBalance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  variant,
}: {
  label: string
  value: number
  variant?: 'debit' | 'credit'
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn(
        'mt-1 font-bold font-mono text-lg',
        variant === 'debit'  && 'text-orange-500 dark:text-orange-400',
        variant === 'credit' && 'text-green-600 dark:text-green-400',
        !variant             && 'text-foreground',
      )}>
        {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)}
      </p>
    </div>
  )
}

// ─── Ledger row ───────────────────────────────────────────────────────────────

function LedgerRowItem({ row, index }: { row: LedgerRow; index: number }) {
  const isJournal = row.source === 'journal'
  const hasDebit  = row.debit  > 0
  const hasCredit = row.credit > 0

  return (
    <tr className={cn(
      'group border-b transition-colors hover:bg-accent/40',
      index % 2 !== 0 && 'bg-muted/10',
      !row.isCleared  && 'opacity-60',
    )}>
      {/* Date */}
      <td className="px-5 py-2.5 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
        {fmtDate(row.date)}
      </td>

      {/* Description + metadata */}
      <td className="px-4 py-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium truncate max-w-[240px]" title={row.description}>
            {row.description}
          </span>
          <div className="flex items-center gap-2">
            {row.vendor && row.vendor !== row.description && (
              <span className="text-xs text-muted-foreground truncate max-w-[180px]">{row.vendor}</span>
            )}
            {!row.isCleared && (
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded px-1.5 py-0.5">
                PENDING
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Reference */}
      <td className="hidden px-3 py-2.5 md:table-cell">
        {row.reference && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {row.reference}
          </span>
        )}
      </td>

      {/* Source badge */}
      <td className="hidden px-3 py-2.5 lg:table-cell">
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border',
          isJournal
            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
            : 'bg-blue-500/10   text-blue-600   dark:text-blue-400   border-blue-500/20',
        )}>
          {isJournal
            ? <><FileText className="h-2.5 w-2.5" /> JNL</>
            : <><CreditCard className="h-2.5 w-2.5" /> TX</>
          }
        </span>
      </td>

      {/* Debit */}
      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
        {hasDebit ? (
          <span className="inline-flex items-center justify-end gap-0.5 text-orange-600 dark:text-orange-400">
            <ArrowUpRight className="h-3 w-3 shrink-0" />
            {AUD.format(row.debit)}
          </span>
        ) : (
          <Minus className="ml-auto h-3 w-3 text-muted-foreground/30" />
        )}
      </td>

      {/* Credit */}
      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
        {hasCredit ? (
          <span className="inline-flex items-center justify-end gap-0.5 text-green-600 dark:text-green-400">
            <ArrowDownLeft className="h-3 w-3 shrink-0" />
            {AUD.format(row.credit)}
          </span>
        ) : (
          <Minus className="ml-auto h-3 w-3 text-muted-foreground/30" />
        )}
      </td>

      {/* Running balance */}
      <td className={cn(
        'px-5 py-2.5 text-right font-mono tabular-nums font-semibold',
        row.balance < 0 ? 'text-destructive' : 'text-foreground',
      )}>
        {AUD.format(row.balance)}
      </td>
    </tr>
  )
}
