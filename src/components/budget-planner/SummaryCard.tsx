'use client'

import { type BudgetItem } from './BudgetItemRow'
import { Card, CardContent } from '@/components/ui/card'

const monthlyMultiplier: Record<string, number> = {
  weekly: 4.33,
  fortnightly: 2.17,
  monthly: 1,
  yearly: 1 / 12,
}

function calcMonthly(amount: number, frequency: string): number {
  const mult = monthlyMultiplier[frequency] ?? 1
  return Math.round(amount * mult * 100) / 100
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(value)
}

interface SummaryCardProps {
  items: BudgetItem[]
}

export function SummaryCard({ items }: SummaryCardProps) {
  const incomeItems = items.filter((i) => i.type === 'income')
  const expenseItems = items.filter((i) => i.type === 'expense')

  const totalIncome = incomeItems.reduce(
    (sum, i) => sum + calcMonthly(i.amount, i.frequency),
    0
  )
  const totalExpenses = expenseItems.reduce(
    (sum, i) => sum + calcMonthly(i.amount, i.frequency),
    0
  )
  const remaining = totalIncome - totalExpenses

  const isPositive = remaining >= 0
  const usagePercent = totalIncome > 0
    ? Math.min((totalExpenses / totalIncome) * 100, 100)
    : 0

  const remainingColor = isPositive
    ? remaining < totalIncome * 0.1
      ? 'text-amber-500'
      : 'text-emerald-500'
    : 'text-red-500'

  return (
    <Card size="sm" className="sticky bottom-0 border-t-2 border-t-border">
      <CardContent className="space-y-3">
        {/* Summary rows */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Monthly Income</p>
            <p className="font-semibold text-emerald-500">
              {formatCurrency(totalIncome)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Monthly Expenses</p>
            <p className="font-semibold text-red-500">
              {formatCurrency(totalExpenses)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className={`font-semibold ${remainingColor}`}>
              {formatCurrency(remaining)}
            </p>
          </div>
        </div>

        {/* Usage bar */}
        {totalIncome > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Budget usage</span>
              <span>{Math.round(usagePercent)}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  usagePercent > 90
                    ? 'bg-red-500'
                    : usagePercent > 75
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
