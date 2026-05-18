'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { RotateCcw, FileDown, Printer, Loader2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { IncomeTab } from './IncomeTab'
import { ExpensesTab } from './ExpensesTab'
import { SummaryCard } from './SummaryCard'
import { type BudgetItem } from './BudgetItemRow'

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

const NEW_ITEM_CATEGORIES = [
  'Home & Utilities',
  'Insurance & Financial',
  'Groceries',
  'Transport & Auto',
  'Entertainment',
  'Personal & Medical',
  'Children',
  'Pets',
] as const

export function BudgetPlannerClient() {
  const [items, setItems] = useState<BudgetItem[]>([])
  const [loading, setLoading] = useState(true)

  // New item creation state
  const [showNewForm, setShowNewForm] = useState<'income' | 'expense' | null>(null)
  const [newSubcategory, setNewSubcategory] = useState('')
  const [newCategory, setNewCategory] = useState<string>('Home & Utilities')
  const [newAmount, setNewAmount] = useState('')
  const [newFrequency, setNewFrequency] = useState('monthly')

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/budget-planner/items')
      if (res.ok) {
        const data = await res.json()
        setItems(data)
      }
    } catch {
      toast.error('Failed to load budget items')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const updateItem = useCallback(async (id: string, updates: Partial<BudgetItem>) => {
    try {
      const res = await fetch(`/api/budget-planner/items/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
        )
      } else {
        toast.error('Failed to save item')
      }
    } catch {
      toast.error('Failed to save item')
    }
  }, [])

  const deleteItem = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/budget-planner/items/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id))
      } else {
        toast.error('Failed to delete item')
      }
    } catch {
      toast.error('Failed to delete item')
    }
  }, [])

  const addItem = useCallback(async () => {
    if (!newSubcategory.trim()) {
      toast.error('Please enter a name for the item')
      return
    }
    if (!showNewForm) return

    try {
      const res = await fetch('/api/budget-planner/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: showNewForm,
          category: showNewForm === 'income' ? 'Income' : newCategory,
          subcategory: newSubcategory.trim(),
          amount: parseFloat(newAmount) || 0,
          frequency: newFrequency,
        }),
      })
      if (res.ok) {
        const newItem = await res.json()
        setItems((prev) => [...prev, newItem])
        setNewSubcategory('')
        setNewAmount('')
        setNewFrequency('monthly')
        setShowNewForm(null)
        toast.success('Item added')
      } else {
        toast.error('Failed to add item')
      }
    } catch {
      toast.error('Failed to add item')
    }
  }, [newSubcategory, newCategory, newAmount, newFrequency, showNewForm])

  const resetToDefaults = useCallback(async () => {
    try {
      const res = await fetch('/api/budget-planner/reset', {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        setItems(data)
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
      'Monthly Amount': calcMonthly(item.amount, item.frequency),
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Budget')
    XLSX.writeFile(
      wb,
      `budget-planner-${new Date().toISOString().slice(0, 10)}.xlsx`
    )
    toast.success('Exported to Excel')
  }, [items])

  const printToPdf = useCallback(() => {
    window.print()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const incomeItems = items.filter((i) => i.type === 'income')
  const expenseItems = items.filter((i) => i.type === 'expense')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3 border-b border-border shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">
          Simple Budget Planner
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Track your monthly income and expenses. Not linked to the Finance system.
        </p>
      </div>

      {/* Main content area with sticky summary */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-6">
          <Tabs defaultValue="income" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="income">Income</TabsTrigger>
                <TabsTrigger value="expenses">Expenses</TabsTrigger>
              </TabsList>

              <TabsContent value="income">
                <IncomeTab
                  items={incomeItems}
                  onUpdate={updateItem}
                  onDelete={deleteItem}
                  onAdd={() => setShowNewForm('income')}
                />

                {/* New item form */}
                {showNewForm === 'income' && (
                  <div className="mt-3 rounded-lg border border-border p-3 space-y-2 bg-muted/20">
                    <p className="text-xs font-medium text-muted-foreground">
                      New Income Source
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Name (e.g. Salary)"
                        value={newSubcategory}
                        onChange={(e) => setNewSubcategory(e.target.value)}
                        className="h-7 text-sm flex-1"
                      />
                      <div className="relative w-24 shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                          $
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="0"
                          value={newAmount}
                          onChange={(e) => setNewAmount(e.target.value)}
                          className="h-7 pl-5 pr-2 text-xs text-right"
                        />
                      </div>
                      <Select
                        value={newFrequency}
                        onValueChange={(v) => v && setNewFrequency(v)}
                      >
                        <SelectTrigger size="sm" className="h-7 w-24 text-xs">
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
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNewForm(null)}
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={addItem}
                        className="text-xs bg-primary text-primary-foreground rounded-md px-3 py-1 hover:bg-primary/90 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="expenses">
                <ExpensesTab
                  items={expenseItems}
                  onUpdate={updateItem}
                  onDelete={deleteItem}
                  onAdd={() => setShowNewForm('expense')}
                />

                {/* New item form */}
                {showNewForm === 'expense' && (
                  <div className="mt-3 rounded-lg border border-border p-3 space-y-2 bg-muted/20">
                    <p className="text-xs font-medium text-muted-foreground">
                      New Expense
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        placeholder="Name (e.g. Electricity)"
                        value={newSubcategory}
                        onChange={(e) => setNewSubcategory(e.target.value)}
                        className="h-7 text-sm flex-1 min-w-[120px]"
                      />
                      <Select value={newCategory} onValueChange={(v) => v && setNewCategory(v)}>
                        <SelectTrigger size="sm" className="h-7 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NEW_ITEM_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="relative w-24 shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                          $
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="0"
                          value={newAmount}
                          onChange={(e) => setNewAmount(e.target.value)}
                          className="h-7 pl-5 pr-2 text-xs text-right"
                        />
                      </div>
                      <Select
                        value={newFrequency}
                        onValueChange={(v) => v && setNewFrequency(v)}
                      >
                        <SelectTrigger size="sm" className="h-7 w-24 text-xs">
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
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNewForm(null)}
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={addItem}
                        className="text-xs bg-primary text-primary-foreground rounded-md px-3 py-1 hover:bg-primary/90 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
        </div>

        {/* Summary — sticky at bottom */}
        <div className="px-4 md:px-6 pb-4 md:pb-6">
          <SummaryCard items={items} />
        </div>
      </div>

      {/* Action buttons — no-print for PDF */}
      <div className="no-print px-4 md:px-6 py-3 border-t border-border bg-background shrink-0 flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={exportToExcel}>
          <FileDown className="h-4 w-4" />
          Export to Excel
        </Button>
        <Button variant="outline" size="sm" onClick={printToPdf}>
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
