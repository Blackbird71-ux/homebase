'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { RotateCcw, FileDown, Printer, Loader2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/financeShared'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { CollapsibleSection } from './CollapsibleSection'
import { BudgetItemRow, type BudgetItem } from './BudgetItemRow'

// ─── Types & constants ────────────────────────────────────────────────────────

export type ViewPeriod = 'weekly' | 'fortnightly' | 'monthly' | 'yearly'

const MONTHLY_MULT: Record<string, number> = {
  weekly: 4.33,
  fortnightly: 2.17,
  monthly: 1,
  yearly: 1 / 12,
}

const VIEW_MULT: Record<ViewPeriod, number> = {
  weekly: 1 / 4.33,
  fortnightly: 1 / 2.17,
  monthly: 1,
  yearly: 12,
}

export const VIEW_LABELS: Record<ViewPeriod, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

const LS_KEY = 'budget-planner:open-sections'

function toView(amount: number, itemFreq: string, vp: ViewPeriod): number {
  return Math.round(amount * (MONTHLY_MULT[itemFreq] ?? 1) * VIEW_MULT[vp] * 100) / 100
}

function sectionTotal(items: BudgetItem[], vp: ViewPeriod): number {
  return items.reduce((s, i) => s + toView(i.amount, i.frequency, vp), 0)
}

function fmt(value: number): string {
  return formatCurrency(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const EXPENSE_CATEGORIES: { name: string; color: string }[] = [
  { name: 'Home & Utilities',      color: '#3B82F6' },
  { name: 'Insurance & Financial', color: '#6366F1' },
  { name: 'Groceries',             color: '#F97316' },
  { name: 'Transport & Auto',      color: '#EAB308' },
  { name: 'Entertainment',         color: '#A855F7' },
  { name: 'Personal & Medical',    color: '#EC4899' },
  { name: 'Children',              color: '#14B8A6' },
  { name: 'Pets',                  color: '#F59E0B' },
]

// ─── Inline add-item form ─────────────────────────────────────────────────────

interface AddFormProps {
  placeholder: string
  onAdd: () => void
  onCancel: () => void
  subcategory: string
  setSubcategory: (v: string) => void
  amount: string
  setAmount: (v: string) => void
  frequency: string
  setFrequency: (v: string) => void
}

function AddItemForm({
  placeholder, onAdd, onCancel,
  subcategory, setSubcategory,
  amount, setAmount,
  frequency, setFrequency,
}: AddFormProps) {
  return (
    <div className="px-3 py-2.5 bg-muted/20 border-t border-border">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          autoFocus
          placeholder={placeholder}
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); if (e.key === 'Escape') onCancel() }}
          className="h-7 text-sm flex-1 min-w-[140px]"
        />
        <div className="relative w-28 shrink-0">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            $
          </span>
          <Input
            type="number"
            min={0}
            step={0.01}
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onAdd() }}
            className="h-7 pl-5 pr-2 text-xs text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <Select value={frequency} onValueChange={(v) => v && setFrequency(v)}>
          <SelectTrigger size="sm" className="h-7 w-28 text-xs shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="fortnightly">Fortnightly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={onAdd}
          className="h-7 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shrink-0"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          title="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Main client ──────────────────────────────────────────────────────────────

