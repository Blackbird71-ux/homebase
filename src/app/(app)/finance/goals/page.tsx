'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface Goal {
  id: string; name: string; targetAmount: number; currentAmount: number
  targetDate: string | null; isComplete: boolean; color: string | null; icon: string | null
  account: { id: string; name: string } | null
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [form, setForm] = useState({
    name: '', targetAmount: 0, currentAmount: 0, targetDate: '',
    accountId: '', color: '#10B981', icon: '',
  })

  async function load() {
    setLoading(true)
    try { const res = await fetch('/api/finance/goals'); if (res.ok) setGoals(await res.json()) }
    finally { setLoading(false) }
  }
  async function loadRefs() {
    const aRes = await fetch('/api/finance/accounts')
    if (aRes.ok) setAccounts(await aRes.json())
  }
  useEffect(() => { loadRefs(); load() }, [])

  function openNew() {
    setEditing(null); setForm({ name: '', targetAmount: 0, currentAmount: 0, targetDate: '', accountId: '', color: '#10B981', icon: '' })
    setShowForm(true)
  }
  function openEdit(g: Goal) {
    setEditing(g); setForm({
      name: g.name, targetAmount: g.targetAmount, currentAmount: g.currentAmount,
      targetDate: g.targetDate ? new Date(g.targetDate).toISOString().split('T')[0] : '',
      accountId: g.account?.id ?? '', color: g.color ?? '#10B981', icon: g.icon ?? '',
    }); setShowForm(true)
  }

  async function handleSave() {
    const body = editing ? { id: editing.id, ...form, accountId: form.accountId || null, targetDate: form.targetDate || null } : { ...form, accountId: form.accountId || null, targetDate: form.targetDate || null }
    const res = await fetch('/api/finance/goals', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { toast.success(editing ? 'Goal updated' : 'Goal created'); setShowForm(false); setEditing(null); load() }
    else { const err = await res.json(); toast.error(err.error ?? 'Failed') }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this goal?')) return
    const res = await fetch(`/api/finance/goals?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Goal deleted'); load() }
    else toast.error('Failed to delete')
  }

  function formatCurrency(amount: number) { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount) }

  if (loading) return <div className="p-4 text-muted-foreground">Loading goals…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Savings Goals</h1>
        <button onClick={openNew} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <Plus className="h-4 w-4" /> Add Goal
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="font-semibold">{editing ? 'Edit Goal' : 'New Savings Goal'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Target Amount *</label>
              <input type="number" step="0.01" value={form.targetAmount}
                onChange={e => setForm(p => ({ ...p, targetAmount: parseFloat(e.target.value) || 0 }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Current Amount</label>
              <input type="number" step="0.01" value={form.currentAmount}
                onChange={e => setForm(p => ({ ...p, currentAmount: parseFloat(e.target.value) || 0 }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Target Date</label>
              <input type="date" value={form.targetDate}
                onChange={e => setForm(p => ({ ...p, targetDate: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Linked Account</label>
              <select value={form.accountId} onChange={e => setForm(p => ({ ...p, accountId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">No account</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Color</label>
              <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                className="h-8 w-8 rounded cursor-pointer" />
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

      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">No savings goals yet. Start saving by adding a goal!</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map(g => {
            const percentage = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0
            const isComplete = g.isComplete || percentage >= 100

            return (
              <div key={g.id} className={cn('rounded-lg border p-5', isComplete ? 'border-green-500/30 bg-green-500/5' : 'border-border')}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color ?? '#10B981' }} />
                    <h3 className="font-semibold">{g.name}</h3>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(g)} className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => handleDelete(g.id)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-2xl font-bold">{formatCurrency(g.currentAmount)}</span>
                  <span className="text-sm text-muted-foreground">of {formatCurrency(g.targetAmount)}</span>
                </div>

                <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-2">
                  <div className={cn('h-full rounded-full transition-all',
                    isComplete ? 'bg-green-500' : percentage >= 75 ? 'bg-amber-500' : 'bg-primary')}
                    style={{ width: `${percentage}%` }} />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{percentage}% complete</span>
                  {g.targetDate && <span>By {format(new Date(g.targetDate), 'MMM yyyy')}</span>}
                </div>

                {isComplete && (
                  <div className="mt-2 text-xs text-green-600 font-medium">🎉 Goal completed!</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}