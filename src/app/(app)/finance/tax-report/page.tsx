'use client'

import { useEffect, useState } from 'react'
import { Receipt, TrendingUp, TrendingDown, Calculator, PiggyBank, ChevronDown, ChevronRight, DollarSign, Briefcase } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ── Types matching the API response ─────────────────────────────────────

interface TransactionRow {
  id: string
  date: string
  description: string | null
  amount: number
  type: string
  categoryName: string | null
  categoryTaxDisplayLabel: string | null
  entityName: string | null
  memberName: string | null
}

interface IncomeEntryRow {
  id: string
  name: string
  amount: number
  frequency: string
  estimatedAnnual: number
  taxRate: number | null
  entityName: string | null
  memberName: string | null
}

interface ClassificationDetail {
  classification: string
  displayName: string
  totalIncome: number
  totalDeductions: number
  netTaxable: number
  estimatedTax: number
  estimatedMedicare: number
  estimatedTotalTax: number
  transactions: TransactionRow[]
  incomeEntries: IncomeEntryRow[]
}

interface ApiResponse {
  financialYear: string
  from: string
  to: string
  classifications: ClassificationDetail[]
  taxCategories: { id: string; name: string; displayLabel: string | null; isTaxDeduction: boolean; taxIncludeInReporting: boolean }[]
}

interface Entity { id: string; name: string; color: string | null; type: string; isDefault: boolean }

// ── Helpers ────────────────────────────────────────────────────────────

const CLASSIFICATION_COLORS: Record<string, string> = {
  personal:   'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  business:   'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  investment: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  super:      'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
}

