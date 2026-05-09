'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Pencil, Trash2, TrendingUp, TrendingDown, Wallet,
  GripVertical, Check, X, Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { addYears } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncomeStream {
  id: string; name: string; amount: number
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'yearly'; isIncluded: boolean
}

interface BudgetRule {
  id: string; name: string; amount: number; period: string
  categoryId: string | null; billId: string | null; isIncludedInPlanner: boolean
  category: { id: string; name: string; color: string | null } | null
  bill: { id: string; name: string; amount: number; frequency: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMonthly(amount: number, frequency: string): number {
  if (frequency === 'weekly')      return amount * 52 / 12
  if (frequency === 'fortnightly') return amount * 26 / 12
  if (frequency === 'quarterly')   return amount / 3
  if (frequency === 'yearly')      return amount / 12
  return amount
}

function toMonthlyIncome(amount: number, frequency: string): number {
  return toMonthly(amount, frequency)
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', yearly: 'Yearly',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const [incomeStreams, setIncomeStreams] = useState<IncomeStream[]>([])
  const [budgetRules, setBudgetRules]     = useState<BudgetRule[]>([])
  const [categories, setCategories]       = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading]             = useState(true)

  // Income editing
  const [editingIncome, setEditingIncome] = useState<IncomeStream | null>(null)
  const [incomeForm, setIncomeForm]       = useState<{ name: string; amount: number; frequency: IncomeStream['frequency'] }>({ name: '', amount: 0, frequency: 'fortnightly' })
  const [showIncomeForm, setShowIncomeForm] = useState(false)
  const [savingIncome, setSavingIncome]   = useState(false)

  // Budget rule editing
  const [showRuleForm, setShowRuleForm]   = useState(false)
  const [editingRule, setEditingRule]     = useState<BudgetRule | null>(null)
  const [ruleForm, setRuleForm]           = useState({ name: '', amount: 0, period: 'monthly', categoryId: '' })

  async function load() {
    setLoading(true)
    try {
      const [iRes, bRes, cRes] = await Promise.all([
        fetch('/api/finance/income-streams'),
        fetch('/api/finance/budget'),
        fetch('/api/finance/categories'),
      ])
      if (iRes.ok) setIncomeStreams(await iRes.json())
      if (bRes.ok) setBudgetRules(await bRes.json())
      if (cRes.ok) {
        const all: any[] = await cRes.json()
        setCategories(all.filter(c => c.type === 'expense'))
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // ── Income stream CRUD ─────────────────────────────────────────────────────

  function openNewIncome() {
    setEditingIncome(null)
    setIncomeForm({ name: '', amount: 0, frequency: 'fortnightly' })
    setShowIncomeForm(true)
  }

  function openEditIncome(s: IncomeStream) {
    setEditingIncome(s)
    setIncomeForm({ name: s.name, amount: s.amount, frequency: s.frequency })
    setShowIncomeForm(true)
  }

  async function saveIncomeStreams(next: IncomeStream[]) {
    setSavingIncome(true)
    try {
      const res = await fetch('/api/finance/income-streams', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (res.ok) { setIncomeStreams(await res.json()); return true }
      toast.error('Failed to save income'); return false
    } finally { setSavingIncome(false) }
  }

  async function handleSaveIncome() {
    if (!incomeForm.name.trim()) { toast.error('Name is required'); return }
    const updated = editingIncome
      ? incomeStreams.map(s => s.id === editingIncome.id ? { ...s, ...incomeForm } : s)
      : [...incomeStreams, { id: genId(), ...incomeForm, isIncluded: true }]
    if (await saveIncomeStreams(updated)) {
      setShowIncomeForm(false); setEditingIncome(null)
    }
  }

  async function handleDeleteIncome(id: string) {
    if (!confirm('Remove this income stream?')) return
    await saveIncomeStreams(incomeStreams.filter(s => s.id !== id))
  }

  async function toggleIncomeIncluded(id: string) {
    const next = incomeStreams.map(s => s.id === id ? { ...s, isIncluded: !s.isIncluded } : s)
    await saveIncomeStreams(next)
  }

  // ── Budget rule CRUD ───────────────────────────────────────────────────────

  function openNewRule() {
    setEditingRule(null)
    setRuleForm({ name: '', amount: 0, period: 'monthly', categoryId: '' })
    setShowRuleForm(true)
  }

  function openEditRule(r: BudgetRule) {
    setEditingRule(r)
    setRuleForm({ name: r.name, amount: r.amount, period: r.period, categoryId: r.categoryId ?? '' })
    setShowRuleForm(true)
  }

  async function handleSaveRule() {
    if (!ruleForm.name.trim()) { toast.error('Name is required'); return }
    const body = editingRule
      ? { id: editingRule.id, ...ruleForm, categoryId: ruleForm.categoryId || null }
      : { ...ruleForm, categoryId: ruleForm.categoryId || null }
    const res = await fetch('/api/finance/budget', {
      method: editingRule ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { toast.success(editingRule ? 'Rule updated' : 'Rule created'); setShowRuleForm(false); setEditingRule(null); load() }
    else { const e = await res.json(); toast.error(e.error ?? 'Failed') }
  }

  async function handleDeleteRule(id: string) {
    if (!confirm('Delete this budget rule?')) return
    const res = await fetch(`/api/finance/budget?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Rule deleted'); load() }
    else toast.error('Failed to delete')
  }

  async function toggleRuleIncluded(rule: BudgetRule) {
    const res = await fetch('/api/finance/budget', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rule.id, isIncludedInPlanner: !rule.isIncludedInPlanner }),
    })
    if (res.ok) {
      setBudgetRules(prev => prev.map(r => r.id === rule.id ? { ...r, isIncludedInPlanner: !r.isIncludedInPlanner } : r))
    }
  }

  // ── Calculations ───────────────────────────────────────────────────────────

  const monthlyIncome = incomeStreams
    .filter(s => s.isIncluded)
    .reduce((sum, s) => sum + toMonthlyIncome(s.amount, s.frequency), 0)

  const monthlyExpenses = budgetRules
    .filter(r => r.isIncludedInPlanner)
    .reduce((sum, r) => sum + toMonthly(r.amount, r.period), 0)

  const surplus = monthlyIncome - monthlyExpenses
  const expenseRules = budgetRules.filter(r => r.isIncludedInPlanner)
  const maxExpense = expenseRules.length > 0
    ? Math.max(...expenseRules.map(r => toMonthly(r.amount, r.period)))
    : 0

  if (loading) return <div className="p-4 text-muted-foreground">Loading budget planner…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Budget Planner</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your estimated monthly cashflow — income in, expected costs out.
          </p>
        </div>
      </div>

      {/* ── Summary strip ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-green-500/5 p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-green-500" /> Monthly income
          </div>
          <p className="text-2xl font-bold text-green-600">{fmtCurrency(monthlyIncome)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {incomeStreams.filter(s => s.isIncluded).length} stream{incomeStreams.filter(s => s.isIncluded).length !== 1 ? 's' : ''} included
          </p>
        </div>
        <div className="rounded-lg border border-border bg-red-500/5 p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" /> Monthly expenses
          </div>
          <p className="text-2xl font-bold text-red-600">{fmtCurrency(monthlyExpenses)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {budgetRules.filter(r => r.isIncludedInPlanner).length} rule{budgetRules.filter(r => r.isIncludedInPlanner).length !== 1 ? 's' : ''} included
          </p>
        </div>
        <div className={cn('rounded-lg border p-4',
          surplus >= 0 ? 'border-primary/30 bg-primary/5' : 'border-red-500/30 bg-red-500/5')}>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Wallet className="h-3.5 w-3.5" style={{ color: surplus >= 0 ? 'var(--primary)' : '#ef4444' }} />
            Monthly surplus
          </div>
          <p className={cn('text-2xl font-bold', surplus >= 0 ? 'text-primary' : 'text-red-600')}>
            {fmtCurrency(surplus)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {surplus >= 0 ? 'Left over after expenses' : 'Expenses exceed income'}
          </p>
        </div>
      </div>

      {/* ── Income streams ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Income streams</h2>
          <button onClick={openNewIncome}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <Plus className="h-4 w-4" /> Add income
          </button>
        </div>

        {showIncomeForm && (
          <div className="rounded-lg border border-border p-4 space-y-3 mb-3">
            <h3 className="font-semibold text-sm">{editingIncome ? 'Edit income stream' : 'New income stream'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Name *</label>
                <input value={incomeForm.name}
                  onChange={e => setIncomeForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. My salary, Mark salary"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Amount *</label>
                <input type="number" step="0.01" value={incomeForm.amount}
                  onChange={e => setIncomeForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Frequency *</label>
                <select value={incomeForm.frequency}
                  onChange={e => setIncomeForm(p => ({ ...p, frequency: e.target.value as any }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
            {incomeForm.amount > 0 && (
              <p className="text-xs text-muted-foreground">
                = <strong>{fmtCurrency(toMonthlyIncome(incomeForm.amount, incomeForm.frequency))}</strong>/month
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={handleSaveIncome} disabled={savingIncome}
                className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium disabled:opacity-50">
                {savingIncome ? 'Saving…' : editingIncome ? 'Update' : 'Add'}
              </button>
              <button onClick={() => { setShowIncomeForm(false); setEditingIncome(null) }}
                className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {incomeStreams.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No income streams yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Add your salary, rental income, or any other regular income.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {incomeStreams.map(s => {
              const monthly = toMonthlyIncome(s.amount, s.frequency)
              return (
                <div key={s.id} className={cn(
                  'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                  s.isIncluded ? 'border-green-500/20 bg-green-500/5' : 'border-border opacity-60',
                )}>
                  <button onClick={() => toggleIncomeIncluded(s.id)}
                    className={cn('w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                      s.isIncluded ? 'bg-green-500 border-green-500' : 'border-muted-foreground')}
                    title={s.isIncluded ? 'Exclude from total' : 'Include in total'}>
                    {s.isIncluded && <Check className="h-3 w-3 text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{FREQ_LABELS[s.frequency]}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-green-600">{fmtCurrency(s.amount)}</p>
                    {s.frequency !== 'monthly' && (
                      <p className="text-xs text-muted-foreground">{fmtCurrency(monthly)}/mo</p>
                    )}
                  </div>
                  <button onClick={() => openEditIncome(s)} className="p-1 hover:bg-accent rounded">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDeleteIncome(s.id)} className="p-1 hover:bg-accent rounded text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
            {incomeStreams.some(s => !s.isIncluded) && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                Unticked streams are excluded from the monthly total.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Budget rules / expected costs ──────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-base font-semibold">Expected costs</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bills flagged "include in budget" appear here automatically. Add manual rules for things like groceries.
            </p>
          </div>
          <button onClick={openNewRule}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline shrink-0">
            <Plus className="h-4 w-4" /> Add rule
          </button>
        </div>

        {showRuleForm && (
          <div className="rounded-lg border border-border p-4 space-y-3 mb-3">
            <h3 className="font-semibold text-sm">{editingRule ? 'Edit budget rule' : 'New budget rule'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Name *</label>
                <input value={ruleForm.name} onChange={e => setRuleForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Groceries, Entertainment"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Monthly amount *</label>
                <input type="number" step="0.01" value={ruleForm.amount}
                  onChange={e => setRuleForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Period</label>
                <select value={ruleForm.period} onChange={e => setRuleForm(p => ({ ...p, period: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Category (optional)</label>
                <select value={ruleForm.categoryId} onChange={e => setRuleForm(p => ({ ...p, categoryId: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSaveRule}
                className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium">
                {editingRule ? 'Update' : 'Add rule'}
              </button>
              <button onClick={() => { setShowRuleForm(false); setEditingRule(null) }}
                className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {budgetRules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No budget rules yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tick "Include in budget" when adding bills, or add manual rules for groceries, entertainment, etc.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {budgetRules.map(r => {
              const monthly = toMonthly(r.amount, r.period)
              const barPct = maxExpense > 0 ? (monthly / maxExpense) * 100 : 0
              const fromBill = !!r.billId
              return (
                <div key={r.id} className={cn(
                  'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                  r.isIncludedInPlanner ? 'border-border' : 'border-border opacity-50',
                )}>
                  <button onClick={() => toggleRuleIncluded(r)}
                    className={cn('w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                      r.isIncludedInPlanner ? 'bg-primary border-primary' : 'border-muted-foreground')}
                    title={r.isIncludedInPlanner ? 'Exclude from total' : 'Include in total'}>
                    {r.isIncludedInPlanner && <Check className="h-3 w-3 text-primary-foreground" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{r.name}</span>
                      {r.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: r.category.color ?? '#6B7280' }}>
                          {r.category.name}
                        </span>
                      )}
                      {fromBill && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          from bill
                        </span>
                      )}
                    </div>
                    {r.isIncludedInPlanner && (
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-primary/60 transition-all"
                          style={{ width: `${Math.min(100, barPct)}%` }} />
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0 min-w-[70px]">
                    <p className="text-sm font-semibold">{fmtCurrency(r.amount)}</p>
                    {r.period !== 'monthly' && r.isIncludedInPlanner && (
                      <p className="text-xs text-muted-foreground">{fmtCurrency(monthly)}/mo</p>
                    )}
                    {r.period === 'monthly' && (
                      <p className="text-xs text-muted-foreground capitalize">{r.period}</p>
                    )}
                  </div>

                  {!fromBill && (
                    <button onClick={() => openEditRule(r)} className="p-1 hover:bg-accent rounded">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => handleDeleteRule(r.id)} className="p-1 hover:bg-accent rounded text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}

            {/* Totals */}
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 mt-2">
              <div>
                <p className="text-xs text-muted-foreground">Included rules</p>
                <p className="font-semibold">{budgetRules.filter(r => r.isIncludedInPlanner).length} of {budgetRules.length}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total expected / month</p>
                <p className="font-semibold text-red-600">{fmtCurrency(monthlyExpenses)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Surplus callout ────────────────────────────────────────────────── */}
      {(incomeStreams.length > 0 || budgetRules.length > 0) && (
        <div className={cn('rounded-lg border p-4',
          surplus >= 0 ? 'border-primary/30 bg-primary/5' : 'border-red-500/30 bg-red-500/5')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{surplus >= 0 ? 'Estimated monthly surplus' : 'Estimated monthly shortfall'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fmtCurrency(monthlyIncome)} income − {fmtCurrency(monthlyExpenses)} expenses
              </p>
            </div>
            <p className={cn('text-3xl font-bold', surplus >= 0 ? 'text-primary' : 'text-red-600')}>
              {fmtCurrency(Math.abs(surplus))}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
