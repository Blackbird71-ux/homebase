'use client'

import { useState, useEffect } from 'react'
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

const monthlyMultiplier: Record<string, number> = {
  weekly: 4.33,
  fortnightly: 2.17,
  monthly: 1,
  yearly: 1 / 12,
}

function calcMonthly(amount: number, frequency: string): number {
  return Math.round(amount * (monthlyMultiplier[frequency] ?? 1) * 100) / 100
}

function formatShort(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function BudgetItemRow({
  item,
  onUpdate,
  onDelete,
  disabled = false,
}: BudgetItemRowProps) {
  const [inputValue, setInputValue] = useState(
    item.amount > 0 ? String(item.amount) : ''
  )

  // Sync local input when item changes from outside (e.g. reset to defaults)
  useEffect(() => {
    setInputValue(item.amount > 0 ? String(item.amount) : '')
  }, [item.amount])

  const monthly = calcMonthly(item.amount, item.frequency)
  const showMonthly = item.amount > 0 && item.frequency !== 'monthly'

  return (
    <div className="flex items-center gap-2 px-3 py-2 group hover:bg-muted/20 transition-colors">
      {/* Item label */}
      <span className="flex-1 min-w-0 text-sm truncate">{item.subcategory}</span>

      {/* Monthly equivalent — only shown when frequency isn't monthly */}
      <span
        className={`shrink-0 text-xs text-muted-foreground/60 w-16 text-right transition-opacity ${
          showMonthly ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {showMonthly ? `${formatShort(monthly)}/mo` : ''}
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
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={(e) => {
            const val = parseFloat(e.target.value)
            const clean = isNaN(val) || val < 0 ? 0 : val
            setInputValue(clean > 0 ? String(clean) : '')
            if (clean !== item.amount) {
              onUpdate(item.id, { amount: clean })
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
