'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BudgetRule {
  id: string
  name: string
  amount: number
  period: string
  categoryId: string | null
  billId: string | null
  isIncludedInPlanner: boolean
  entityId: string | null
  category: { id: string; name: string; color: string | null } | null
  bill: { id: string; name: string; amount: number; frequency: string } | null
  entity: { id: string; name: string; color: string | null } | null
}

interface CategoryGroup {
  id: string | null
  name: string
  color: string | null
  monthlyTotal: number
  rules: BudgetRule[]
}

function toMonthly(amount: number, period: string): number {
  if (period === 'weekly')      return amount * 52 / 12
  if (period === 'fortnightly') return amount * 26 / 12
  if (period === 'quarterly')   return amount / 3
  if (period === 'halfyearly')  return amount / 6
  if (period === 'yearly')      return amount / 12
  return amount
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

export function CategorySpendView({ rules }: { rules: BudgetRule[] }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const included = rules.filter(r => r.isIncludedInPlanner)
  const groupMap = new Map<string, CategoryGroup>()

  for (const r of included) {
    const key = r.categoryId ?? '__none__'
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        id: r.categoryId,
        name: r.category?.name ?? 'Uncategorised',
        color: r.category?.color ?? null,
        monthlyTotal: 0,
        rules: [],
      })
    }
    const g = groupMap.get(key)!
    g.monthlyTotal += toMonthly(r.amount, r.period)
    g.rules.push(r)
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => b.monthlyTotal - a.monthlyTotal)
  const grandTotal = groups.reduce((sum, g) => sum + g.monthlyTotal, 0)
  const maxTotal = groups.length > 0 ? groups[0].monthlyTotal : 0

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">No included budget rules to display.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {groups.map(g => {
        const key = g.id ?? '__none__'
        const isExpanded = expandedGroups.has(key)
        const barPct = maxTotal > 0 ? (g.monthlyTotal / maxTotal) * 100 : 0

        return (
          <div key={key} className="rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => toggleGroup(key)}
              className="w-full flex items-center gap-3 px-3 py-3 hover:bg-accent/50 transition-colors text-left"
            >
              <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: g.color ?? '#6B7280' }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold">{g.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{g.rules.length} rule{g.rules.length !== 1 ? 's' : ''}</span>
                    <span className="text-sm font-bold text-red-600">{fmtCurrency(g.monthlyTotal)}/mo</span>
                    {isExpanded
                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-primary/50 transition-all" style={{ width: `${Math.min(100, barPct)}%` }} />
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-border bg-muted/20">
                {g.rules.map(r => {
                  const monthly = toMonthly(r.amount, r.period)
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-2 border-b border-border/50 last:border-b-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0 ml-2" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm">{r.name}</span>
                        {r.bill && (
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground ml-2">from bill</span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium">{fmtCurrency(r.amount)}</p>
                        {r.period !== 'monthly' && <p className="text-xs text-muted-foreground">{fmtCurrency(monthly)}/mo</p>}
                        {r.period === 'monthly' && <p className="text-xs text-muted-foreground capitalize">{r.period}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 mt-1">
        <div>
          <p className="text-xs text-muted-foreground">Categories</p>
          <p className="font-semibold">{groups.length}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total / month</p>
          <p className="font-semibold text-red-600">{fmtCurrency(grandTotal)}</p>
        </div>
      </div>
    </div>
  )
}
