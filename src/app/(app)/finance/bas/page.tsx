'use client'

import { useEffect, useState, useRef } from 'react'
import { ChevronLeft, ChevronRight, FileText, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { PageHero } from '@/components/shared/PageHero'
import { cn } from '@/lib/utils'
import { fyStartYear, fyLabel, monthRangeInTz } from '@/lib/finance-fy'
import { PrintButton } from '@/components/print/PrintButton'
import { PrintWrapper } from '@/components/print/PrintWrapper'

// ── Types ────────────────────────────────────────────────────────────────────

interface GstLine {
  journalEntryId: string
  reference:      string | null
  date:           string
  description:    string
  entryType:      string
  glAccountId:    string
  glAccountName:  string
  amount:         number
  side:           string
  entityId:       string | null
  entityName:     string | null
}

interface BasData {
  hasGstAccounts: boolean
  error?:         string
  period?: {
    from:  string
    to:    string
    label: string
  }
  summary?: {
    g1:     number
    oneA:   number
    oneB:   number
    netGst: number
  }
  lines?: {
    sales:     GstLine[]
    purchases: GstLine[]
  }
  entityId?: string | null
}

// ── Quarter navigation helpers ────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function basQuarterDates(fyYear: number, fyStartMonth: number, qIdx: number): { from: string; to: string; label: string } {
  const startMonthAbs = (fyStartMonth - 1) + qIdx * 3
  const startCalYear  = fyYear + Math.floor(startMonthAbs / 12)
  const startMonth1   = (startMonthAbs % 12) + 1
  const endMonthAbs   = startMonthAbs + 2
  const endCalYear    = fyYear + Math.floor(endMonthAbs / 12)
  const endMonth1     = (endMonthAbs % 12) + 1

  const pad = (n: number) => String(n).padStart(2, '0')
  const endDay = new Date(endCalYear, endMonth1, 0).getDate() // last day of end month
  return {
    from:  `${startCalYear}-${pad(startMonth1)}-01`,
    to:    `${endCalYear}-${pad(endMonth1)}-${pad(endDay)}`,
    label: `Q${qIdx + 1} ${MONTHS[startMonth1 - 1]}–${MONTHS[endMonth1 - 1]} ${fyLabel(fyYear, fyStartMonth)}`,
  }
}

function currentQuarterIndex(fyStartMonth: number): { fyYear: number; qIdx: number } {
  const now = new Date()
  const fyYear = fyStartYear(now, fyStartMonth)
  const todayM1 = now.getMonth() + 1
  const monthsFromFyStart = (todayM1 - fyStartMonth + 12) % 12
  return { fyYear, qIdx: Math.floor(monthsFromFyStart / 3) }
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
}

