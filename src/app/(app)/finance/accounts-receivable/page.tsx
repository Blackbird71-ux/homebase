'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHero } from '@/components/shared/PageHero'
import {
  CheckCircle2, AlertTriangle, ChevronDown, ChevronRight,
  Banknote, Clock, FileText, Users,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { cn, todayAU } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type AgingBucket = '0_30' | '31_60' | '61_90' | '91_plus'

interface ArItem {
  id: string
  name: string
  amount: number
  invoiceDate: string
  daysSinceInvoice: number
  bucket: AgingBucket
  vendorId: string | null
  vendorName: string | null
  categoryId: string | null
  categoryName: string | null
  categoryColor: string | null
  reference: string | null
}

interface PayerRow {
  vendorId: string | null
  vendorName: string
  '0_30': number
  '31_60': number
  '61_90': number
  '91_plus': number
  total: number
  items: ArItem[]
}

interface ArData {
  asAt: string
  hasArAccount: boolean
  glArBalance: number
  subledgerTotal: number
  difference: number
  isReconciled: boolean
  oldestDays: number
  itemCount: number
  nullDateCount: number
  totals: {
    '0_30': number
    '31_60': number
    '61_90': number
    '91_plus': number
    subledgerTotal: number
  }
  payers: PayerRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  if (n === 0) return '—'
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

function fmtCurrencyRaw(n: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

const BUCKETS: { key: AgingBucket; label: string }[] = [
  { key: '0_30',    label: '0–30 days'  },
  { key: '31_60',   label: '31–60 days' },
  { key: '61_90',   label: '61–90 days' },
  { key: '91_plus', label: '91+ days'   },
]

function agingColor(bucket: AgingBucket) {
  if (bucket === '0_30')    return 'text-foreground'
  if (bucket === '31_60')   return 'text-amber-600'
  if (bucket === '61_90')   return 'text-orange-600'
  return 'text-red-600'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AccountsReceivablePage() {
  const [asAt, setAsAt]         = useState(todayAU())
  const [data, setData]         = useState<ArData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async (date: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/finance/accounts-receivable?asAt=${date}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(asAt) }, [asAt, load])

  function togglePayer(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl">

      <PageHero title="Accounts Receivable Aging" subtitle="Outstanding invoices by age from invoice date." />
      <div className="flex flex-wrap items-center gap-4">
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-muted-foreground">As at</label>
          <input
            type="date"
            value={asAt}
            onChange={e => setAsAt(e.target.value)}
            className="text-sm border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : !data ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Failed to load report.</div>
      ) : data.itemCount === 0 && data.glArBalance === 0 && data.difference < 0.01 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No outstanding accounts receivable as at {format(parseISO(data.asAt), 'd MMMM yyyy')}.
          </p>
        </div>
      ) : (
        <>
          {/* ── Null date warning ─────────────────────────────────────────── */}
          {data.nullDateCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-500/5 px-4 py-3 flex items-center gap-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-amber-800">
                {data.nullDateCount} income entr{data.nullDateCount === 1 ? 'y' : 'ies'} marked as invoiced but missing an invoice date — excluded from this report. Please update them.
              </span>
            </div>
          )}

          {/* ── Summary cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Banknote className="h-3.5 w-3.5" /> Total AR
              </div>
              <p className="hb-stat__num hb-stat__num--money text-green-600">{fmtCurrencyRaw(data.glArBalance)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">GL control account balance</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <FileText className="h-3.5 w-3.5" /> Outstanding invoices
              </div>
              <p className="hb-stat__num">{data.itemCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.payers.length} payer{data.payers.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Clock className="h-3.5 w-3.5" /> Oldest invoice
              </div>
              <p className={cn(
                'hb-stat__num',
                data.oldestDays > 90 ? 'text-red-600'
                  : data.oldestDays > 60 ? 'text-orange-600'
                  : data.oldestDays > 30 ? 'text-amber-600'
                  : ''
              )}>
                {data.oldestDays} days
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">from invoice date</p>
            </div>
          </div>

          {/* ── Aging breakdown cards ──────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-2">
            {BUCKETS.map(b => (
              <div key={b.key} className="rounded-lg border border-border p-3">
                <p className={cn('text-xs font-medium mb-1', b.key !== '0_30' ? agingColor(b.key) : 'text-muted-foreground')}>
                  {b.label}
                </p>
                <p className={cn('text-base font-bold tabular-nums', data.totals[b.key] > 0 ? agingColor(b.key) : 'text-muted-foreground/40')}>
                  {fmtCurrency(data.totals[b.key])}
                </p>
              </div>
            ))}
          </div>

          {/* ── Aging table ───────────────────────────────────────────────── */}
          {data.payers.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_repeat(4,_100px)_110px] bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground">
                <div className="px-4 py-2.5 flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> Payer
                </div>
                {BUCKETS.map(b => (
                  <div key={b.key} className="px-2 py-2.5 text-right">{b.label}</div>
                ))}
                <div className="px-4 py-2.5 text-right">Total</div>
              </div>

              {/* Payer rows */}
              {data.payers.map(payer => {
                const key      = payer.vendorId ?? '__none__'
                const isOpen   = expanded.has(key)
                const hasItems = payer.items.length > 0
                return (
                  <div key={key} className="border-b border-border last:border-0">
                    {/* Payer summary row */}
                    <button
                      onClick={() => hasItems && togglePayer(key)}
                      className={cn(
                        'w-full grid grid-cols-[1fr_repeat(4,_100px)_110px] text-sm transition-colors',
                        hasItems ? 'hover:bg-accent/40 cursor-pointer' : 'cursor-default',
                        isOpen && 'bg-accent/20'
                      )}
                    >
                      <div className="px-4 py-2.5 flex items-center gap-2 text-left font-medium">
                        {hasItems
                          ? (isOpen
                              ? <ChevronDown  className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />)
                          : <span className="w-3.5" />
                        }
                        {payer.vendorName}
                      </div>
                      {BUCKETS.map(b => (
                        <div
                          key={b.key}
                          className={cn(
                            'px-2 py-2.5 text-right tabular-nums',
                            payer[b.key] > 0 ? agingColor(b.key) : 'text-muted-foreground/40'
                          )}
                        >
                          {fmtCurrency(payer[b.key])}
                        </div>
                      ))}
                      <div className="px-4 py-2.5 text-right font-semibold tabular-nums">
                        {fmtCurrencyRaw(payer.total)}
                      </div>
                    </button>

                    {/* Drill-down: individual income entries */}
                    {isOpen && (
                      <div className="bg-muted/20 border-t border-border/50">
                        {payer.items.map(item => (
                          <div
                            key={item.id}
                            className="grid grid-cols-[1fr_repeat(4,_100px)_110px] text-xs border-b border-border/30 last:border-0 hover:bg-accent/20"
                          >
                            <div className="px-4 py-2 pl-10 flex flex-col justify-center">
                              <span className="font-medium text-foreground">{item.name}</span>
                              <span className="text-muted-foreground mt-0.5 flex items-center gap-2">
                                Invoice {format(parseISO(item.invoiceDate), 'd MMM yyyy')}
                                {item.reference && <span className="font-mono">{item.reference}</span>}
                                {item.categoryName && <span>{item.categoryName}</span>}
                              </span>
                            </div>
                            {BUCKETS.map(b => (
                              <div
                                key={b.key}
                                className={cn(
                                  'px-2 py-2 text-right tabular-nums',
                                  item.bucket === b.key ? agingColor(b.key) : 'text-muted-foreground/30'
                                )}
                              >
                                {item.bucket === b.key ? fmtCurrencyRaw(item.amount) : '—'}
                              </div>
                            ))}
                            <div className="px-4 py-2 text-right font-medium tabular-nums">
                              {fmtCurrencyRaw(item.amount)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Totals row */}
              <div className="grid grid-cols-[1fr_repeat(4,_100px)_110px] border-t-2 border-border bg-muted/30 text-sm font-semibold">
                <div className="px-4 py-2.5 pl-10">Total</div>
                {BUCKETS.map(b => (
                  <div
                    key={b.key}
                    className={cn(
                      'px-2 py-2.5 text-right tabular-nums',
                      data.totals[b.key] > 0 ? agingColor(b.key) : 'text-muted-foreground/40'
                    )}
                  >
                    {fmtCurrency(data.totals[b.key])}
                  </div>
                ))}
                <div className="px-4 py-2.5 text-right tabular-nums">
                  {fmtCurrencyRaw(data.totals.subledgerTotal)}
                </div>
              </div>
            </div>
          )}

          {/* ── Reconciliation strip ──────────────────────────────────────── */}
          <div className={cn(
            'rounded-lg border px-4 py-3 flex items-center gap-3 text-sm',
            data.isReconciled
              ? 'border-green-200 bg-green-500/5'
              : 'border-amber-200 bg-amber-500/5'
          )}>
            {data.isReconciled
              ? <CheckCircle2  className="h-4 w-4 text-green-600 shrink-0" />
              : <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <span className="font-medium">
                {data.isReconciled ? 'Subledger reconciles to GL' : 'Reconciliation difference'}
              </span>
              <span className="text-muted-foreground ml-2 text-xs">
                GL control account: {fmtCurrencyRaw(data.glArBalance)}
                {' · '}
                Subledger: {fmtCurrencyRaw(data.subledgerTotal)}
                {!data.isReconciled && (
                  <span className="text-amber-700 ml-1 font-medium">
                    · Difference: {fmtCurrencyRaw(data.difference)}
                  </span>
                )}
              </span>
            </div>
            {!data.hasArAccount && (
              <span className="text-xs text-muted-foreground">No AR GL account found</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
