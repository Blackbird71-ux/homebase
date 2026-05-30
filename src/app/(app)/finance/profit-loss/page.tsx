'use client'

import { useRef } from 'react'
import {
  ChevronLeft, ChevronRight, ArrowLeft, TrendingUp, TrendingDown, DollarSign,
  ReceiptText, List, X, FileOutput,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { PrintButton } from '@/components/print/PrintButton'
import { PrintWrapper } from '@/components/print/PrintWrapper'
import { ExcelButton } from '@/components/print/ExcelButton'
import { Button } from '@/components/ui/button'
import { buildProfitLossWorkbook } from '@/lib/excel/profit-loss-excel'
import { useProfitLoss } from '@/hooks/finance/useProfitLoss'
import { PageHero } from '@/components/shared/PageHero'
import { toast } from 'sonner'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfitLossPage() {
  const printRef = useRef<HTMLDivElement>(null)

  const {
    loading, txLoading,
    periodMode, setPeriodMode,
    viewMode, setViewMode,
    anchor, setAnchor,
    selectedEntityId, setSelectedEntityId,
    entities,
    start, end, label,
    incomeGroups, expenseGroups,
    totalIncome, totalExpenses,
    estimatedTax, netProfit,
    maxIncome, maxExpense,
    drillSide, setDrillSide,
    drillKey, setDrillKey,
    drillGroup,
    ledgerOpen, setLedgerOpen,
    ledgerLabel, ledgerTxs, ledgerLoading,
    openLedger,
    navigateAnchor,
  } = useProfitLoss()

  if (loading) return <div className="p-4 text-muted-foreground">Loading profit & loss…</div>

  return (
    <div className="space-y-5">
      <PageHero title="Profit & Loss" subtitle="Income and expenses for the selected period." />
      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {(['month', 'quarter', 'year'] as const).map(p => (
            <button key={p} onClick={() => setPeriodMode(p)}
              className={cn('px-2.5 py-1 text-xs font-medium rounded-full border transition-colors capitalize',
                periodMode === p ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              {p === 'month' ? 'Month' : p === 'quarter' ? 'Quarter' : 'Year'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => setViewMode('accrual')}
            className={cn('px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
              viewMode === 'accrual' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
            Accrual
          </button>
          <button onClick={() => setViewMode('forecast')}
            className={cn('px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
              viewMode === 'forecast' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
            + Forecast
          </button>
        </div>

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

        {txLoading && <span className="text-xs text-muted-foreground animate-pulse">Loading transactions…</span>}
        <div className="ml-auto flex items-center gap-2" data-print-hide>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={async () => {
              try {
                // Build structured data for PDF table
                const columns = [
                  { header: 'Category', key: 'category', width: 0.5, align: 'left' as const },
                  { header: '', key: 'count', width: 0.15, align: 'right' as const },
                  { header: 'Amount', key: 'amount', width: 0.35, align: 'right' as const, format: 'currency' as const },
                ]

                const allRows: Record<string, string | number>[] = [
                  // Income section
                  ...incomeGroups.map(g => ({
                    category: g.label,
                    count: g.count,
                    amount: g.totalPeriod,
                  })),
                  { category: 'Total Income', count: '', amount: totalIncome },
                  // Spacer
                  { category: '', count: '', amount: '' },
                  // Expenses section
                  ...expenseGroups.map(g => ({
                    category: g.label,
                    count: g.count,
                    amount: g.totalPeriod,
                  })),
                  { category: 'Total Expenses', count: '', amount: totalExpenses },
                ]

                if (estimatedTax > 0) {
                  allRows.push({ category: 'Estimated Tax (ATO)', count: '', amount: estimatedTax })
                }

                allRows.push(
                  { category: '', count: '', amount: '' },
                  { category: 'Net Profit / Loss', count: '', amount: netProfit },
                )

                const res = await fetch('/api/documents/generate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'table',
                    meta: {
                      title: 'Profit & Loss',
                      subtitle: 'Income and expenses for the selected period',
                      dateRange: label,
                      generatedAt: new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }),
                    },
                    columns,
                    rows: allRows,
                    saveToVault: {
                      title: `P&L - ${label}`,
                      category: 'financial',
                      notes: `Profit & Loss report for ${label}. Income: $${totalIncome.toFixed(2)} · Expenses: $${totalExpenses.toFixed(2)} · Net: $${netProfit.toFixed(2)}`,
                    },
                  }),
                })

                if (!res.ok) {
                  const err = await res.json().catch(() => ({ error: 'Export failed' }))
                  throw new Error(err.error ?? 'Export failed')
                }

                toast.success('P&L report saved to Document Vault')
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed to export PDF')
              }
            }}
          >
            <FileOutput className="h-3.5 w-3.5" />
            PDF
          </Button>
          <PrintButton
            printRef={printRef}
            reportTitle="Profit & Loss"
            dateRange={label}
            disabled={loading}
          />
          <ExcelButton
            buildWorkbook={() => buildProfitLossWorkbook({ label, incomeGroups, expenseGroups, totalIncome, totalExpenses, estimatedTax, netProfit })}
            filename={`HomeBase - P&L - ${label}.xlsx`}
            disabled={loading}
          />
        </div>
      </div>

      {viewMode === 'accrual' && (
        <p className="text-xs text-muted-foreground -mt-2">
          <span className="font-medium text-primary">Accrual basis</span> — income and expenses recognised when invoiced or received, regardless of when cash is exchanged.
        </p>
      )}
      {viewMode === 'forecast' && (
        <p className="text-xs text-muted-foreground -mt-2">
          <span className="font-medium text-amber-500">Forecast</span> — recognised items use actual dates; upcoming scheduled items use estimated dates.
        </p>
      )}

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      {/* ── Printable region ───────────────────────────────────────────────── */}
      <PrintWrapper
        ref={printRef}
        reportTitle="Profit & Loss"
        dateRange={label}
        meta={`Income: ${fmtCurrency(totalIncome)} · Expenses: ${fmtCurrency(totalExpenses)} · Net: ${fmtCurrency(netProfit)}`}
      >

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4 text-green-500" /> Total Income
          </div>
          <p className="text-xl font-bold text-green-600">{fmtCurrency(totalIncome)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{incomeGroups.length} categor{incomeGroups.length !== 1 ? 'ies' : 'y'}</p>
        </div>
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingDown className="h-4 w-4 text-red-500" /> Total Expenses
          </div>
          <p className="text-xl font-bold text-red-600">{fmtCurrency(totalExpenses)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{expenseGroups.length} categor{expenseGroups.length !== 1 ? 'ies' : 'y'}</p>
        </div>
        {estimatedTax > 0 ? (
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <ReceiptText className="h-4 w-4 text-orange-500" /> Estimated Tax
            </div>
            <p className="text-xl font-bold text-orange-600">{fmtCurrency(estimatedTax)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">ATO estimate this {periodMode}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-3 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">No tax-tracked income</p>
          </div>
        )}
        <div className={cn('rounded-lg border p-3',
          netProfit >= 0 ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5')}>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <DollarSign className={cn('h-4 w-4', netProfit >= 0 ? 'text-green-500' : 'text-red-500')} />
            Net Profit / Loss
          </div>
          <p className={cn('text-xl font-bold', netProfit >= 0 ? 'text-green-600' : 'text-red-600')}>
            {fmtCurrency(netProfit)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {netProfit >= 0 ? 'Profit' : 'Loss'} this {periodMode}
          </p>
        </div>
      </div>

      {/* ── Ledger panel ──────────────────────────────────────────────────── */}
      {ledgerOpen && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <List className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Ledger — {ledgerLabel}</span>
              <span className="text-xs text-muted-foreground">({start ? format(start, 'd MMM') : ''} – {end ? format(end, 'd MMM yyyy') : ''})</span>
            </div>
            <button onClick={() => setLedgerOpen(false)} className="p-1 hover:bg-accent rounded text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          {ledgerLoading ? (
            <p className="text-xs text-muted-foreground">Loading transactions…</p>
          ) : ledgerTxs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No cleared transactions found in this period for this category.</p>
          ) : (
            <div className="space-y-1.5">
              {ledgerTxs.map(t => (
                <div key={t.id} className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">{format(new Date(t.date), 'd MMM yyyy')}</span>
                  <span className="flex-1 min-w-0 truncate">{t.description ?? t.payee ?? 'Transaction'}</span>
                  {t.category && <span className="text-xs text-muted-foreground shrink-0">{t.category.name}</span>}
                  {t.account  && <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{t.account.name}</span>}
                  <span className={cn('font-semibold shrink-0 tabular-nums',
                    t.type === 'income' ? 'text-green-600' : 'text-red-600')}>
                    {t.type === 'income' ? '+' : '-'}{fmtCurrency(t.amount)}
                  </span>
                </div>
              ))}
              <div className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                {ledgerTxs.length} transaction{ledgerTxs.length !== 1 ? 's' : ''} · Total:{' '}
                <span className="font-medium text-foreground">
                  {fmtCurrency(ledgerTxs.reduce((s, t) => t.type === 'income' ? s + t.amount : s - t.amount, 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Drill-down panel ──────────────────────────────────────────────── */}
      {drillGroup ? (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => { setDrillSide(null); setDrillKey(null) }}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <span className="text-muted-foreground text-sm">·</span>
            <span className="font-semibold text-sm">{drillGroup.label}</span>
            {drillGroup.color && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: drillGroup.color }} />}
            <span className={cn('text-sm ml-auto font-medium', drillSide === 'income' ? 'text-green-600' : 'text-red-600')}>
              {fmtCurrency(drillGroup.totalPeriod)}
            </span>
            {/* Ledger button — only for real category IDs (not __none__ virtual keys) */}
            {!drillKey?.startsWith('__') && (
              <button
                onClick={() => openLedger(drillKey!, drillGroup.label)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary border border-border rounded-md px-2 py-1 ml-2"
                title="View all transactions for this category"
              >
                <List className="h-3 w-3" /> Ledger
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {drillGroup.items.map(item => (
              <div key={item.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{item.name}</span>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {item.isOneOff && <span className="text-orange-500 mr-2">One-off</span>}
                    {item.source === 'transaction' && <span className="text-blue-500 mr-2">Transaction</span>}
                    {item.paid !== undefined && (
                      <span className={cn('mr-2', item.paid ? 'text-green-500' : 'text-amber-500')}>
                        {item.paid ? 'Paid' : 'Due'}
                      </span>
                    )}
                    {item.received !== undefined && (
                      <span className={cn('mr-2', item.received ? 'text-green-500' : 'text-amber-500')}>
                        {item.received ? 'Received' : 'Expected'}
                      </span>
                    )}
                    {format(new Date(item.date), 'd MMM yyyy')}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{fmtCurrency(item.amount)}</p>
                  {!item.isOneOff && item.periodAmount !== item.amount && (
                    <p className="text-xs text-muted-foreground">{fmtCurrency(item.periodAmount)} this {periodMode}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ── Income section ─────────────────────────────────────────────── */}
          <div>
            <h2 className="text-lg font-semibold text-green-600 mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Income
            </h2>
            {incomeGroups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No income for this period.
                  {viewMode === 'accrual' && ' Switch to Forecast to include scheduled income.'}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pb-1 border-b border-border">
                  <span>Category</span>
                  <span>This {periodMode === 'month' ? 'month' : periodMode === 'quarter' ? 'quarter' : 'year'}</span>
                </div>
                {incomeGroups.map(g => {
                  const pct = maxIncome > 0 ? (g.totalPeriod / maxIncome) * 100 : 0
                  return (
                    <div key={g.key} className="group">
                      <button onClick={() => { setDrillSide('income'); setDrillKey(g.key) }}
                        className="w-full text-left hover:bg-accent/50 rounded-md p-1.5 -mx-1.5 transition-colors">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color ?? '#22C55E' }} />
                          <span className="text-sm flex-1 font-medium">{g.label}</span>
                          <span className="text-xs text-muted-foreground">{g.count} item{g.count !== 1 ? 's' : ''}</span>
                          <span className="text-sm font-semibold min-w-[80px] text-right text-green-600">{fmtCurrency(g.totalPeriod)}</span>
                          {/* Ledger button for real categories */}
                          {!g.key.startsWith('__') && (
                            <button
                              onClick={e => { e.stopPropagation(); openLedger(g.key, g.label) }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded text-muted-foreground transition-opacity"
                              title="View ledger"
                            >
                              <List className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color ?? '#22C55E' }} />
                        </div>
                      </button>
                    </div>
                  )
                })}
                <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                  <span className="text-muted-foreground font-medium">Total Income</span>
                  <span className="font-bold text-green-600">{fmtCurrency(totalIncome)}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Expenses section ──────────────────────────────────────────── */}
          <div>
            <h2 className="text-lg font-semibold text-red-600 mb-2 flex items-center gap-2">
              <TrendingDown className="h-4 w-4" /> Expenses
            </h2>
            {expenseGroups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No expenses for this period.
                  {viewMode === 'accrual' && ' Switch to Forecast to include upcoming bills.'}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium pb-1 border-b border-border">
                  <span>Category</span>
                  <span>This {periodMode === 'month' ? 'month' : periodMode === 'quarter' ? 'quarter' : 'year'}</span>
                </div>
                {expenseGroups.map(g => {
                  const pct = maxExpense > 0 ? (g.totalPeriod / maxExpense) * 100 : 0
                  return (
                    <div key={g.key} className="group">
                      <button onClick={() => { setDrillSide('expense'); setDrillKey(g.key) }}
                        className="w-full text-left hover:bg-accent/50 rounded-md p-1.5 -mx-1.5 transition-colors">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color ?? '#EF4444' }} />
                          <span className="text-sm flex-1 font-medium">{g.label}</span>
                          <span className="text-xs text-muted-foreground">{g.count} item{g.count !== 1 ? 's' : ''}</span>
                          <span className="text-sm font-semibold min-w-[80px] text-right text-red-600">{fmtCurrency(g.totalPeriod)}</span>
                          {!g.key.startsWith('__') && (
                            <button
                              onClick={e => { e.stopPropagation(); openLedger(g.key, g.label) }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded text-muted-foreground transition-opacity"
                              title="View ledger"
                            >
                              <List className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: g.color ?? '#EF4444' }} />
                        </div>
                      </button>
                    </div>
                  )
                })}
                <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                  <span className="text-muted-foreground font-medium">Total Expenses</span>
                  <span className="font-bold text-red-600">{fmtCurrency(totalExpenses)}</span>
                </div>
                {estimatedTax > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <ReceiptText className="h-3.5 w-3.5 text-orange-500" /> Estimated Tax (ATO)
                    </span>
                    <span className="font-semibold text-orange-600">{fmtCurrency(estimatedTax)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── End printable region ──────────────────────────────────────────── */}
      </PrintWrapper>
    </div>
  )
}
