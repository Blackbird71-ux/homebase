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

// Ordered list of expense categories for display
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

export function ExpensesTab({
  items,
  onUpdate,
  onDelete,
  onAdd,
  disabled = false,
}: ExpensesTabProps) {
  // Group items by category in the correct order
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
          <CollapsibleSection key={category} title={category} defaultOpen>
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
