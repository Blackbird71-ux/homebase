'use client'

import { useState } from 'react'
import { DollarSign, Pencil, X, Loader2 } from 'lucide-react'
import { formatCurrency as formatAUD } from '@/lib/financeShared'

interface TripBudgetSectionProps {
  tripId: string
  estimatedBudget: number | null
  actualCost: number | null
  budgetBreakdown: string | null
  onBudgetUpdated: (estimatedBudget: number | null, actualCost: number | null, budgetBreakdown: string | null) => void
}

interface BudgetCategory {
  label: string
  amount: number
}

const DEFAULT_CATEGORIES = ['flights', 'hotel', 'food', 'activities', 'transport', 'other'] as const

export function TripBudgetSection({
  tripId,
  estimatedBudget,
  actualCost,
  budgetBreakdown,
  onBudgetUpdated,
}: TripBudgetSectionProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [budget, setBudget] = useState(estimatedBudget?.toString() ?? '')
  const [breakdown, setBreakdown] = useState<BudgetCategory[]>(
    budgetBreakdown ? JSON.parse(budgetBreakdown) : DEFAULT_CATEGORIES.map((label) => ({ label, amount: 0 }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const totalFromBreakdown = breakdown.reduce((sum, cat) => sum + cat.amount, 0)
  const budgetValue = parseFloat(budget) || 0

  function handleEdit() {
    setIsEditing(true)
    setBudget(estimatedBudget?.toString() ?? '')
    setBreakdown(
      budgetBreakdown
        ? JSON.parse(budgetBreakdown)
        : DEFAULT_CATEGORIES.map((label) => ({ label, amount: 0 }))
    )
    setError('')
  }

  function handleCategoryChange(index: number, amount: number) {
    const updated = [...breakdown]
    updated[index] = { ...updated[index], amount }
    setBreakdown(updated)
  }

  async function handleSave() {
    const total = breakdown.reduce((sum, cat) => sum + cat.amount, 0)
    const estBudget = parseFloat(budget) || total

    setSaving(true)
    setError('')

    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimatedBudget: estBudget || null,
          budgetBreakdown: JSON.stringify(breakdown) || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to update budget')
      }

      onBudgetUpdated(estBudget || null, actualCost, JSON.stringify(breakdown))
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update budget')
    } finally {
      setSaving(false)
    }
  }

  function formatCurrency(amount: number): string {
    return formatAUD(amount, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  const budgetAmount = estimatedBudget ?? totalFromBreakdown

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Budget
        </h2>
        {!isEditing && (
          <button
            onClick={handleEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-input hover:bg-accent transition-colors"
          >
            <Pencil className="h-4 w-4" />
            {estimatedBudget || budgetBreakdown ? 'Edit Budget' : 'Set Budget'}
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="p-4 rounded-lg border border-border bg-card space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
          )}

          {/* Overall budget */}
          <div>
            <label className="block text-sm font-medium mb-1">Total Estimated Budget</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full pl-7 pr-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {budget && (
              <p className="text-xs text-muted-foreground mt-1">
                Breakdown total: {formatCurrency(totalFromBreakdown)}
                {totalFromBreakdown !== parseFloat(budget) && budgetValue > 0 && (
                  <span className="text-amber-500 ml-1">
                    (doesn't match total — adjust categories or total)
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Category breakdown */}
          <div>
            <label className="block text-sm font-medium mb-2">Category Breakdown</label>
            <div className="space-y-2">
              {breakdown.map((cat, index) => (
                <div key={cat.label} className="flex items-center gap-2">
                  <span className="w-24 text-sm capitalize text-muted-foreground">{cat.label}</span>
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={cat.amount || ''}
                      onChange={(e) => handleCategoryChange(index, parseFloat(e.target.value) || 0)}
                      className="w-full pl-5 pr-3 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-right text-muted-foreground mt-2">
              Total: {formatCurrency(totalFromBreakdown)}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 rounded text-sm font-medium border border-input hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Budget'}
            </button>
          </div>
        </div>
      ) : budgetAmount > 0 || actualCost ? (
        <div className="p-4 rounded-lg border border-border bg-card space-y-3">
          {/* Budget bar */}
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">Estimated Budget</span>
              <span className="font-medium">{formatCurrency(budgetAmount)}</span>
            </div>
            {actualCost !== null && (
              <>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Actual Cost</span>
                  <span className="font-medium">{formatCurrency(actualCost)}</span>
                </div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className={`font-medium ${budgetAmount - actualCost >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                    {formatCurrency(budgetAmount - actualCost)}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      (actualCost / budgetAmount) > 1
                        ? 'bg-destructive'
                        : (actualCost / budgetAmount) > 0.8
                          ? 'bg-amber-500'
                          : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min((actualCost / budgetAmount) * 100, 100)}%` }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Breakdown */}
          {budgetBreakdown && (
            <div className="border-t border-border pt-3">
              <h3 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                Breakdown
              </h3>
              <div className="space-y-1.5">
                {breakdown.map((cat) => (
                  <div key={cat.label} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{cat.label}</span>
                    <span>{formatCurrency(cat.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm font-medium border-t border-border pt-1.5 mt-1.5">
                  <span>Total</span>
                  <span>{formatCurrency(totalFromBreakdown)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 text-center text-muted-foreground rounded-lg border border-dashed border-border">
          <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No budget set</p>
          <p className="text-xs mt-1">Set an estimated budget for this trip</p>
        </div>
      )}
    </section>
  )
}
