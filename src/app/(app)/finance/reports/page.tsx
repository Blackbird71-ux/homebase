'use client'

import { useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns'
import { cn } from '@/lib/utils'

interface Category { id: string; name: string; type: string; color: string | null }
interface Account { id: string; name: string; type: string; currentBalance: number }

interface Summary {
  totalIncome: number
  totalExpenses: number
  netChange: number
  netWorth: number
  billTotal: number
  upcommingBills: number
}

export default function ReportsPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryTotals, setCategoryTotals] = useState<{ name: string; total: number; color: string | null; pct: number }[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'year'>('month')
  const [loading, setLoading] = useState(true)

  const periodStart = selectedPeriod === 'month' ? startOfMonth(new Date()) : startOfYear(new Date())
  const periodEnd = selectedPeriod === 'month' ? endOfMonth(new Date()) : endOfYear(new Date())

  async function load() {
    setLoading(true)
    try {
      // Load all data
      const [aRes, cRes, txRes, billsRes] = await Promise.all([
        fetch('/api/finance/accounts'),
        fetch('/api/finance/categories'),
        fetch(`/api/finance/transactions?startDate=${periodStart.toISOString()}&endDate=${periodEnd.toISOString()}&limit=5000`),
        fetch('/api/finance/bills'),
      ])

      const accountsData: Account[] = aRes.ok ? await aRes.json() : []
      const categoriesData: Category[] = cRes.ok ? await cRes.json() : []
      const txData = txRes.ok ? await txRes.json() : { transactions: [] }
      const billsData = billsRes.ok ? await billsRes.json() : []

      setAccounts(accountsData)
      setCategories(categoriesData)

      // Calculate totals
      let totalIncome = 0
      let totalExpenses = 0
      let totalTransfers = 0
      const catTotals: Record<string, { name: string; color: string | null; total: number }> = {}

      txData.transactions.forEach((tx: any) => {
        if (tx.type === 'income') totalIncome += tx.amount
        else if (tx.type === 'expense') {
          totalExpenses += tx.amount
          const catId = tx.categoryId || 'uncategorized'
          catTotals[catId] = catTotals[catId] || { name: tx.category?.name || 'Uncategorized', color: tx.category?.color || null, total: 0 }
          catTotals[catId].total += tx.amount
        } else if (tx.type === 'transfer') totalTransfers += tx.amount
      })

      const netWorth = accountsData.reduce((sum, a) => sum + a.currentBalance, 0)
      const billTotal = billsData.reduce((sum: number, b: any) => sum + b.amount, 0)
      const upcomingBills = billsData.filter((b: any) => b.isActive && new Date(b.nextDueDate) > new Date()).length

      // Sort and add percentages
      const sortedCatTotals = Object.entries(catTotals)
        .map(([_, v]) => ({
          name: v.name,
          total: v.total,
          color: v.color,
          pct: totalExpenses > 0 ? Math.round((v.total / totalExpenses) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total)

      setCategoryTotals(sortedCatTotals)
      setSummary({
        totalIncome,
        totalExpenses,
        netChange: totalIncome - totalExpenses,
        netWorth,
        billTotal,
        upcommingBills: upcomingBills,
      })
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [selectedPeriod])

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)
  }

  if (loading && !summary) return <div className="p-4 text-muted-foreground">Loading reports…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reports</h1>
        <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value as 'month' | 'year')}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SummaryCard label="Income" value={summary?.totalIncome ?? 0} color="text-green-500" formatCurrency={formatCurrency} />
        <SummaryCard label="Expenses" value={summary?.totalExpenses ?? 0} color="text-red-500" formatCurrency={formatCurrency} />
        <SummaryCard label="Net Change" value={summary?.netChange ?? 0}
          color={(summary?.netChange ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}
          formatCurrency={formatCurrency} />
        <SummaryCard label="Net Worth" value={summary?.netWorth ?? 0} color="text-primary" formatCurrency={formatCurrency} />
        <SummaryCard label="Bills (Total)" value={summary?.billTotal ?? 0} color="text-amber-500" formatCurrency={formatCurrency} />
      </div>

      {/* Category Breakdown */}
      {categoryTotals.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h2 className="font-semibold mb-3">Spending by Category</h2>
          <div className="space-y-2">
            {categoryTotals.map(ct => (
              <div key={ct.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ct.color ?? '#6B7280' }} />
                    <span>{ct.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatCurrency(ct.total)}</span>
                    <span className="text-xs text-muted-foreground w-8 text-right">{ct.pct}%</span>
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${ct.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Account Summary */}
      {accounts.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h2 className="font-semibold mb-3">Account Balances</h2>
          <div className="space-y-1">
            {accounts.map(a => (
              <div key={a.id} className="flex items-center justify-between text-sm py-1">
                <span>{a.name} <span className="text-xs text-muted-foreground">({a.type})</span></span>
                <span className="font-medium">{formatCurrency(a.currentBalance)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm font-bold pt-2 border-t border-border mt-2">
              <span>Total Net Worth</span>
              <span>{formatCurrency(summary?.netWorth ?? 0)}</span>
            </div>
          </div>
        </div>
      )}

      {/* No data */}
      {!summary?.totalIncome && !summary?.totalExpenses && categoryTotals.length === 0 && (
        <p className="text-sm text-muted-foreground">No transaction data for this period. Add some transactions to see reports.</p>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color, formatCurrency }: {
  label: string; value: number; color: string; formatCurrency: (n: number) => string
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn('text-lg font-bold', color)}>{formatCurrency(value)}</p>
    </div>
  )
}