function fmtDate(s: string): string {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BasPage() {
  const [fyStartMonth, setFyStartMonth] = useState(7)
  const [fyYear, setFyYear]   = useState(() => currentQuarterIndex(7).fyYear)
  const [qIdx,   setQIdx]     = useState(() => currentQuarterIndex(7).qIdx)
  const [tab,    setTab]      = useState<'sales' | 'purchases'>('sales')
  const [data,   setData]     = useState<BasData | null>(null)
  const [loading, setLoading] = useState(true)
  const printRef = useRef<HTMLDivElement>(null)

  // Load family FY start month once
  useEffect(() => {
    fetch('/api/settings/family')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const fsm = d?.financeYearStartMonth ?? 7
        setFyStartMonth(fsm)
        const { fyYear: fy, qIdx: qi } = currentQuarterIndex(fsm)
        setFyYear(fy)
        setQIdx(qi)
      })
      .catch(() => {})
  }, [])

  // Load BAS data when period changes
  useEffect(() => {
    const { from, to } = basQuarterDates(fyYear, fyStartMonth, qIdx)
    setLoading(true)
    fetch(`/api/finance/bas?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [fyYear, fyStartMonth, qIdx])

  function prevQuarter() {
    if (qIdx === 0) { setFyYear(y => y - 1); setQIdx(3) }
    else setQIdx(q => q - 1)
  }
  function nextQuarter() {
    if (qIdx === 3) { setFyYear(y => y + 1); setQIdx(0) }
    else setQIdx(q => q + 1)
  }

  const { from, to, label } = basQuarterDates(fyYear, fyStartMonth, qIdx)

  const summary = data?.summary
  const lines   = data?.lines

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      <PageHero
        title="BAS Worksheet"
        subtitle="GST activity statement figures sourced from the posted General Ledger."
        actions={<PrintButton printRef={printRef} reportTitle="BAS Worksheet" />}
      />

      {/* ── Quarter navigation ── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={prevQuarter}
          className="h-8 w-8 rounded-md border border-border bg-background flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{fmtDate(from)} – {fmtDate(to)}</p>
        </div>
        <button
          type="button"
          onClick={nextQuarter}
          className="h-8 w-8 rounded-md border border-border bg-background flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── No GST accounts warning ── */}
      {!loading && data && !data.hasGstAccounts && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-medium mb-1">GST accounts not configured</p>
          <p className="text-xs">{data.error}</p>
        </div>
      )}

      {/* ── BAS Summary cards ── */}
      {data?.hasGstAccounts && (
        <PrintWrapper ref={printRef} reportTitle="BAS Worksheet" dateRange={`${fmtDate(from)} – ${fmtDate(to)}`}>
          <div className="print:block">
            <div className="print:hidden hidden md:block mb-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">BAS Summary — {label}</p>
            </div>

            {/* Summary grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <SummaryCard
                label="G1 — Total sales (inc GST)"
                value={summary?.g1 ?? 0}
                description="Net income + GST collected"
                loading={loading}
                variant="neutral"
              />
              <SummaryCard
                label="1A — GST on sales"
                value={summary?.oneA ?? 0}
                description="GST collected from customers"
                loading={loading}
                variant="negative"
              />
              <SummaryCard
                label="1B — GST input tax credits"
                value={summary?.oneB ?? 0}
                description="GST credits from purchases"
                loading={loading}
                variant="positive"
              />
              <SummaryCard
                label="Net GST"
                value={summary?.netGst ?? 0}
                description={(summary?.netGst ?? 0) >= 0 ? 'Payable to ATO' : 'Refundable from ATO'}
                loading={loading}
                variant={(summary?.netGst ?? 0) >= 0 ? 'negative' : 'positive'}
                highlight
              />
            </div>

            {/* ── BAS form layout ── */}
            <div className="rounded-lg border border-border overflow-hidden mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs w-16">Field</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Description</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <BasRow code="G1" label="Total sales (including GST and GST-free)" amount={summary?.g1 ?? 0} loading={loading} />
                  <BasRow code="1A" label="GST on sales" amount={summary?.oneA ?? 0} loading={loading} bold />
                  <BasRow code="1B" label="GST on purchases (input tax credits)" amount={summary?.oneB ?? 0} loading={loading} bold />
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td className="px-4 py-3 font-semibold text-xs">Net</td>
                    <td className="px-4 py-3 text-xs">
                      {(summary?.netGst ?? 0) >= 0 ? (
                        <span className="text-destructive font-medium">GST payable to ATO (1A − 1B)</span>
                      ) : (
                        <span className="text-emerald-600 font-medium">GST refundable from ATO (1B − 1A)</span>
                      )}
                    </td>
                    <td className={cn(
                      'px-4 py-3 text-right font-bold',
                      (summary?.netGst ?? 0) >= 0 ? 'text-destructive' : 'text-emerald-600',
                    )}>
                      {loading ? '—' : fmt(Math.abs(summary?.netGst ?? 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Transaction breakdown ── */}
            <div>
              <div className="flex gap-1 mb-3 print:hidden">
                <TabButton active={tab === 'sales'} onClick={() => setTab('sales')}>
                  Sales GST ({lines?.sales.length ?? 0})
                </TabButton>
                <TabButton active={tab === 'purchases'} onClick={() => setTab('purchases')}>
                  Purchases GST ({lines?.purchases.length ?? 0})
                </TabButton>
              </div>

              {/* Sales lines */}
              <div className={tab === 'sales' ? '' : 'hidden print:block'}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 print:block hidden">
                  Sales GST (1A)
                </p>
                <LineTable lines={lines?.sales ?? []} loading={loading} emptyMsg="No GST collected on sales in this period." />
              </div>

              {/* Purchases lines */}
              <div className={tab === 'purchases' ? '' : 'hidden print:block'}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 print:block hidden">
                  Purchases GST (1B)
                </p>
                <LineTable lines={lines?.purchases ?? []} loading={loading} emptyMsg="No GST input tax credits on purchases in this period." />
              </div>
            </div>

            <div className="print:block hidden mt-6 text-xs text-muted-foreground">
              <p>Period: {fmtDate(from)} – {fmtDate(to)}</p>
              <p>All figures sourced from posted General Ledger journal lines.</p>
            </div>
          </div>
        </PrintWrapper>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, description, loading, variant, highlight,
}: {
  label: string
  value: number
  description: string
  loading: boolean
  variant: 'positive' | 'negative' | 'neutral'
  highlight?: boolean
}) {
  const valueClass = variant === 'positive'
    ? 'text-emerald-600 dark:text-emerald-400'
    : variant === 'negative'
    ? 'text-destructive'
    : 'text-foreground'

  return (
    <div className={cn(
      'rounded-lg border border-border bg-card p-3 flex flex-col gap-1',
      highlight && 'border-primary/30 bg-primary/5',
    )}>
      <p className="hb-stat__label">{label}</p>
      <p className={cn('hb-stat__num hb-stat__num--money', valueClass)}>
        {loading ? <span className="text-muted-foreground">—</span> : fmt(value)}
      </p>
      <p className="text-[10px] text-muted-foreground">{description}</p>
    </div>
  )
}

function BasRow({
  code, label, amount, loading, bold,
}: {
  code: string
  label: string
  amount: number
  loading: boolean
  bold?: boolean
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className={cn('px-4 py-2.5 text-xs font-mono', bold && 'font-semibold')}>{code}</td>
      <td className={cn('px-4 py-2.5 text-xs', bold && 'font-medium')}>{label}</td>
      <td className={cn('px-4 py-2.5 text-right text-xs tabular-nums', bold && 'font-semibold')}>
        {loading ? '—' : fmt(amount)}
      </td>
    </tr>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-md text-sm transition-colors',
        active
          ? 'bg-primary text-primary-foreground font-medium'
          : 'bg-muted text-muted-foreground hover:bg-muted/80',
      )}
    >
      {children}
    </button>
  )
}

function LineTable({ lines, loading, emptyMsg }: { lines: GstLine[]; loading: boolean; emptyMsg: string }) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }
  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        {emptyMsg}
      </div>
    )
  }

  const total = lines.reduce((s, l) => s + l.amount, 0)

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Date</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Description</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Ref</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">GST</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={`${line.journalEntryId}-${line.side}`} className="border-b border-border last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                {fmtDate(line.date)}
              </td>
              <td className="px-3 py-2 text-xs">
                <span>{line.description}</span>
                {line.entityName && (
                  <span className="ml-1 text-muted-foreground">· {line.entityName}</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell font-mono">
                {line.reference ?? '—'}
              </td>
              <td className="px-3 py-2 text-right text-xs tabular-nums font-medium">
                {fmt(line.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/30">
            <td colSpan={3} className="px-3 py-2 text-xs font-semibold">Total</td>
            <td className="px-3 py-2 text-right text-xs font-bold tabular-nums">
              {fmt(Math.round(total * 100) / 100)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
