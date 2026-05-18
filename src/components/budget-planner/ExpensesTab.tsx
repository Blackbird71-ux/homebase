'use client'

import { Plus } from 'lucide-react'
import { BudgetItemRow, type BudgetItem } from './BudgetItemRow'
import { CollapsibleSection } from './CollapsibleSection'

interface ExpensesTabProps {
  items: BudgetItem[]
  onUpdate: (id: string, updates: Partial<BudgetItem>) => void
  onDelete: (id: string) => void
  onAdd: () => void
  disabled?: boolean
}

const CATEGORY_ORDER = [
  'Home & Utilities',
  'Insurance & Financial',
  'Groceries',
  'Transport & Auto',
  'Entertainment',
  'Personal & Medical',
  'Children',
  'Pets',
]

const monthlyMultiplier: Record<string, number> = {
  weekly: 4.33,
  fortnightly: 2.17,
  monthly: 1,
  yearly: 1 / 12,
}

function sectionTotal(items: BudgetItem[]): string | undefined {
  const total = items.reduce(
    (sum, i) => sum + i.amount * (monthlyMultiplier[i.frequency] ?? 1),
    0
  )
  if (total === 0) return undefined
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(total) + '/mo'
}

export function ExpensesTab({
  items,
  onUpdate,
  onDelete,
  onAdd,
  disabled = false,
}: ExpensesTabProps) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: items.filter((i) => i.category === cat),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-3">
      {grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground mb-4">
            No expenses yet. Add your first one below.
          </p>
        </div>
      ) : (
        grouped.map(({ category, items: categoryItems }) => (
          <CollapsibleSection
            key={category}
            title={category}
            subtitle={sectionTotal(categoryItems)}
            defaultOpen
          >
            {categoryItems.map((item) => (
              <BudgetItemRow
                key={item.id}
                item={item}
                onUpdate={onUpdate}
                onDelete={onDelete}
                disabled={disabled}
              />
            ))}
          </CollapsibleSection>
        ))
      )}

      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Expense
      </button>
    </div>
  )
}
