'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { cn } from '@/lib/utils'

interface Budget {
  id: string; name: string; amount: number; period: string
  startDate: string; endDate: string; rollover: boolean
  alertThreshold: number; category: { id: string; name: string; color: string | null } | null
}

export default function BudgetPage() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; type: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [form, setForm] = useState({
    name: '', amount: 0, categoryId: '', period: 'monthly',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
    rollover: false, alertThreshold: 80,
  })

  // Simulated spent data — in production would aggregate transactions
  const [spentMap, setSpentMap] = useState<Record<string, number>>({})

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/budget')
      if (res.ok) setBudgets(await res.json())
      // Load this month's spending per category
      const txRes = await fetch(`/api/finance/transactions?startDate=${startOfMonth(new Date()).toISOString()}&endDate=${endOfMonth(new Date()).toISOString()}&limit=1000`)
      if (txRes.ok) {
        const txData = await txRes.json()
        const spent: Record<string, number> = {}
        txData.transactions.forEach((tx: any) => {
          if (tx.type === 'expense' && tx.categoryId) {
            spent[tx.categoryId] = (spent[tx.categoryId] || 0) + tx.amount
          }
        })
        setSpentMap(spent)
      }
    } finally { setLoading(false) }
  }
  async function loadRefs() {
    const cRes = await fetch('/api/finance/categories')
    if (cRes.ok) setCategories((await cRes.json()).filter((c: any) => c.type === 'expense'))
  }
  useEffect(() => { loadRefs(); load() }, [])

  function openNew() {
    setEditing(null); setForm({ name: '', amount: 0, categoryId: '', period: 'monthly', startDate: new Date().toISOString().split('T')[0], endDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0], rollover: false, alertThreshold: 80 })
    setShowForm(true)
  }
  function openEdit(b: Budget) {
    setEditing(b); setForm({ name: b.name, amount: b.amount, categoryId: b.category?.id ?? '', period: b.period, startDate: new Date(b.startDate).toISOString().split('T')[0], endDate: new Date(b.endDate).toISOString().split('T')[0], rollover: b.rollover, alertThreshold: b.alertThreshold })
    setShowForm(true)
  }

  async function handleSave() {
    const body = editing ? { id: editing.id, ...form, categoryId: form.categoryId || null } : { ...form, categoryId: form.categoryId || null }
    const res = await fetch('/api/finance/budget', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { toast.success(editing ? 'Budget updated' : 'Budget created'); setShowForm(false); setEditing(null); load() }
    else { const err = await res.json(); toast.error(err.error ?? 'Failed') }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this budget rule?')) return
    const res = await fetch(`/api/finance/budget?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Budget deleted'); load() }
    else toast.error('Failed to delete')
  }

  function formatCurrency(amount: number) { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount) }

  if (loading) return <div className="p-4 text-muted-foreground">Loading budgets…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Budget Rules</h1>
        <button onClick={openNew} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <Plus className="h-4 w-4" /> Add Budget
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="font-semibold">{editing ? 'Edit Budget' : 'New Budget Rule'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Amount *</label>
              <input type="number" step="0.01" value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Period *</label>
              <select value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <select value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">All expense categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Alert at %</label>
              <input type="number" min={0} max={100} value={form.alertThreshold}
                onChange={e => setForm(p => ({ ...p, alertThreshold: parseInt(e.target.value) || 80 }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div className="flex items-center gap-4 pt-6">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={form.rollover}
                  onChange={e => setForm(p => ({ ...p, rollover: e.target.checked }))} />
                Rollover unused
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium">
              {editing ? 'Update' : 'Create'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null) }}
              className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {budgets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No budget rules yet.</p>
      ) : (
        <div className="space-y-3">
          {budgets.map(b => {
            const spent = b.category?.id ? (spentMap[b.category.id] || 0) : Object.values(spentMap).reduce((a, b) => a + b, 0)
            const percentage = b.amount > 0 ? Math.min(100, Math.round((spent / b.amount) * 100)) : 0
            const isWarning = percentage >= b.alertThreshold

            return (
              <div key={b.id} className={cn('rounded-lg border p-4', isWarning ? 'border-amber-500/30 bg-amber-500/5' : 'border-border')}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium">{b.name}</span>
                    {b.category && <span className="text-xs text-muted-foreground ml-2">{b.category.name}</span>}
                    <span className="text-xs text-muted-foreground ml-2 capitalize">({b.period})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(b)} className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => handleDelete(b.id)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Spent: <strong>{formatCurrency(spent)}</strong> of {formatCurrency(b.amount)}</span>
                  <span className={isWarning ? 'text-amber-500 font-medium' : 'text-muted-foreground'}>{percentage}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={cn('h-full transition-all rounded-full',
                    percentage >= 100 ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-green-500')}
                    style={{ width: `${percentage}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}