'use client'

import { Plus } from 'lucide-react'
import { BudgetItemRow, type BudgetItem } from './BudgetItemRow'
import { CollapsibleSection } from './CollapsibleSection'

interface IncomeTabProps {
  items: BudgetItem[]
  onUpdate: (id: string, updates: Partial<BudgetItem>) => void
  onDelete: (id: string) => void
  onAdd: () => void
  disabled?: boolean
}

export function IncomeTab({
  items,
  onUpdate,
  onDelete,
  onAdd,
  disabled = false,
}: IncomeTabProps) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground mb-4">
            No income sources yet. Add your first one below.
          </p>
        </div>
      ) : (
        <CollapsibleSection title="Income Sources" defaultOpen>
          {items.map((item) => (
            <BudgetItemRow
              key={item.id}
              item={item}
              onUpdate={onUpdate}
              onDelete={onDelete}
              disabled={disabled}
            />
          ))}
        </CollapsibleSection>
      )}

      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Income Source
      </button>
    </div>
  )
}
