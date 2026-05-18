'use client'

import { Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface BudgetItem {
  id: string
  userId: string
  type: 'income' | 'expense'
  category: string
  subcategory: string
  amount: number
  frequency: string
  sortOrder: number
}

interface BudgetItemRowProps {
  item: BudgetItem
  onUpdate: (id: string, updates: Partial<BudgetItem>) => void
  onDelete: (id: string) => void
  disabled?: boolean
}

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
] as const

export function BudgetItemRow({
  item,
  onUpdate,
  onDelete,
  disabled = false,
}: BudgetItemRowProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 group hover:bg-muted/20 transition-colors">
      {/* Item label */}
      <span className="flex-1 min-w-0 text-sm truncate">
        {item.subcategory}
      </span>

      {/* Amount input */}
      <div className="relative w-28 shrink-0">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
          $
        </span>
        <Input
          type="number"
          min={0}
          step={0.01}
          value={item.amount || ''}
          onChange={(e) => {
            const val = parseFloat(e.target.value)
            onUpdate(item.id, { amount: isNaN(val) ? 0 : val })
          }}
          onBlur={(e) => {
            // Ensure clean formatting on blur
            const val = parseFloat(e.target.value)
            if (isNaN(val) || val < 0) {
              onUpdate(item.id, { amount: 0 })
            }
          }}
          disabled={disabled}
          className="h-7 pl-5 pr-2 text-xs text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          placeholder="0.00"
        />
      </div>

      {/* Frequency select */}
      <div className="w-28 shrink-0">
        <Select
          value={item.frequency}
          onValueChange={(value) => {
            if (value) onUpdate(item.id, { frequency: value })
          }}
          disabled={disabled}
        >
          <SelectTrigger size="sm" className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Delete button */}
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        disabled={disabled}
        className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 disabled:opacity-0"
        title="Delete item"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
