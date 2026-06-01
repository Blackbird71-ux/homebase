'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHero } from '@/components/shared/PageHero'
import {
  CheckCircle2, AlertTriangle, ChevronDown, ChevronRight,
  CalendarClock, Layers, Wallet, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/financeShared'
import { formatInTz } from '@/lib/timezone'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScheduleLine {
  id: string
  periodIndex: number
  periodDate: string
  amount: number
  posted: boolean
  postedAt: string | null
  journalReference: string | null
}

interface Schedule {
  id: string
  description: string
  billId: string | null
  totalNet: number
  coverageStart: string
  coverageEnd: string
  periodCount: number
  status: string
  postedTotal: number
  remainingTotal: number
  lines: ScheduleLine[]
}

interface PrepaymentsData {
  glPrepaidBalance: number
  subledgerRemaining: number
  difference: number
  reconciled: boolean
  schedules: Schedule[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return formatCurrency(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function statusBadge(status: string) {
  switch (status) {
    case 'active':    return { label: 'Active',    cls: 'bg-blue-500/10 text-blue-600 border-blue-200' }
    case 'completed': return { label: 'Completed', cls: 'bg-green-500/10 text-green-600 border-green-200' }
    case 'cancelled': return { label: 'Cancelled', cls: 'bg-muted text-muted-foreground border-border' }
    default:          return { label: status,      cls: 'bg-muted text-muted-foreground border-border' }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PrepaymentsPage() {
  const [data, setData]       = useState<PrepaymentsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [posting, setPosting] = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const tz = useFamilyTimezone()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/prepayments')
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function postPeriod(lineId: string) {
    setPosting(lineId)
    setError(null)
    try {
      const res = await fetch('/api/finance/prepayments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleLineId: lineId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? 'Failed to post amortisation period')
      } else {
        await load()
      }
    } catch {
      setError('Failed to post amortisation period')
    } finally {
      setPosting(null)
    }
  }

  const activeCount = data?.schedules.filter(s => s.status === 'active').length ?? 0

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl">
      <PageHero
        title="Prepayments"
        subtitle="Prepaid expenses capitalised at the tax point and amortised over their coverage period."
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-500/5 px-4 py-3 flex items-center gap-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : !data ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Failed to load prepayments.</div>
      ) : (
        <>
          {/* ── Summary cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Wallet className="h-3.5 w-3.5" /> Prepaid Expenses
              </div>
              <p className="hb-stat__num hb-stat__num--money">{fmt(data.glPrepaidBalance)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">GL control account balance</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Layers className="h-3.5 w-3.5" /> Active schedules
              </div>
              <p className="hb-stat__num">{activeCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{data.schedules.length} total</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <CalendarClock className="h-3.5 w-3.5" /> Remaining to amortise
              </div>
              <p className="hb-stat__num hb-stat__num--money">{fmt(data.subledgerRemaining)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">unposted periods</p>
            </div>
          </div>

          {/* ── Schedules ──────────────────────────────────────────────────── */}
          {data.schedules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">
                No prepayment schedules yet. A bill is capitalised here when its net cost meets the
                prepayment threshold and its coverage spans more than one month.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.schedules.map(s => {
                const isOpen = expanded.has(s.id)
                const badge = statusBadge(s.status)
                const postedCount = s.lines.filter(l => l.posted).length
                return (
                  <div key={s.id} className="rounded-lg border border-border overflow-hidden">
                    {/* Schedule header */}
                    <button
                      onClick={() => toggle(s.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40',
                        isOpen && 'bg-accent/20 border-b border-border',
                      )}
                    >
                      {isOpen
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{s.description}</span>
                          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium border', badge.cls)}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatInTz(new Date(s.coverageStart), tz, { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' – '}
                          {formatInTz(new Date(s.coverageEnd), tz, { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' · '}{postedCount}/{s.periodCount} posted
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums">{fmt(s.totalNet)}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">{fmt(s.remainingTotal)} left</p>
                      </div>
                    </button>

                    {/* Amortisation lines */}
                    {isOpen && (
                      <div className="bg-muted/10">
                        {s.lines.map(l => {
                          const future = new Date(l.periodDate).getTime() > Date.now()
                          const isPosting = posting === l.id
                          return (
                            <div
                              key={l.id}
                              className="grid grid-cols-[auto_1fr_auto_120px] items-center gap-3 px-4 py-2 text-sm border-b border-border/40 last:border-0"
                            >
                              <span className="text-xs text-muted-foreground tabular-nums w-12">
                                {l.periodIndex + 1}/{s.periodCount}
                              </span>
                              <span className="text-muted-foreground">
                                {formatInTz(new Date(l.periodDate), tz, { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                              <span className="text-right tabular-nums font-medium">{fmt(l.amount)}</span>
                              <div className="text-right">
                                {l.posted ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    {l.journalReference ?? 'Posted'}
                                  </span>
                                ) : s.status === 'cancelled' ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : (
                                  <button
                                    onClick={() => postPeriod(l.id)}
                                    disabled={isPosting || future}
                                    title={future ? 'This period has not started yet' : undefined}
                                    className={cn(
                                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                                      future
                                        ? 'border-border text-muted-foreground/50 cursor-not-allowed'
                                        : 'border-primary/30 text-primary hover:bg-primary/10',
                                      isPosting && 'opacity-60 cursor-wait',
                                    )}
                                  >
                                    {isPosting && <Loader2 className="h-3 w-3 animate-spin" />}
                                    {future ? 'Scheduled' : 'Post'}
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Reconciliation strip ───────────────────────────────────────── */}
          {data.schedules.length > 0 && (
            <div className={cn(
              'rounded-lg border px-4 py-3 flex items-center gap-3 text-sm',
              data.reconciled ? 'border-green-200 bg-green-500/5' : 'border-amber-200 bg-amber-500/5',
            )}>
              {data.reconciled
                ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                : <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />}
              <div className="flex-1 min-w-0">
                <span className="font-medium">
                  {data.reconciled ? 'Schedules reconcile to GL' : 'Reconciliation difference'}
                </span>
                <span className="text-muted-foreground ml-2 text-xs">
                  GL Prepaid Expenses: {fmt(data.glPrepaidBalance)}
                  {' · '}
                  Unposted schedule lines: {fmt(data.subledgerRemaining)}
                  {!data.reconciled && (
                    <span className="text-amber-700 ml-1 font-medium">
                      · Difference: {fmt(data.difference)}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
