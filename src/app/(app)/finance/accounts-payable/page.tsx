'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  CheckCircle2, AlertTriangle, ChevronDown, ChevronRight,
  CreditCard, Clock, FileText, Building2, ExternalLink,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { cn, todayAU } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type AgingBucket = '0_30' | '31_60' | '61_90' | '91_plus'

interface Entity {
  id: string
  name: string
  type: string
  isDefault: boolean
  color: string | null
}

interface ApItem {
  id: string
  name: string
  originalAmount: number
  paymentsToDate: number
  amount: number
  invoiceDate: string
  nextDueDate: string | null
  daysSinceInvoice: number
  bucket: AgingBucket
  vendorId: string | null
  vendorName: string | null
  categoryId: string | null
  categoryName: string | null
  categoryColor: string | null
  reference: string | null
}

interface VendorRow {
  vendorId: string | null
  vendorName: string
  '0_30': number
  '31_60': number
  '61_90': number
  '91_plus': number
  total: number
  items: ApItem[]
}

interface ApData {
  asAt: string
  entityId: string | null
  hasApAccount: boolean
  glApBalance: number
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
  vendors: VendorRow[]
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

export default function AccountsPayablePage() {
  const [asAt, setAsAt]         = useState(todayAU())
  const [entityId, setEntityId] = useState('')
  const [entities, setEntities] = useState<Entity[]>([])
  const [data, setData]         = useState<ApData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Load entities once on mount
  useEffect(() => {
    fetch('/api/finance/entities')
      .then(r => r.ok ? r.json() : [])
      .then(setEntities)
      .catch(() => {})
  }, [])

  const load = useCallback(async (date: string, eid: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ asAt: date })
      if (eid) params.set('entityId', eid)
      const res = await fetch(`/api/finance/accounts-payable?${params}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(asAt, entityId) }, [asAt, entityId, load])

  // Reset drill-down expansion when filters change
  useEffect(() => { setExpanded(new Set()) }, [asAt, entityId])

  function toggleVendor(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-lg font-semibold">Accounts Payable Aging</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Outstanding invoices by age from invoice date
          </p>
        </div>
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

      {/* ── Entity filter ───────────────────────────────────────────────────── */}
      {entities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setEntityId('')}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
              !entityId
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            All entities
          </button>
          {entities.map(en => (
            <button
              key={en.id}
              onClick={() => setEntityId(entityId === en.id ? '' : en.id)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
                entityId === en.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {en.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : !data ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Failed to load report.</div>
      ) : data.itemCount === 0 && data.glApBalance === 0 && data.difference < 0.01 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">No outstanding accounts payable as at {format(parseISO(data.asAt), 'd MMMM yyyy')}.</p>
        </div>
      ) : (
        <>
          {/* ── Summary cards ────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <CreditCard className="h-3.5 w-3.5" /> Total AP
              </div>
              <p className="text-xl font-bold text-red-600">{fmtCurrencyRaw(data.glApBalance)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">GL control account balance</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <FileText className="h-3.5 w-3.5" /> Outstanding invoices
              </div>
              <p className="text-xl font-bold">{data.itemCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{data.vendors.length} vendor{data.vendors.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Clock className="h-3.5 w-3.5" /> Oldest invoice
              </div>
              <p className={cn('text-xl font-bold', data.oldestDays > 90 ? 'text-red-600' : data.oldestDays > 60 ? 'text-orange-600' : data.oldestDays > 30 ? 'text-amber-600' : '')}>
                {data.oldestDays} days
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">from invoice date</p>
            </div>
          </div>

          {/* ── Data integrity warning ────────────────────────────────────────── */}
          {(data.nullDateCount ?? 0) > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-500/5 px-4 py-3 flex items-center gap-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-amber-800">
                <span className="font-medium">{data.nullDateCount} bill{data.nullDateCount !== 1 ? 's' : ''} excluded</span>
                {' — '}marked as invoice received but missing an invoice date. Open each bill and set the invoice date to include {data.nullDateCount !== 1 ? 'them' : 'it'} in this report.
              </span>
            </div>
          )}

          {/* ── Aging table ───────────────────────────────────────────────── */}
          {data.vendors.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_repeat(4,_100px)_110px] bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground">
                <div className="px-4 py-2.5 flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" /> Vendor
                </div>
                {BUCKETS.map(b => (
                  <div key={b.key} className="px-2 py-2.5 text-right">{b.label}</div>
                ))}
                <div className="px-4 py-2.5 text-right">Total</div>
              </div>

              {/* Vendor rows */}
              {data.vendors.map(vendor => {
                const key      = vendor.vendorId ?? '__none__'
                const isOpen   = expanded.has(key)
                const hasItems = vendor.items.length > 0
                return (
                  <div key={key} className="border-b border-border last:border-0">
                    {/* Vendor summary row */}
                    <button
                      onClick={() => hasItems && toggleVendor(key)}
                      className={cn(
                        'w-full grid grid-cols-[1fr_repeat(4,_100px)_110px] text-sm transition-colors',
                        hasItems ? 'hover:bg-accent/40 cursor-pointer' : 'cursor-default',
                        isOpen && 'bg-accent/20'
                      )}
                    >
                      <div className="px-4 py-2.5 flex items-center gap-2 text-left font-medium">
                        {hasItems
                          ? (isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />)
                          : <span className="w-3.5" />
                        }
                        {vendor.vendorName}
                      </div>
                      {BUCKETS.map(b => (
                        <div key={b.key} className={cn('px-2 py-2.5 text-right tabular-nums', vendor[b.key] > 0 ? agingColor(b.key) : 'text-muted-foreground/40')}>
                          {fmtCurrency(vendor[b.key])}
                        </div>
                      ))}
                      <div className="px-4 py-2.5 text-right font-semibold tabular-nums">
                        {fmtCurrencyRaw(vendor.total)}
                      </div>
                    </button>

                    {/* Drill-down: individual bills */}
                    {isOpen && (
                      <div className="bg-muted/20 border-t border-border/50">
                        {vendor.items.map(item => (
                          <div
                            key={item.id}
                            className="grid grid-cols-[1fr_repeat(4,_100px)_110px] text-xs border-b border-border/30 last:border-0 hover:bg-accent/20"
                          >
                            <div className="px-4 py-2 pl-10 flex flex-col justify-center">
                              <span className="font-medium text-foreground flex items-center gap-1">
                                {item.name}
                                <a
                                  href="/finance/bills"
                                  title="Go to bills"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </span>
                              <span className="text-muted-foreground mt-0.5 flex items-center gap-2">
                                Invoice {format(parseISO(item.invoiceDate), 'd MMM yyyy')}
                                {item.nextDueDate && (
                                  <span>Due {format(parseISO(item.nextDueDate), 'd MMM yyyy')}</span>
                                )}
                                {item.reference && <span className="font-mono">{item.reference}</span>}
                                {item.categoryName && <span>{item.categoryName}</span>}
                                {item.paymentsToDate > 0 && (
                                  <span className="text-green-600 font-medium">
                                    {fmtCurrencyRaw(item.paymentsToDate)} paid
                                  </span>
                                )}
                              </span>
                            </div>
                            {BUCKETS.map(b => (
                              <div key={b.key} className={cn('px-2 py-2 text-right tabular-nums', item.bucket === b.key ? agingColor(b.key) : 'text-muted-foreground/30')}>
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
                  <div key={b.key} className={cn('px-2 py-2.5 text-right tabular-nums', data.totals[b.key] > 0 ? agingColor(b.key) : 'text-muted-foreground/40')}>
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
              ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              : <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <span className="font-medium">
                {data.isReconciled ? 'Subledger reconciles to GL' : 'Reconciliation difference'}
              </span>
              <span className="text-muted-foreground ml-2 text-xs">
                GL control account: {fmtCurrencyRaw(data.glApBalance)}
                {' · '}
                Subledger: {fmtCurrencyRaw(data.subledgerTotal)}
                {!data.isReconciled && (
                  <span className="text-amber-700 ml-1 font-medium">
                    · Difference: {fmtCurrencyRaw(data.difference)}
                  </span>
                )}
              </span>
            </div>
            {!data.hasApAccount && (
              <span className="text-xs text-muted-foreground">No AP GL account found</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
