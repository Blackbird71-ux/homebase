'use client'

import { useEffect, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { PrintButton } from '@/components/print/PrintButton'
import { PageHero } from '@/components/shared/PageHero'
import { PrintWrapper } from '@/components/print/PrintWrapper'
import { formatCurrency } from '@/lib/financeShared'

// ── Types ────────────────────────────────────────────────────────────────────

interface Vendor {
  id:   string
  name: string
}

interface StatementLine {
  id:          string
  date:        string
  type:        'invoice' | 'payment' | 'receipt'
  description: string
  reference:   string | null
  charges:     number | null
  payments:    number | null
  balance:     number
}

interface StatementData {
  vendor:         Vendor
  type:           'ap' | 'ar'
  period:         { from: string; to: string }
  openingBalance: number
  lines:          StatementLine[]
  closingBalance: number
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return formatCurrency(n)
}

function fmtDate(s: string): string {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

function firstOfMonthIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VendorStatementPage() {
  const [vendors,   setVendors]   = useState<Vendor[]>([])
  const [vendorId,  setVendorId]  = useState('')
  const [type,      setType]      = useState<'ap' | 'ar'>('ap')
  const [from,      setFrom]      = useState(firstOfMonthIso)
  const [to,        setTo]        = useState(todayIso)
  const [data,      setData]      = useState<StatementData | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  // Load vendors
  useEffect(() => {
    fetch('/api/finance/contacts')
      .then(r => r.ok ? r.json() : [])
      .then((d: Vendor[]) => {
        const sorted = [...d].sort((a, b) => a.name.localeCompare(b.name))
        setVendors(sorted)
      })
      .catch(() => {})
  }, [])

  function fetchStatement() {
    if (!vendorId) return
    setLoading(true)
    setError(null)
    setData(null)
    fetch(`/api/finance/vendor-statement?vendorId=${vendorId}&type=${type}&from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setData(d)
      })
      .catch(() => setError('Failed to load statement.'))
      .finally(() => setLoading(false))
  }

  const selectedVendor = vendors.find(v => v.id === vendorId)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-4xl">
      <PageHero
        title={type === 'ap' ? 'Creditor Statement' : 'Debtor Statement'}
        subtitle={type === 'ap'
          ? 'Shows all invoices and payments for a vendor (what you owe).'
          : 'Shows all invoices issued to and receipts from a payer (what they owe you).'}
        actions={data ? <PrintButton printRef={printRef} reportTitle={`${data.type === 'ap' ? 'Creditor' : 'Debtor'} Statement — ${data.vendor.name}`} /> : undefined}
      />

      {/* ── Filters ── */}
      <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Statement type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as 'ap' | 'ar')}
              className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
            >
              <option value="ap">Creditor (AP) — vendor owes you</option>
              <option value="ar">Debtor (AR) — payer owes you</option>
            </select>
          </div>

          {/* Vendor */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {type === 'ap' ? 'Vendor / creditor' : 'Payer / debtor'}
            </label>
            <select
              value={vendorId}
              onChange={e => setVendorId(e.target.value)}
              className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
            >
              <option value="">— Select —</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          {/* From */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
            />
          </div>

          {/* To */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
            />
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={fetchStatement}
            disabled={!vendorId || loading}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {loading ? 'Loading…' : 'Generate Statement'}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Statement ── */}
      {data && (
        <PrintWrapper ref={printRef} reportTitle={`${data.type === 'ap' ? 'Creditor' : 'Debtor'} Statement`} dateRange={`${fmtDate(data.period.from)} – ${fmtDate(data.period.to)}`}>
          <div className="flex flex-col gap-4">
            {/* Statement header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">
                  {data.type === 'ap' ? 'Creditor Statement' : 'Debtor Statement'}
                </h2>
                <p className="text-sm text-muted-foreground">{data.vendor.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Period: {fmtDate(data.period.from)} – {fmtDate(data.period.to)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Closing balance</p>
                <p className={cn(
                  'text-xl font-bold tabular-nums',
                  data.closingBalance > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
                )}>
                  {fmt(Math.abs(data.closingBalance))}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {data.closingBalance > 0.005
                    ? (data.type === 'ap' ? 'Outstanding payable' : 'Outstanding receivable')
                    : 'Fully settled'}
                </p>
              </div>
            </div>

            {/* Statement table */}
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Description</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Ref</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">
                      {data.type === 'ap' ? 'Charges' : 'Invoiced'}
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">
                      {data.type === 'ap' ? 'Payments' : 'Receipts'}
                    </th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  <tr className="border-b border-border bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground" colSpan={2}>
                      Opening balance as at {fmtDate(data.period.from)}
                    </td>
                    <td className="hidden md:table-cell" />
                    <td className="px-3 py-2 text-right text-xs" />
                    <td className="px-3 py-2 text-right text-xs" />
                    <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums">
                      {fmt(data.openingBalance)}
                    </td>
                  </tr>

                  {/* Transaction lines */}
                  {data.lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-xs text-muted-foreground">
                        No transactions in this period.
                      </td>
                    </tr>
                  ) : data.lines.map(line => (
                    <tr key={line.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                        {fmtDate(line.date)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className={cn(
                          line.type === 'invoice' ? 'text-foreground' : 'text-muted-foreground',
                        )}>
                          {line.description}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground font-mono hidden md:table-cell">
                        {line.reference ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">
                        {line.charges != null ? fmt(line.charges) : ''}
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                        {line.payments != null ? fmt(line.payments) : ''}
                      </td>
                      <td className={cn(
                        'px-3 py-2 text-right text-xs tabular-nums font-medium',
                        line.balance > 0.005 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
                      )}>
                        {fmt(line.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td colSpan={3} className="px-3 py-3 text-xs font-semibold">Closing balance</td>
                    <td className="px-3 py-3 text-right text-xs font-semibold tabular-nums">
                      {fmt(data.lines.reduce((s, l) => s + (l.charges ?? 0), 0))}
                    </td>
                    <td className="px-3 py-3 text-right text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {fmt(data.lines.reduce((s, l) => s + (l.payments ?? 0), 0))}
                    </td>
                    <td className={cn(
                      'px-3 py-3 text-right text-xs font-bold tabular-nums',
                      data.closingBalance > 0.005 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
                    )}>
                      {fmt(data.closingBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Print footer */}
            <div className="print:block hidden mt-2 text-xs text-muted-foreground">
              <p>{data.vendor.name} — {data.type === 'ap' ? 'Creditor' : 'Debtor'} Statement</p>
              <p>Period: {fmtDate(data.period.from)} – {fmtDate(data.period.to)}</p>
            </div>
          </div>
        </PrintWrapper>
      )}
    </div>
  )
}
