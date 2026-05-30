'use client'

import { useState, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/financeShared'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ViewPeriod } from './BudgetPlannerClient'

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
  viewPeriod?: ViewPeriod
}

const FREQUENCIES = [
  { value: 'weekly',      label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly',     label: 'Monthly' },
  { value: 'yearly',      label: 'Yearly' },
] as const

const MONTHLY_MULT: Record<string, number> = {
  weekly: 4.33, fortnightly: 2.17, monthly: 1, yearly: 1 / 12,
}
const VIEW_MULT: Record<ViewPeriod, number> = {
  weekly: 1 / 4.33, fortnightly: 1 / 2.17, monthly: 1, yearly: 12,
}
const VIEW_ABBREV: Record<ViewPeriod, string> = {
  weekly: 'wk', fortnightly: 'fn', monthly: 'mo', yearly: 'yr',
}

function fmtShort(v: number) {
  return formatCurrency(v, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function BudgetItemRow({
  item,
  onUpdate,
  onDelete,
  disabled = false,
  viewPeriod = 'monthly',
}: BudgetItemRowProps) {
  const [inputValue, setInputValue] = useState(
    item.amount > 0 ? String(item.amount) : ''
  )

  useEffect(() => {
    setInputValue(item.amount > 0 ? String(item.amount) : '')
  }, [item.amount])

  // Show view-period equivalent when item frequency differs from view period
  const viewAmount = item.amount > 0 && item.frequency !== viewPeriod
    ? Math.round(item.amount * (MONTHLY_MULT[item.frequency] ?? 1) * VIEW_MULT[viewPeriod] * 100) / 100
    : null

  return (
    <div className="flex items-center gap-2 px-3 py-2 group hover:bg-muted/20 transition-colors">
      <span className="flex-1 min-w-0 text-sm truncate">{item.subcategory}</span>

      {/* View-period equivalent */}
      <span className={`shrink-0 text-xs text-muted-foreground/60 w-20 text-right transition-opacity ${viewAmount !== null ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {viewAmount !== null ? `≈ ${fmtShort(viewAmount)}/${VIEW_ABBREV[viewPeriod]}` : ''}
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
            if (clean !== item.amount) onUpdate(item.id, { amount: clean })
          }}
          disabled={disabled}
          placeholder="0.00"
          className="h-7 pl-5 pr-2 text-xs text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      {/* Frequency */}
      <div className="w-28 shrink-0">
        <Select
          value={item.frequency}
          onValueChange={(v) => { if (v) onUpdate(item.id, { frequency: v }) }}
          disabled={disabled}
        >
          <SelectTrigger size="sm" className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Delete */}
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