const CLASSIFICATION_ICONS: Record<string, React.ReactNode> = {
  personal:   <DollarSign className="h-4 w-4" />,
  business:   <Briefcase className="h-4 w-4" />,
  investment: <TrendingUp className="h-4 w-4" />,
  super:      <PiggyBank className="h-4 w-4" />,
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function frequencyLabel(freq: string): string {
  const labels: Record<string, string> = { weekly: '/wk', fortnightly: '/fn', monthly: '/mo', quarterly: '/qtr', halfyearly: '/hy', yearly: '/yr', 'one-off': '' }
  return labels[freq] ?? ''
}


// ── Page ───────────────────────────────────────────────────────────────

export default function TaxReportPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [entities, setEntities] = useState<Entity[]>([])
  const [selectedEntityId, setSelectedEntityId] = useState<string>('')
  const [expandedClassifications, setExpandedClassifications] = useState<Set<string>>(new Set(['personal', 'business', 'investment', 'super']))

  // ── Fetch entities ──────────────────────────────────────────────────
  useEffect(() => {
    async function loadEntities() {
      try {
        const res = await fetch('/api/finance/entities')
        if (res.ok) setEntities(await res.json())
      } catch {}
    }
    loadEntities()
  }, [])

  // ── Fetch tax report data ───────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (selectedEntityId) params.set('entityId', selectedEntityId)
        const res = await fetch(`/api/finance/tax-report?${params}`)
        if (!res.ok) { toast.error('Failed to load tax report'); return }
        const json: ApiResponse = await res.json()
        setData(json)
        // Auto-expand any classification that has data
        const expanded = new Set<string>()
        json.classifications.forEach(c => { if (c.totalIncome > 0 || c.totalDeductions > 0) expanded.add(c.classification) })
        setExpandedClassifications(expanded)
      } catch { toast.error('Failed to load tax report') }
      finally { setLoading(false) }
    }
    loadData()
  }, [selectedEntityId])

  function toggleClassification(key: string) {
    setExpandedClassifications(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // ── Derived totals ──────────────────────────────────────────────────
  const totals = data?.classifications.reduce((acc, c) => ({
    totalIncome: acc.totalIncome + c.totalIncome,
    totalDeductions: acc.totalDeductions + c.totalDeductions,
    totalTax: acc.totalTax + c.estimatedTotalTax,
    netTaxable: acc.netTaxable + c.netTaxable,
  }), { totalIncome: 0, totalDeductions: 0, totalTax: 0, netTaxable: 0 }) ?? { totalIncome: 0, totalDeductions: 0, totalTax: 0, netTaxable: 0 }

  // ── Super cap check ─────────────────────────────────────────────────
  const superClass = data?.classifications.find(c => c.classification === 'super')
  const SUPER_CAP = 30_000
  const superTotal = superClass?.totalIncome ?? 0
  const superExceedsCap = superTotal > SUPER_CAP

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Receipt className="h-5 w-5 text-orange-500" />
            Tax Report
          </h2>
          {data && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Financial year {data.financialYear} &middot; {data.from} &ndash; {data.to}
            </p>
          )}
        </div>
      </div>

      {/* Entity filter tabs */}
      {entities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedEntityId('')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
              !selectedEntityId
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            All Entities
          </button>
          {entities.map(en => (
            <button
              key={en.id}
              onClick={() => setSelectedEntityId(en.id)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                selectedEntityId === en.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {en.name}
            </button>
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Loading tax report data…
        </div>
      )}

      {/* No data state */}
      {!loading && (!data || data.classifications.length === 0) && (
        <div className="text-center py-12">
          <Receipt className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground text-sm">No tax-tracked data found for this period.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Assign tax classifications to bills, income, and transactions to see them here.
          </p>
        </div>
      )}

      {/* Summary cards */}
      {data && data.classifications.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Total Income" value={formatCurrency(totals.totalIncome)} icon={<TrendingUp className="h-4 w-4" />} color="text-green-600 dark:text-green-400" />
            <SummaryCard label="Total Deductions" value={formatCurrency(totals.totalDeductions)} icon={<TrendingDown className="h-4 w-4" />} color="text-red-600 dark:text-red-400" />
            <SummaryCard label="Net Taxable Income" value={formatCurrency(totals.netTaxable)} icon={<Calculator className="h-4 w-4" />} color="text-blue-600 dark:text-blue-400" />
            <SummaryCard label="Estimated Tax + Medicare" value={formatCurrency(totals.totalTax)} icon={<Receipt className="h-4 w-4" />} color="text-orange-600 dark:text-orange-400" />
          </div>

          {/* Super contributions cap indicator */}
          {superClass && (
            <div className={cn(
              'rounded-lg border p-3 flex items-start gap-3',
              superExceedsCap ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/20 bg-amber-500/5'
            )}>
              <PiggyBank className={cn('h-5 w-5 shrink-0 mt-0.5', superExceedsCap ? 'text-red-500' : 'text-amber-500')} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  Superannuation Contributions
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatCurrency(superTotal)} contributed of {formatCurrency(SUPER_CAP)} cap
                  {superExceedsCap
                    ? <span className="text-red-500 font-medium"> &middot; EXCEEDS CAP by {formatCurrency(superTotal - SUPER_CAP)}</span>
                    : <span className="text-muted-foreground"> &middot; {formatCurrency(SUPER_CAP - superTotal)} remaining</span>
                  }
                </p>
                {/* Progress bar */}
                <div className="mt-2 h-1.5 w-full max-w-xs bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', superExceedsCap ? 'bg-red-500' : 'bg-amber-500')}
                    style={{ width: `${Math.min(100, (superTotal / SUPER_CAP) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Per-classification breakdown */}
          <div className="space-y-4">
            {data.classifications.map(c => {
              const isExpanded = expandedClassifications.has(c.classification)
              const hasTransactions = c.transactions.length > 0
              const hasIncomeEntries = c.incomeEntries.length > 0
              const hasItems = hasTransactions || hasIncomeEntries

              return (
                <div key={c.classification} className="rounded-lg border border-border overflow-hidden">
                  {/* Classification header */}
                  <button
                    onClick={() => toggleClassification(c.classification)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-accent/50 transition-colors text-left"
                  >
                    <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border', CLASSIFICATION_COLORS[c.classification] ?? 'bg-muted text-muted-foreground')}>
                      {CLASSIFICATION_ICONS[c.classification]}
                      {c.displayName}
                    </div>
                    <div className="flex-1" />
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Income: <strong className="text-green-600 dark:text-green-400">{formatCurrency(c.totalIncome)}</strong></span>
                      <span>Deductions: <strong className="text-red-600 dark:text-red-400">{formatCurrency(c.totalDeductions)}</strong></span>
                      <span>Net: <strong className={cn(c.netTaxable > 0 ? 'text-foreground' : 'text-muted-foreground')}>{formatCurrency(c.netTaxable)}</strong></span>
                      <span>Tax: <strong className="text-orange-600 dark:text-orange-400">{formatCurrency(c.estimatedTotalTax)}</strong></span>
                    </div>
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && hasItems && (
                    <div className="border-t border-border">
                      {/* Income entries */}
                      {c.incomeEntries.length > 0 && (
                        <div className="p-3 space-y-2">
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Income Streams</h4>
                          <div className="space-y-1">
                            {c.incomeEntries.map(inc => (
                              <div key={inc.id} className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-accent/30">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-medium truncate">{inc.name}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">{formatCurrency(inc.amount)}{frequencyLabel(inc.frequency)}</span>
                                  {inc.entityName && <span className="text-xs text-muted-foreground shrink-0">&middot; {inc.entityName}</span>}
                                  {inc.memberName && <span className="text-xs text-muted-foreground shrink-0">&middot; {inc.memberName}</span>}
                                </div>
                                <span className="text-green-600 dark:text-green-400 font-medium shrink-0 ml-2">{formatCurrency(inc.estimatedAnnual)}/yr</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Transactions */}
                      {c.transactions.length > 0 && (
                        <div className={cn('p-3 space-y-2', c.incomeEntries.length > 0 && 'border-t border-border')}>
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transactions</h4>
                          <div className="space-y-1">
                            {c.transactions.map(tx => (
                              <div key={tx.id} className="flex items-center justify-between text-sm py-1 px-2 rounded hover:bg-accent/30">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={cn(
                                    'text-xs font-medium px-1.5 py-0.5 rounded shrink-0',
                                    tx.type === 'income' ? 'text-green-600 dark:text-green-400 bg-green-500/10' :
                                    tx.type === 'expense' ? 'text-red-600 dark:text-red-400 bg-red-500/10' :
                                    'text-blue-600 dark:text-blue-400 bg-blue-500/10'
                                  )}>
                                    {tx.type === 'income' ? 'INC' : tx.type === 'expense' ? 'EXP' : 'TRF'}
                                  </span>
                                  <span className="text-xs text-muted-foreground shrink-0">{tx.date}</span>
                                  <span className="truncate">{tx.description}</span>
                                  {tx.categoryName && <span className="text-xs text-muted-foreground shrink-0">&middot; {tx.categoryTaxDisplayLabel ?? tx.categoryName}</span>}
                                  {tx.memberName && <span className="text-xs text-muted-foreground shrink-0">&middot; {tx.memberName}</span>}
                                </div>
                                <span className={cn(
                                  'font-medium shrink-0 ml-2',
                                  tx.type === 'income' ? 'text-green-600 dark:text-green-400' :
                                  tx.type === 'expense' ? 'text-red-600 dark:text-red-400' :
                                  'text-muted-foreground'
                                )}>
                                  {tx.type === 'expense' ? '-' : '+'}{formatCurrency(tx.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Empty state */}
                  {isExpanded && !hasItems && (
                    <div className="border-t border-border p-6 text-center text-xs text-muted-foreground">
                      No items in this classification.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function SummaryCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={color}>{icon}</span>
        {label}
      </div>
      <p className={cn('text-lg font-bold', color)}>{value}</p>
    </div>
  )
}
