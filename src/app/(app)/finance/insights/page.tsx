'use client'

import { useEffect, useState } from 'react'
import { PageHero } from '@/components/shared/PageHero'
import { formatCurrency } from '@/lib/financeShared'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts'
import { cn } from '@/lib/utils'

interface MonthlyRow {
  label: string
  income: number
  expenses: number
  net: number
}

interface CategoryRow {
  name: string
  color: string | null
  amount: number
}

interface InsightsData {
  monthly: MonthlyRow[]
  categoryBreakdown: CategoryRow[]
}

interface NetWorthPoint {
  label: string
  netWorth: number
  assets: number
  liabilities: number
}

interface BudgetRow {
  categoryId: string
  name: string
  color: string | null
  budget: number
  actual: number
}

interface BudgetVsActual {
  month: string
  label: string
  rows: BudgetRow[]
  totals: { budget: number; actual: number; unbudgeted: number }
}

function fmtCurrency(n: number) {
  return formatCurrency(n, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const MONTH_OPTIONS = [
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
  { value: '24', label: '24 months' },
]

const DEFAULT_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
]

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null)
  const [netWorth, setNetWorth] = useState<NetWorthPoint[]>([])
  const [budget, setBudget] = useState<BudgetVsActual | null>(null)
  const [loading, setLoading] = useState(true)
  const [months, setMonths] = useState('12')

  useEffect(() => {
    fetch('/api/finance/insights/budget-vs-actual')
      .then(r => r.json())
      .then(d => setBudget(d.rows ? d : null))
      .catch(() => setBudget(null))
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/finance/insights?months=${months}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
    fetch(`/api/finance/insights/net-worth?months=${months}`)
      .then(r => r.json())
      .then(d => setNetWorth(d.points ?? []))
      .catch(() => setNetWorth([]))
  }, [months])

  const totalIncome   = data?.monthly.reduce((s, m) => s + m.income,   0) ?? 0
  const totalExpenses = data?.monthly.reduce((s, m) => s + m.expenses, 0) ?? 0
  const avgIncome     = data?.monthly.length ? totalIncome   / data.monthly.length : 0
  const avgExpenses   = data?.monthly.length ? totalExpenses / data.monthly.length : 0

  return (
    <div className="space-y-6">
      <PageHero title="Insights" subtitle="Income and expense trends over time." />

      {/* Controls */}
      <div className="flex items-center gap-2">
        {MONTH_OPTIONS.map(o => (
          <button
            key={o.value}
            onClick={() => setMonths(o.value)}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
              months === o.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading insights…</div>
      ) : !data || data.monthly.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">No posted journal data found for this period.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Total income" value={fmtCurrency(totalIncome)} colorClass="text-green-600" />
            <SummaryCard label="Total expenses" value={fmtCurrency(totalExpenses)} colorClass="text-red-500" />
            <SummaryCard label="Avg monthly income" value={fmtCurrency(avgIncome)} colorClass="text-green-600" />
            <SummaryCard label="Avg monthly expenses" value={fmtCurrency(avgExpenses)} colorClass="text-red-500" />
          </div>

          {/* Income vs Expenses bar chart */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold mb-4">Income vs Expenses</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  className="fill-muted-foreground"
                />
                <YAxis
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                  width={50}
                />
                <Tooltip
                  formatter={(value, name) => [fmtCurrency(Number(value ?? 0)), name === 'income' ? 'Income' : 'Expenses']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend formatter={v => v === 'income' ? 'Income' : 'Expenses'} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income"   name="income"   fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={32} />
                <Bar dataKey="expenses" name="expenses" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Net per month */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold mb-4">Net (Income − Expenses)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                />
                <Tooltip
                  formatter={(value) => [fmtCurrency(Number(value ?? 0)), 'Net']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="net" name="net" radius={[3, 3, 0, 0]} maxBarSize={32}>
                  {data.monthly.map((entry, index) => (
                    <Cell key={index} fill={entry.net >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Category breakdown */}
          {data.categoryBreakdown.length > 0 && (
            <div className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold mb-1">Top expense categories</h3>
              <p className="text-xs text-muted-foreground mb-4">Most recent month in range</p>
              <div className="space-y-2">
                {data.categoryBreakdown.map((cat, i) => {
                  const max = data.categoryBreakdown[0].amount
                  const pct = max > 0 ? (cat.amount / max) * 100 : 0
                  const color = cat.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]
                  return (
                    <div key={cat.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-sm">{cat.name}</span>
                        </div>
                        <span className="text-sm font-semibold">{fmtCurrency(cat.amount)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Net worth trend — independent of the income/expense data above */}
      {!loading && netWorth.some(p => p.netWorth !== 0 || p.assets !== 0 || p.liabilities !== 0) && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold mb-1">Net worth</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Assets minus liabilities at each month end — same figures as the Balance Sheet
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={netWorth} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis
                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip
                formatter={(value, name) => [
                  fmtCurrency(Number(value ?? 0)),
                  name === 'netWorth' ? 'Net worth' : name === 'assets' ? 'Assets' : 'Liabilities',
                ]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend
                formatter={v => v === 'netWorth' ? 'Net worth' : v === 'assets' ? 'Assets' : 'Liabilities'}
                wrapperStyle={{ fontSize: 12 }}
              />
              <Line type="monotone" dataKey="assets"      name="assets"      stroke="#22c55e" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="liabilities" name="liabilities" stroke="#ef4444" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="netWorth"    name="netWorth"    stroke="#6366f1" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Budget vs actual — current month */}
      {!loading && budget && budget.rows.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold mb-1">Budget vs actual</h3>
          <p className="text-xs text-muted-foreground mb-4">{budget.label} — spending so far against your category budgets</p>
          <div className="space-y-3">
            {budget.rows.map((row, i) => {
              const pct = row.budget > 0 ? (row.actual / row.budget) * 100 : 0
              const over = row.actual > row.budget
              const color = row.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]
              return (
                <div key={row.categoryId}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-sm">{row.name}</span>
                    </div>
                    <span className={cn('text-sm', over ? 'font-semibold text-red-500' : 'text-muted-foreground')}>
                      <span className="font-semibold text-foreground">{fmtCurrency(row.actual)}</span>
                      {' / '}{fmtCurrency(row.budget)}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, pct)}%`, backgroundColor: over ? '#ef4444' : color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border text-sm">
            <span className="text-muted-foreground">
              Total{budget.totals.unbudgeted > 0 && (
                <span> · {fmtCurrency(budget.totals.unbudgeted)} spent outside budgeted categories</span>
              )}
            </span>
            <span className={cn(budget.totals.actual > budget.totals.budget ? 'font-semibold text-red-500' : '')}>
              <span className="font-semibold text-foreground">{fmtCurrency(budget.totals.actual)}</span>
              {' / '}{fmtCurrency(budget.totals.budget)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, colorClass }: { label: string; value: string; colorClass: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-lg font-bold', colorClass)}>{value}</p>
    </div>
  )
}
