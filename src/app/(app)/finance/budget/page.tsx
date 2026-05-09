'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Pencil, Trash2, TrendingUp, TrendingDown, Wallet,
  Check, Briefcase, Settings, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Entity {
  id: string
  name: string
  type: string
  color: string | null
  icon: string | null
  isDefault: boolean
  sortOrder: number
}

interface IncomeStream {
  id: string
  name: string
  amount: number
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'yearly'
  isIncluded: boolean
  entityId?: string | null
}

interface BudgetRule {
  id: string
  name: string
  amount: number
  period: string
  categoryId: string | null
  billId: string | null
  isIncludedInPlanner: boolean
  entityId: string | null
  category: { id: string; name: string; color: string | null } | null
  bill: { id: string; name: string; amount: number; frequency: string } | null
  entity: { id: string; name: string; color: string | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toMonthly(amount: number, frequency: string): number {
  if (frequency === 'weekly')      return amount * 52 / 12
  if (frequency === 'fortnightly') return amount * 26 / 12
  if (frequency === 'quarterly')   return amount / 3
  if (frequency === 'yearly')      return amount / 12
  return amount
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

const ENTITY_TYPE_LABELS: Record<string, string> = {
  personal: 'Personal', superfund: 'Super Fund', trust: 'Trust',
  business: 'Business', investment: 'Investment', other: 'Other',
}

// Colour palette for new entities
const ENTITY_COLOURS = [
  '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444',
  '#06B6D4', '#EC4899', '#84CC16', '#F97316', '#6366F1',
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const [entities, setEntities]           = useState<Entity[]>([])
  const [incomeStreams, setIncomeStreams]  = useState<IncomeStream[]>([])
  const [budgetRules, setBudgetRules]     = useState<BudgetRule[]>([])
  const [categories, setCategories]       = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading]             = useState(true)

  // Active entity tab — null means "All / overview"
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null)

  // Income editing
  const [editingIncome, setEditingIncome]   = useState<IncomeStream | null>(null)
  const [incomeForm, setIncomeForm]         = useState<{ name: string; amount: number; frequency: IncomeStream['frequency']; entityId: string }>
    ({ name: '', amount: 0, frequency: 'fortnightly', entityId: '' })
  const [showIncomeForm, setShowIncomeForm] = useState(false)
  const [savingIncome, setSavingIncome]     = useState(false)

  // Budget rule editing
  const [showRuleForm, setShowRuleForm]   = useState(false)
  const [editingRule, setEditingRule]     = useState<BudgetRule | null>(null)
  const [ruleForm, setRuleForm]           = useState({ name: '', amount: 0, period: 'monthly', categoryId: '', entityId: '' })

  // Entity management modal
  const [showEntityModal, setShowEntityModal] = useState(false)
  const [editingEntity, setEditingEntity]     = useState<Entity | null>(null)
  const [entityForm, setEntityForm]           = useState({ name: '', type: 'personal', color: '#3B82F6', description: '' })
  const [savingEntity, setSavingEntity]       = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [eRes, iRes, bRes, cRes] = await Promise.all([
        fetch('/api/finance/entities'),
        fetch('/api/finance/income-streams'),
        fetch('/api/finance/budget'),
        fetch('/api/finance/categories'),
      ])
      if (eRes.ok) {
        const ents: Entity[] = await eRes.json()
        setEntities(ents)
        // Auto-select the default entity on first load
        if (activeEntityId === null && ents.length > 0) {
          const def = ents.find(e => e.isDefault) ?? ents[0]
          setActiveEntityId(def?.id ?? null)
        }
      }
      if (iRes.ok) setIncomeStreams(await iRes.json())
      if (bRes.ok) setBudgetRules(await bRes.json())
      if (cRes.ok) {
        const all: any[] = await cRes.json()
        setCategories(all.filter(c => c.type === 'expense'))
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // ── Derived: filter to active entity ──────────────────────────────────────

  // 'null' entityId in stream/rule = belongs to the default entity
  const defaultEntityId = entities.find(e => e.isDefault)?.id ?? entities[0]?.id ?? null

  function streamBelongsToEntity(s: IncomeStream, entityId: string | null): boolean {
    const streamEntity = s.entityId ?? null
    if (entityId === null) return true // "all" tab
    if (streamEntity === null) return entityId === defaultEntityId
    return streamEntity === entityId
  }

  function ruleBelongsToEntity(r: BudgetRule, entityId: string | null): boolean {
    const ruleEntity = r.entityId ?? null
    if (entityId === null) return true
    if (ruleEntity === null) return entityId === defaultEntityId
    return ruleEntity === entityId
  }

  const activeStreams = incomeStreams.filter(s => streamBelongsToEntity(s, activeEntityId))
  const activeRules   = budgetRules.filter(r => ruleBelongsToEntity(r, activeEntityId))

  const monthlyIncome   = activeStreams.filter(s => s.isIncluded).reduce((sum, s) => sum + toMonthly(s.amount, s.frequency), 0)
  const monthlyExpenses = activeRules.filter(r => r.isIncludedInPlanner).reduce((sum, r) => sum + toMonthly(r.amount, r.period), 0)
  const surplus         = monthlyIncome - monthlyExpenses
  const expenseRules    = activeRules.filter(r => r.isIncludedInPlanner)
  const maxExpense      = expenseRules.length > 0 ? Math.max(...expenseRules.map(r => toMonthly(r.amount, r.period))) : 0

  // ── Income stream CRUD ─────────────────────────────────────────────────────

  function openNewIncome() {
    setEditingIncome(null)
    setIncomeForm({ name: '', amount: 0, frequency: 'fortnightly', entityId: activeEntityId ?? '' })
    setShowIncomeForm(true)
  }

  function openEditIncome(s: IncomeStream) {
    setEditingIncome(s)
    setIncomeForm({ name: s.name, amount: s.amount, frequency: s.frequency, entityId: s.entityId ?? '' })
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
    const entityId = incomeForm.entityId || null
    const updated = editingIncome
      ? incomeStreams.map(s => s.id === editingIncome.id ? { ...s, ...incomeForm, entityId } : s)
      : [...incomeStreams, { id: genId(), ...incomeForm, entityId, isIncluded: true }]
    if (await saveIncomeStreams(updated)) { setShowIncomeForm(false); setEditingIncome(null) }
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
    setRuleForm({ name: '', amount: 0, period: 'monthly', categoryId: '', entityId: activeEntityId ?? '' })
    setShowRuleForm(true)
  }

  function openEditRule(r: BudgetRule) {
    setEditingRule(r)
    setRuleForm({ name: r.name, amount: r.amount, period: r.period, categoryId: r.categoryId ?? '', entityId: r.entityId ?? '' })
    setShowRuleForm(true)
  }

  async function handleSaveRule() {
    if (!ruleForm.name.trim()) { toast.error('Name is required'); return }
    const body = editingRule
      ? { id: editingRule.id, ...ruleForm, categoryId: ruleForm.categoryId || null, entityId: ruleForm.entityId || null }
      : { ...ruleForm, categoryId: ruleForm.categoryId || null, entityId: ruleForm.entityId || null }
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

  // ── Entity CRUD ────────────────────────────────────────────────────────────

  function openNewEntity() {
    setEditingEntity(null)
    const nextColour = ENTITY_COLOURS[entities.length % ENTITY_COLOURS.length]
    setEntityForm({ name: '', type: 'personal', color: nextColour, description: '' })
    setShowEntityModal(true)
  }

  function openEditEntity(e: Entity) {
    setEditingEntity(e)
    setEntityForm({ name: e.name, type: e.type, color: e.color ?? '#3B82F6', description: '' })
    setShowEntityModal(true)
  }

  async function handleSaveEntity() {
    if (!entityForm.name.trim()) { toast.error('Name is required'); return }
    setSavingEntity(true)
    try {
      const body = editingEntity
        ? { id: editingEntity.id, ...entityForm }
        : { ...entityForm, isDefault: entities.length === 0 }
      const res = await fetch('/api/finance/entities', {
        method: editingEntity ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success(editingEntity ? 'Entity updated' : 'Entity created')
        setShowEntityModal(false); setEditingEntity(null); load()
      } else { const e = await res.json(); toast.error(e.error ?? 'Failed') }
    } finally { setSavingEntity(false) }
  }

  async function handleDeleteEntity(id: string) {
    if (!confirm('Deactivate this entity? Its bills and budget rules will be retained.')) return
    const res = await fetch(`/api/finance/entities?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Entity deactivated'); load() }
    else { const e = await res.json(); toast.error(e.error ?? 'Failed') }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-4 text-muted-foreground">Loading budget planner…</div>

  const activeEntity = entities.find(e => e.id === activeEntityId) ?? null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Budget Planner</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Estimated monthly cashflow by entity — income in, expected costs out.
          </p>
        </div>
      </div>

      {/* ── Entity tabs ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {entities.map(e => (
          <button
            key={e.id}
            onClick={() => setActiveEntityId(e.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors border',
              activeEntityId === e.id
                ? 'text-white border-transparent'
                : 'border-border text-muted-foreground hover:text-foreground bg-background',
            )}
            style={activeEntityId === e.id ? { backgroundColor: e.color ?? '#6B7280', borderColor: 'transparent' } : {}}
          >
            <Briefcase className="h-3.5 w-3.5" />
            {e.name}
            {e.isDefault && <span className="text-[10px] opacity-70">(default)</span>}
          </button>
        ))}
        <button
          onClick={openNewEntity}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
        >
          <Plus className="h-3 w-3" /> Add Entity
        </button>
        {entities.length > 0 && (
          <button
            onClick={() => activeEntity && openEditEntity(activeEntity)}
            className="p-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit current entity"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Entity label */}
      {activeEntity && (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeEntity.color ?? '#6B7280' }} />
          <span className="text-sm font-medium">{activeEntity.name}</span>
          <span className="text-xs text-muted-foreground">· {ENTITY_TYPE_LABELS[activeEntity.type] ?? activeEntity.type}</span>
          {!activeEntity.isDefault && (
            <span className="text-xs text-muted-foreground italic">
              Separate entity — income & expenses below are isolated from other entities.
            </span>
          )}
        </div>
      )}

      {/* ── Summary strip ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-green-500/5 p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-green-500" /> Monthly income
          </div>
          <p className="text-2xl font-bold text-green-600">{fmtCurrency(monthlyIncome)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeStreams.filter(s => s.isIncluded).length} stream{activeStreams.filter(s => s.isIncluded).length !== 1 ? 's' : ''} included
          </p>
        </div>
        <div className="rounded-lg border border-border bg-red-500/5 p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" /> Monthly expenses
          </div>
          <p className="text-2xl font-bold text-red-600">{fmtCurrency(monthlyExpenses)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeRules.filter(r => r.isIncludedInPlanner).length} rule{activeRules.filter(r => r.isIncludedInPlanner).length !== 1 ? 's' : ''} included
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
          <h2 className="text-base font-semibold">
            Income streams
            {activeEntity && <span className="text-muted-foreground font-normal text-sm ml-2">— {activeEntity.name}</span>}
          </h2>
          <button onClick={openNewIncome}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <Plus className="h-4 w-4" /> Add income
          </button>
        </div>

        {showIncomeForm && (
          <div className="rounded-lg border border-border p-4 space-y-3 mb-3">
            <h3 className="font-semibold text-sm">{editingIncome ? 'Edit income stream' : 'New income stream'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Name *</label>
                <input value={incomeForm.name}
                  onChange={e => setIncomeForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Salary, Rent income"
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
              <div>
                <label className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="h-3 w-3" /> Entity</label>
                <select value={incomeForm.entityId}
                  onChange={e => setIncomeForm(p => ({ ...p, entityId: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="">Personal / Family</option>
                  {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            </div>
            {incomeForm.amount > 0 && (
              <p className="text-xs text-muted-foreground">
                = <strong>{fmtCurrency(toMonthly(incomeForm.amount, incomeForm.frequency))}</strong>/month
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

        {activeStreams.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No income streams for {activeEntity?.name ?? 'this entity'}.</p>
            <p className="text-xs text-muted-foreground mt-1">Add salary, rental income, or any other regular income for this entity.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeStreams.map(s => {
              const monthly = toMonthly(s.amount, s.frequency)
              const streamEntity = entities.find(e => e.id === (s.entityId ?? defaultEntityId))
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
            {activeStreams.some(s => !s.isIncluded) && (
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
            <h2 className="text-base font-semibold">
              Expected costs
              {activeEntity && <span className="text-muted-foreground font-normal text-sm ml-2">— {activeEntity.name}</span>}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bills flagged "include in budget" appear here automatically.
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
                  placeholder="e.g. Groceries, Property rates"
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
              <div>
                <label className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="h-3 w-3" /> Entity</label>
                <select value={ruleForm.entityId} onChange={e => setRuleForm(p => ({ ...p, entityId: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="">Personal / Family</option>
                  {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
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

        {activeRules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No budget rules for {activeEntity?.name ?? 'this entity'}.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tick "Include in budget" when adding bills, or add manual rules above.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeRules.map(r => {
              const monthly  = toMonthly(r.amount, r.period)
              const barPct   = maxExpense > 0 ? (monthly / maxExpense) * 100 : 0
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
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">from bill</span>
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
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 mt-2">
              <div>
                <p className="text-xs text-muted-foreground">Included rules</p>
                <p className="font-semibold">{activeRules.filter(r => r.isIncludedInPlanner).length} of {activeRules.length}</p>
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
      {(activeStreams.length > 0 || activeRules.length > 0) && (
        <div className={cn('rounded-lg border p-4',
          surplus >= 0 ? 'border-primary/30 bg-primary/5' : 'border-red-500/30 bg-red-500/5')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {surplus >= 0 ? 'Estimated monthly surplus' : 'Estimated monthly shortfall'}
                {activeEntity && <span className="text-muted-foreground font-normal"> — {activeEntity.name}</span>}
              </p>
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

      {/* ── No entities prompt ──────────────────────────────────────────────── */}
      {entities.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Briefcase className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No entities set up yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Create entities for Personal/Family, Super Fund, Unitrak, Hopevale, etc.<br />
            Each entity gets its own isolated income and expense view.
          </p>
          <button onClick={openNewEntity}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">
            <Plus className="h-4 w-4" /> Create First Entity
          </button>
        </div>
      )}

      {/* ── Entity management modal ────────────────────────────────────────── */}
      <Dialog open={showEntityModal} onOpenChange={open => { if (!open) { setShowEntityModal(false); setEditingEntity(null) } }}>
        <DialogContent className="sm:max-w-md" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle>{editingEntity ? 'Edit Entity' : 'New Entity'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground">Name *</label>
              <input value={entityForm.name}
                onChange={e => setEntityForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Super Fund, Unitrak, Hopevale"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <select value={entityForm.type}
                onChange={e => setEntityForm(p => ({ ...p, type: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                {Object.entries(ENTITY_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Colour</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={entityForm.color}
                  onChange={e => setEntityForm(p => ({ ...p, color: e.target.value }))}
                  className="w-10 h-8 rounded border border-input cursor-pointer" />
                <div className="flex gap-1.5 flex-wrap">
                  {ENTITY_COLOURS.map(c => (
                    <button key={c} onClick={() => setEntityForm(p => ({ ...p, color: c }))}
                      className={cn('w-6 h-6 rounded-full border-2 transition-transform',
                        entityForm.color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105')}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>
            {/* Preview chip */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Preview:</span>
              <span className="text-xs px-3 py-1 rounded-full font-medium text-white"
                style={{ backgroundColor: entityForm.color }}>
                {entityForm.name || 'Entity name'}
              </span>
            </div>
            {editingEntity && !editingEntity.isDefault && (
              <button onClick={() => { setShowEntityModal(false); handleDeleteEntity(editingEntity.id) }}
                className="w-full rounded-md border border-red-500/30 text-red-500 px-4 py-1.5 text-sm hover:bg-red-500/5 transition-colors">
                Deactivate entity
              </button>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => { setShowEntityModal(false); setEditingEntity(null) }}
              className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={handleSaveEntity} disabled={savingEntity}
              className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium disabled:opacity-50">
              {savingEntity ? 'Saving…' : editingEntity ? 'Update' : 'Create'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