export function BudgetPlannerClient() {
  const [items, setItems] = useState<BudgetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>('monthly')

  // All sections start collapsed; hydrate from localStorage after mount
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())
  const [lsLoaded, setLsLoaded] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      if (saved) setOpenSections(new Set(JSON.parse(saved) as string[]))
    } catch { /* ignore */ }
    setLsLoaded(true)
  }, [])

  const toggleSection = useCallback((name: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      try { localStorage.setItem(LS_KEY, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [])

  // 'income' | category name | null
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [newSubcategory, setNewSubcategory] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newFrequency, setNewFrequency] = useState('monthly')

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/budget-planner/items')
      if (res.ok) setItems(await res.json())
    } catch {
      toast.error('Failed to load budget items')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const updateItem = useCallback(async (id: string, updates: Partial<BudgetItem>) => {
    try {
      const res = await fetch(`/api/budget-planner/items/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))
      } else {
        toast.error('Failed to save item')
      }
    } catch {
      toast.error('Failed to save item')
    }
  }, [])

  const deleteItem = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/budget-planner/items/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id))
      } else {
        toast.error('Failed to delete item')
      }
    } catch {
      toast.error('Failed to delete item')
    }
  }, [])

  const startAdding = useCallback((section: string) => {
    setAddingTo(section)
    setNewSubcategory('')
    setNewAmount('')
    setNewFrequency('monthly')
    // Ensure the section is open when the add form is triggered
    setOpenSections((prev) => {
      if (prev.has(section)) return prev
      const next = new Set(prev)
      next.add(section)
      try { localStorage.setItem(LS_KEY, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [])

  const addItem = useCallback(async () => {
    if (!newSubcategory.trim()) { toast.error('Please enter a name'); return }
    if (!addingTo) return
    const isIncome = addingTo === 'income'
    try {
      const res = await fetch('/api/budget-planner/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: isIncome ? 'income' : 'expense',
          category: isIncome ? 'Income' : addingTo,
          subcategory: newSubcategory.trim(),
          amount: parseFloat(newAmount) || 0,
          frequency: newFrequency,
        }),
      })
      if (res.ok) {
        const newItem = await res.json()
        setItems((prev) => [...prev, newItem])
        setAddingTo(null)
        toast.success('Item added')
      } else {
        toast.error('Failed to add item')
      }
    } catch {
      toast.error('Failed to add item')
    }
  }, [newSubcategory, newAmount, newFrequency, addingTo])

  const resetToDefaults = useCallback(async () => {
    if (!confirm('Reset to default items? Any custom items you have added will be removed.')) return
    try {
      const res = await fetch('/api/budget-planner/reset', { method: 'POST' })
      if (res.ok) {
        setItems(await res.json())
        toast.success('Reset to default items')
      } else {
        toast.error('Failed to reset')
      }
    } catch {
      toast.error('Failed to reset')
    }
  }, [])

  const exportToExcel = useCallback(() => {
    const data = items.map((item) => ({
      Type: item.type === 'income' ? 'Income' : 'Expense',
      Category: item.category,
      Subcategory: item.subcategory,
      Amount: item.amount,
      Frequency: item.frequency,
      'Monthly Amount': Math.round(item.amount * (MONTHLY_MULT[item.frequency] ?? 1) * 100) / 100,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Budget')
    XLSX.writeFile(wb, `budget-planner-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success('Exported to Excel')
  }, [items])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const incomeItems  = items.filter((i) => i.type === 'income')
  const expenseItems = items.filter((i) => i.type === 'expense')
  const totalIncome   = sectionTotal(incomeItems, viewPeriod)
  const totalExpenses = sectionTotal(expenseItems, viewPeriod)
  const remaining     = totalIncome - totalExpenses

  const addFormProps = {
    subcategory: newSubcategory, setSubcategory: setNewSubcategory,
    amount: newAmount,          setAmount: setNewAmount,
    frequency: newFrequency,    setFrequency: setNewFrequency,
    onAdd: addItem,             onCancel: () => setAddingTo(null),
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3 border-b border-border shrink-0 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="hb-page-head__title">Simple Budget Planner</h1>
          <p className="hb-page-head__sub">Not linked to the Finance accounting system.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-1">
          <span className="text-sm text-muted-foreground">View:</span>
          <Select value={viewPeriod} onValueChange={(v) => v && setViewPeriod(v as ViewPeriod)}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="fortnightly">Fortnightly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Scrollable questionnaire */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-4 space-y-1.5">

          {/* Helper text */}
          <p className="text-sm text-muted-foreground pb-1">
            Expand each category, enter your income and costs, and add any extras you need. Your totals update as you go.
          </p>

          {/* Income */}
          <CollapsibleSection
            title="Income"
            colorDot="#22C55E"
            subtitle={fmt(totalIncome)}
            isOpen={lsLoaded && openSections.has('income')}
            onToggle={() => toggleSection('income')}
          >
            {incomeItems.map((item) => (
              <BudgetItemRow
                key={item.id}
                item={item}
                onUpdate={updateItem}
                onDelete={deleteItem}
                viewPeriod={viewPeriod}
              />
            ))}
            {addingTo === 'income' ? (
              <AddItemForm {...addFormProps} placeholder="e.g. Salary, Freelance income" />
            ) : (
              <button
                type="button"
                onClick={() => startAdding('income')}
                className="flex items-center gap-1.5 w-full px-3 py-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-muted/30 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add income source
              </button>
            )}
          </CollapsibleSection>

          {/* Expense categories */}
          {EXPENSE_CATEGORIES.map(({ name, color }) => {
            const catItems = expenseItems.filter((i) => i.category === name)
            const catTotal = sectionTotal(catItems, viewPeriod)
            return (
              <CollapsibleSection
                key={name}
                title={name}
                colorDot={color}
                subtitle={fmt(catTotal)}
                isOpen={lsLoaded && openSections.has(name)}
                onToggle={() => toggleSection(name)}
              >
                {catItems.map((item) => (
                  <BudgetItemRow
                    key={item.id}
                    item={item}
                    onUpdate={updateItem}
                    onDelete={deleteItem}
                    viewPeriod={viewPeriod}
                  />
                ))}
                {addingTo === name ? (
                  <AddItemForm {...addFormProps} placeholder="e.g. Electricity, Internet" />
                ) : (
                  <button
                    type="button"
                    onClick={() => startAdding(name)}
                    className="flex items-center gap-1.5 w-full px-3 py-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-muted/30 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add item
                  </button>
                )}
              </CollapsibleSection>
            )
          })}

          {/* Summary row */}
          <div
            className={`flex items-center justify-between px-4 py-3 rounded-lg mt-2 ${
              remaining >= 0 ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground'
            }`}
          >
            <span className="text-sm font-semibold">Summary</span>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-bold">{fmt(remaining)}</span>
              <span className="text-xs opacity-70">{VIEW_LABELS[viewPeriod]}</span>
            </div>
          </div>

          {/* Income / expenses breakdown */}
          <div className="flex justify-between px-1 py-1.5 text-sm text-muted-foreground">
            <span>
              Income:{' '}
              <span className="text-emerald-500 font-medium">{fmt(totalIncome)}</span>
            </span>
            <span>
              Expenses:{' '}
              <span className="text-red-500 font-medium">{fmt(totalExpenses)}</span>
            </span>
          </div>

        </div>
      </div>

      {/* Action bar */}
      <div className="no-print px-4 md:px-6 py-3 border-t border-border bg-background shrink-0 flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={exportToExcel}>
          <FileDown className="h-4 w-4" />
          Export to Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print / PDF
        </Button>
        <Button variant="ghost" size="sm" onClick={resetToDefaults}>
          <RotateCcw className="h-4 w-4" />
          Reset to Defaults
        </Button>
      </div>
    </div>
  )
}
