'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, ArrowLeft, TrendingUp, TrendingDown, DollarSign,
  BarChart2, Building2, FileDown, Printer, Send, History, Clock,
} from 'lucide-react'
import { PageHero } from '@/components/shared/PageHero'
import {
  format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, subMonths, addMonths, subQuarters, addQuarters,
  subYears, addYears, getQuarter, getYear,
} from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getCurrentFY } from '@/lib/financeShared'
import EmailReportModal from '@/components/finance/EmailReportModal'

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'category' | 'vendor'
type PeriodMode = 'month' | 'quarter' | 'year'
type DataMode = 'forecast' | 'cash'

interface Bill {
  id: string; name: string; amount: number; frequency: string
  nextDueDate: string; paid: boolean; paidDate: string | null
  isActive: boolean; billType: string
  category: { id: string; name: string; color: string | null; type?: string } | null
  vendor: { id: string; name: string } | null
}

interface DrillItem {
  billId: string; billName: string; amount: number; periodAmount: number
  isOneOff: boolean; paid: boolean; nextDueDate: string
  categoryName: string | null; vendorName: string | null
}

interface GroupRow {
  key: string; label: string; color: string | null
  totalPeriod: number; billCount: number; bills: DrillItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a recurring bill's amount to the total spend within a given period.
 * One-off bills are NOT normalised — they contribute their face value only in
 * the period they fall due (handled by the caller).
 */
function toPeriodAmount(amount: number, frequency: string, periodMonths: number): number {
  // How many times does this frequency fire in periodMonths?
  let timesPerMonth: number
  if (frequency === 'weekly')      timesPerMonth = 52 / 12
  else if (frequency === 'fortnightly') timesPerMonth = 26 / 12
  else if (frequency === 'quarterly')   timesPerMonth = 1 / 3
  else if (frequency === 'yearly')      timesPerMonth = 1 / 12
  else                                  timesPerMonth = 1  // monthly
  return amount * timesPerMonth * periodMonths
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function getPeriodBounds(mode: PeriodMode, anchor: Date): { start: Date; end: Date; label: string } {
  if (mode === 'month') {
    return {
      start: startOfMonth(anchor),
      end: endOfMonth(anchor),
      label: format(anchor, 'MMMM yyyy'),
    }
  }
  if (mode === 'quarter') {
    return {
      start: startOfQuarter(anchor),
      end: endOfQuarter(anchor),
      label: `Q${getQuarter(anchor)} ${getYear(anchor)}`,
    }
  }
  return {
    start: startOfYear(anchor),
    end: endOfYear(anchor),
    label: `${getYear(anchor)}`,
  }
}

function navigateAnchor(mode: PeriodMode, anchor: Date, dir: -1 | 1): Date {
  if (mode === 'month')   return dir === -1 ? subMonths(anchor, 1)   : addMonths(anchor, 1)
  if (mode === 'quarter') return dir === -1 ? subQuarters(anchor, 1) : addQuarters(anchor, 1)
  return dir === -1 ? subYears(anchor, 1) : addYears(anchor, 1)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [bills, setBills]         = useState<Bill[]>([])
  const [loading, setLoading]     = useState(true)
  const [viewMode, setViewMode]   = useState<ViewMode>('category')
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [dataMode, setDataMode]   = useState<DataMode>('forecast')
  const [anchor, setAnchor]       = useState<Date>(new Date())
  const [drillKey, setDrillKey]   = useState<string | null>(null)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [showHistory, setShowHistory]       = useState(false)
  const [snapshots, setSnapshots]           = useState<any[]>([])
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/bills?includeAll=true')
      if (res.ok) setBills(await res.json())
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // Reset drill when period/view changes
  useEffect(() => { setDrillKey(null) }, [periodMode, viewMode, anchor, dataMode])

  // ── Snapshot history loader ───────────────────────────────────────────
  async function loadSnapshots() {
    setSnapshotsLoading(true)
    try {
      const res = await fetch('/api/finance/snapshots')
      if (res.ok) setSnapshots(await res.json())
    } catch { /* ignore */ }
    finally { setSnapshotsLoading(false) }
  }

  useEffect(() => {
    if (showHistory) loadSnapshots()
  }, [showHistory])

  const { start, end, label } = getPeriodBounds(periodMode, anchor)

  // ── Period multiplier ─────────────────────────────────────────────────────
  const periodMonths = periodMode === 'month' ? 1 : periodMode === 'quarter' ? 3 : 12

  // ── Bills that fall within this period ────────────────────────────────────
  // Recurring: include if active and nextDueDate <= end of period.
  // One-off:   include only if nextDueDate falls within [start, end] so
  //            they appear exactly once — not in every subsequent period.

  const relevantBills = useMemo(() => {
    const startTs = start.getTime()
    const endTs   = end.getTime()
    return bills.filter(b => {
      if (!b.isActive) return false
      if (b.category?.type === 'transfer' || b.category?.type === 'income') return false
      if (b.billType === 'transfer') return false

      if (dataMode === 'cash') {
        // Cash mode: only paid bills, slotted by paidDate
        if (!b.paid || !b.paidDate) return false
        const ts = new Date(b.paidDate).getTime()
        return ts >= startTs && ts <= endTs
      }

      // Forecast mode: slot by nextDueDate
      const dueTs = new Date(b.nextDueDate).getTime()
      if (b.billType === 'one-off') return dueTs >= startTs && dueTs <= endTs
      return dueTs <= endTs
    })
  }, [bills, start, end, dataMode])

  // ── Group by category or vendor ───────────────────────────────────────────

  const groups = useMemo((): GroupRow[] => {
    const map = new Map<string, GroupRow>()

    for (const b of relevantBills) {
      let key: string, label: string, color: string | null

      if (viewMode === 'category') {
        key   = b.category?.id ?? '__none__'
        label = b.category?.name ?? 'Uncategorised'
        color = b.category?.color ?? null
      } else {
        key   = b.vendor?.id ?? '__none__'
        label = b.vendor?.name ?? 'No vendor'
        color = null
      }

      if (!map.has(key)) {
        map.set(key, { key, label, color, totalPeriod: 0, billCount: 0, bills: [] })
      }
      const g = map.get(key)!
      const isOneOff = b.billType === 'one-off'
      // One-offs count their full amount once; recurring bills are scaled to period length
      const periodAmt = isOneOff ? b.amount : toPeriodAmount(b.amount, b.frequency, periodMonths)
      g.totalPeriod += periodAmt
      g.billCount++
      g.bills.push({
        billId: b.id,
        billName: b.name,
        amount: b.amount,
        periodAmount: periodAmt,
        isOneOff,
        paid: b.paid,
        nextDueDate: b.nextDueDate,
        categoryName: b.category?.name ?? null,
        vendorName: b.vendor?.name ?? null,
      })
    }

    return Array.from(map.values()).sort((a, b) => b.totalPeriod - a.totalPeriod)
  }, [relevantBills, viewMode, periodMonths])

  const totalPeriod  = groups.reduce((s, g) => s + g.totalPeriod, 0)
  const maxPeriod    = groups.length > 0 ? groups[0].totalPeriod : 0
  const drillGroup   = drillKey ? groups.find(g => g.key === drillKey) : null
  // Monthly average excludes one-offs (they distort recurring averages)
  const recurringMonthly = relevantBills
    .filter(b => b.billType !== 'one-off')
    .reduce((s, b) => s + toPeriodAmount(b.amount, b.frequency, periodMonths) / periodMonths, 0)

  if (loading) return <div className="p-4 text-muted-foreground">Loading reports…</div>

  return (
    <>
    <div className="space-y-5">
      <PageHero title="Reports" subtitle="Cashflow and spending breakdowns by category or vendor." />
      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Period selector */}
        <div className="flex items-center gap-1.5">
          {(['month', 'quarter', 'year'] as const).map(p => (
            <button key={p} onClick={() => setPeriodMode(p)}
              className={cn('px-2.5 py-1 text-xs font-medium rounded-full border transition-colors capitalize',
                periodMode === p ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              {p === 'month' ? 'Month' : p === 'quarter' ? 'Quarter' : 'Year'}
            </button>
          ))}
        </div>

        {/* Cash/Forecast toggle */}
        <div className="flex items-center gap-1.5" title="Cash: only paid bills by payment date. Forecast: all active bills by due date.">
          <button onClick={() => setDataMode('forecast')}
            className={cn('px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
              dataMode === 'forecast' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
            Forecast
          </button>
          <button onClick={() => setDataMode('cash')}
            className={cn('px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
              dataMode === 'cash' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
            Cash (paid)
          </button>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => setViewMode('category')}
            className={cn('px-2.5 py-1 text-xs font-medium rounded-full border transition-colors flex items-center gap-1',
              viewMode === 'category' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
            <BarChart2 className="h-3 w-3" /> By category
          </button>
          <button onClick={() => setViewMode('vendor')}
            className={cn('px-2.5 py-1 text-xs font-medium rounded-full border transition-colors flex items-center gap-1',
              viewMode === 'vendor' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
            <Building2 className="h-3 w-3" /> By vendor
          </button>
        </div>

        {/* Period navigator */}
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

        {/* ── Action buttons ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => window.open(`/api/finance/export/excel?year=${getCurrentFY()}`, '_blank')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-accent transition-colors"
            title="Download Excel report"
          >
            <FileDown className="h-3.5 w-3.5" /> Excel
          </button>
          <button
            onClick={() => window.open(`/api/finance/export/print?year=${getCurrentFY()}`, '_blank')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-accent transition-colors"
            title="Open print-friendly view"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button
            onClick={() => setEmailModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-accent transition-colors"
            title="Email report"
          >
            <Send className="h-3.5 w-3.5" /> Email
          </button>
          <button
            onClick={() => setShowHistory(v => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
              showHistory
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'
            )}
            title="View snapshot history"
          >
            <History className="h-3.5 w-3.5" /> History
          </button>
        </div>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          icon={<TrendingDown className="h-4 w-4 text-red-500" />}
          label={dataMode === 'cash' ? 'Paid bills' : 'Expected bills'}
          value={fmtCurrency(totalPeriod)}
          sub={periodMode !== 'month' ? `${fmtCurrency(recurringMonthly)}/mo recurring` : dataMode === 'cash' ? 'confirmed payments' : undefined}
          colorClass="text-red-600"
        />
        <SummaryCard
          icon={<BarChart2 className="h-4 w-4 text-primary" />}
          label={viewMode === 'category' ? 'Categories' : 'Vendors'}
          value={String(groups.length)}
          sub="with active bills"
          colorClass="text-primary"
        />
        <SummaryCard
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          label="Active bills"
          value={String(relevantBills.length)}
          sub={`${relevantBills.filter(b => b.paid).length} paid`}
          colorClass="text-foreground"
        />
      </div>

      {/* ── Drill-down panel ──────────────────────────────────────────────── */}
      {drillGroup ? (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setDrillKey(null)}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="font-semibold text-sm">{drillGroup.label}</span>
            {drillGroup.color && (
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: drillGroup.color }} />
            )}
            <span className="text-sm text-muted-foreground ml-auto font-medium">
              {fmtCurrency(drillGroup.totalPeriod)}
            </span>
          </div>
          <div className="space-y-1.5">
            {drillGroup.bills.map(bill => (
              <div key={bill.billId}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{bill.billName}</span>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                    {viewMode === 'category' && bill.vendorName && <span>{bill.vendorName}</span>}
                    {viewMode === 'vendor' && bill.categoryName && <span>{bill.categoryName}</span>}
                    <span>Due {format(new Date(bill.nextDueDate), 'd MMM yyyy')}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{fmtCurrency(bill.amount)}</p>
                  {!bill.isOneOff && bill.periodAmount !== bill.amount && (
                    <p className="text-xs text-muted-foreground">{fmtCurrency(bill.periodAmount)} this {periodMode}</p>
                  )}
                </div>
                {bill.isOneOff && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-500/10 text-orange-600">one-off</span>
                )}
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                  bill.paid ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600')}>
                  {bill.paid ? 'Paid' : 'Due'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ── Group list ────────────────────────────────────────────────────── */
        groups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">No active bills found for this period.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pb-1 border-b border-border">
              <span>{viewMode === 'category' ? 'Category' : 'Vendor'}</span>
              <span>{periodMode === 'month' ? 'This month' : periodMode === 'quarter' ? 'This quarter' : 'This year'}</span>
            </div>
            {groups.map(g => {
              const pct = maxPeriod > 0 ? (g.totalPeriod / maxPeriod) * 100 : 0
              return (
                <button key={g.key} onClick={() => setDrillKey(g.key)}
                  className="w-full text-left hover:bg-accent/50 rounded-md p-1.5 -mx-1.5 transition-colors group">
                  <div className="flex items-center gap-2 mb-1.5">
                    {g.color
                      ? <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                      : <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 shrink-0" />}
                    <span className="text-sm flex-1 font-medium">{g.label}</span>
                    <span className="text-xs text-muted-foreground">{g.billCount} bill{g.billCount !== 1 ? 's' : ''}</span>
                    <span className="text-sm font-semibold min-w-[80px] text-right">{fmtCurrency(g.totalPeriod)}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: g.color ?? '#6366F1',
                      }} />
                  </div>
                </button>
              )
            })}
            <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
              <span className="text-muted-foreground font-medium">Total</span>
              <span className="font-bold">{fmtCurrency(totalPeriod)}</span>
            </div>
          </div>
        )
      )}

      {/* ── Snapshot history panel ──────────────────────────────────────────── */}
      {showHistory && (
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Snapshot History
            </h3>
            <span className="text-xs text-muted-foreground">
              {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
            </span>
          </div>

          {snapshotsLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading snapshots…</p>
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No snapshots yet. Snapshots are created automatically when you email a report or the monthly scheduler runs.
            </p>
          ) : (
            <div className="space-y-2">
              {snapshots.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="text-sm font-medium">{s.periodLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.financialYear} &middot; {s.monthsComplete} of 12 months
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{s._count?.emails ?? 0} email(s)</span>
                    <button
                      onClick={() => window.open(`/api/finance/export/excel?snapshotId=${s.id}`, '_blank')}
                      className="p-1.5 hover:bg-accent rounded text-xs text-muted-foreground"
                      title="Download snapshot as Excel"
                    >
                      <FileDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>

    <EmailReportModal
      open={emailModalOpen}
      onClose={() => setEmailModalOpen(false)}
      familyId=""
    />
    </>
  )
}

function SummaryCard({ icon, label, value, sub, colorClass }: {
  icon: React.ReactNode; label: string; value: string
  sub?: string; colorClass: string
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon} {label}
      </div>
      <p className={cn('text-xl font-bold', colorClass)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}
