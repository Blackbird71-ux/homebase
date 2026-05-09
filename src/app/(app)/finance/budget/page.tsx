'use client'

import { useEffect, useState } from 'react'
import {
  Plus, Pencil, Trash2, TrendingUp, TrendingDown, Wallet,
  Check, Briefcase, ChevronDown, ChevronRight, BarChart3, List, ExternalLink, CalendarDays, Info,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

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
  frequency: string
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

function streamToMonthly(s: IncomeStream): number {
  const { amount, frequency } = s
  switch (frequency) {
    case 'weekly':      return amount * 52 / 12
    case 'fortnightly': return amount * 26 / 12
    case 'monthly':     return amount
    case 'quarterly':   return amount / 3
    case 'yearly':      return amount / 12
    default:            return amount
  }
}

function toMonthly(amount: number, period: string): number {
  if (period === 'weekly')      return amount * 52 / 12
  if (period === 'fortnightly') return amount * 26 / 12
  if (period === 'quarterly')   return amount / 3
  if (period === 'yearly')      return amount / 12
  return amount
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  personal: 'Personal', superfund: 'Super Fund', trust: 'Trust',
  business: 'Business', investment: 'Investment', other: 'Other',
}

// ─── Category Spend View ──────────────────────────────────────────────────────

interface CategoryGroup {
  id: string | null
  name: string
  color: string | null
  monthlyTotal: number
  rules: BudgetRule[]
}

function CategorySpendView({ rules }: { rules: BudgetRule[] }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const included = rules.filter(r => r.isIncludedInPlanner)
  const groupMap = new Map<string, CategoryGroup>()

  for (const r of included) {
    const key = r.categoryId ?? '__none__'
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        id: r.categoryId,
        name: r.category?.name ?? 'Uncategorised',
        color: r.category?.color ?? null,
        monthlyTotal: 0,
        rules: [],
      })
    }
    const g = groupMap.get(key)!
    g.monthlyTotal += toMonthly(r.amount, r.period)
    g.rules.push(r)
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => b.monthlyTotal - a.monthlyTotal)
  const grandTotal = groups.reduce((sum, g) => sum + g.monthlyTotal, 0)
  const maxTotal = groups.length > 0 ? groups[0].monthlyTotal : 0

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">No included budget rules to display.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {groups.map(g => {
        const key = g.id ?? '__none__'
        const isExpanded = expandedGroups.has(key)
        const barPct = maxTotal > 0 ? (g.monthlyTotal / maxTotal) * 100 : 0

        return (
          <div key={key} className="rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => toggleGroup(key)}
              className="w-full flex items-center gap-3 px-3 py-3 hover:bg-accent/50 transition-colors text-left"
            >
              <div className="w-4 h-4 rounded-full shrink-0"
                style={{ backgroundColor: g.color ?? '#6B7280' }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold">{g.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{g.rules.length} rule{g.rules.length !== 1 ? 's' : ''}</span>
                    <span className="text-sm font-bold text-red-600">{fmtCurrency(g.monthlyTotal)}/mo</span>
                    {isExpanded
                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    }
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-primary/50 transition-all"
                    style={{ width: `${Math.min(100, barPct)}%` }} />
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-border bg-muted/20">
                {g.rules.map(r => {
                  const monthly = toMonthly(r.amount, r.period)
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-2 border-b border-border/50 last:border-b-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0 ml-2" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm">{r.name}</span>
                        {r.bill && (
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground ml-2">from bill</span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium">{fmtCurrency(r.amount)}</p>
                        {r.period !== 'monthly' && (
                          <p className="text-xs text-muted-foreground">{fmtCurrency(monthly)}/mo</p>
                        )}
                        {r.period === 'monthly' && (
                          <p className="text-xs text-muted-foreground capitalize">{r.period}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 mt-1">
        <div>
          <p className="text-xs text-muted-foreground">Categories</p>
          <p className="font-semibold">{groups.length}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total / month</p>
          <p className="font-semibold text-red-600">{fmtCurrency(grandTotal)}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const [entities, setEntities]           = useState<Entity[]>([])
  const [incomeStreams, setIncomeStreams]  = useState<IncomeStream[]>([])
  const [budgetRules, setBudgetRules]     = useState<BudgetRule[]>([])
  const [categories, setCategories]       = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading]             = useState(true)

  const [activeEntityId, setActiveEntityId] = useState<string | null>(null)

  // Income section collapse — collapsed by default
  const [incomeCollapsed, setIncomeCollapsed] = useState(true)

  // View mode: 'list' | 'category'
  const [expenseView, setExpenseView] = useState<'list' | 'category'>('list')

  // Summary card period toggle
  const [showYearly, setShowYearly] = useState(false)

  // Budget rule editing — income editing now lives on the Income page
  const [showRuleForm, setShowRuleForm]   = useState(false)
  const [editingRule, setEditingRule]     = useState<BudgetRule | null>(null)
  const [ruleForm, setRuleForm]           = useState({ name: '', amount: 0, period: 'monthly', categoryId: '', entityId: '' })

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

  const defaultEntityId = entities.find(e => e.isDefault)?.id ?? entities[0]?.id ?? null

  function streamBelongsToEntity(s: IncomeStream, entityId: string | null): boolean {
    const streamEntity = s.entityId ?? null
    if (entityId === null) return true
    if (entityId === defaultEntityId) return streamEntity === null || streamEntity === defaultEntityId
    return streamEntity === entityId
  }

  function ruleBelongsToEntity(r: BudgetRule, entityId: string | null): boolean {
    const ruleEntity = r.entityId ?? null
    if (entityId === null) return true
    if (entityId === defaultEntityId) return ruleEntity === null || ruleEntity === defaultEntityId
    return ruleEntity === entityId
  }

  const activeStreams = incomeStreams.filter(s => streamBelongsToEntity(s, activeEntityId))
  const activeRules   = budgetRules.filter(r => ruleBelongsToEntity(r, activeEntityId))

  // All income entries from the Income page are included — no manual toggle
  const monthlyIncome   = activeStreams.reduce((sum, s) => sum + streamToMonthly(s), 0)
  const monthlyExpenses = activeRules.filter(r => r.isIncludedInPlanner).reduce((sum, r) => sum + toMonthly(r.amount, r.period), 0)
  const surplus         = monthlyIncome - monthlyExpenses
  const expenseRules    = activeRules.filter(r => r.isIncludedInPlanner)
  const maxExpense      = expenseRules.length > 0 ? Math.max(...expenseRules.map(r => toMonthly(r.amount, r.period))) : 0

  // ── Budget rule CRUD ───────────────────────────────────────────────────────

  function openNewRule() {
    setEditingRule(null)
    setRuleForm({ name: '', amount: 0, period: 'monthly', categoryId: '', entityId: activeEntityId ?? defaultEntityId ?? '' })
    setShowRuleForm(true)
  }

  function openEditRule(r: BudgetRule) {
    setEditingRule(r)
    setRuleForm({ name: r.name, amount: r.amount, period: r.period, categoryId: r.categoryId ?? '', entityId: r.entityId ?? defaultEntityId ?? '' })
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
          </button>
        ))}
        <Link
          href="/finance/entities"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
          title="Manage entities — rename, set colour, add new"
        >
          <ExternalLink className="h-3 w-3" /> Manage entities
        </Link>
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
          {activeEntity.isDefault && (
            <span className="text-xs text-muted-foreground italic">
              Household finances — bills and rules with no entity assigned appear here.
            </span>
          )}
        </div>
      )}

      {/* ── Summary strip ──────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex justify-end">
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setShowYearly(false)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
                !showYearly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setShowYearly(true)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border-l border-border',
                showYearly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Yearly
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-green-500/5 p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-green-500" />
              {showYearly ? 'Yearly income' : 'Monthly income'}
            </div>
            <p className="text-2xl font-bold text-green-600">
              {fmtCurrency(showYearly ? monthlyIncome * 12 : monthlyIncome)}
            </p>
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-xs text-muted-foreground">
                {activeStreams.length} stream{activeStreams.length !== 1 ? 's' : ''} active
              </p>
              {showYearly && (
                <p className="text-xs text-muted-foreground">{fmtCurrency(monthlyIncome)}/mo</p>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-red-500/5 p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              {showYearly ? 'Yearly expenses' : 'Monthly expenses'}
            </div>
            <p className="text-2xl font-bold text-red-600">
              {fmtCurrency(showYearly ? monthlyExpenses * 12 : monthlyExpenses)}
            </p>
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-xs text-muted-foreground">
                {activeRules.filter(r => r.isIncludedInPlanner).length} rule{activeRules.filter(r => r.isIncludedInPlanner).length !== 1 ? 's' : ''} included
              </p>
              {showYearly && (
                <p className="text-xs text-muted-foreground">{fmtCurrency(monthlyExpenses)}/mo</p>
              )}
            </div>
          </div>
          <div className={cn('rounded-lg border p-4',
            surplus >= 0 ? 'border-primary/30 bg-primary/5' : 'border-red-500/30 bg-red-500/5')}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Wallet className="h-3.5 w-3.5" style={{ color: surplus >= 0 ? 'var(--primary)' : '#ef4444' }} />
              {showYearly ? 'Yearly surplus' : 'Monthly surplus'}
            </div>
            <p className={cn('text-2xl font-bold', surplus >= 0 ? 'text-primary' : 'text-red-600')}>
              {fmtCurrency(showYearly ? surplus * 12 : surplus)}
            </p>
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-xs text-muted-foreground">
                {surplus >= 0 ? 'Left over after expenses' : 'Expenses exceed income'}
              </p>
              {showYearly && (
                <p className="text-xs text-muted-foreground">{fmtCurrency(surplus)}/mo</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Income streams — read-only, driven by Income page ─────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setIncomeCollapsed(c => !c)}
            className="flex items-center gap-2 group"
          >
            <div className={cn(
              'w-5 h-5 rounded border border-border flex items-center justify-center transition-colors',
              'group-hover:border-primary group-hover:text-primary text-muted-foreground',
            )}>
              {incomeCollapsed
                ? <Plus className="h-3 w-3" />
                : <span className="text-base leading-none mb-0.5">−</span>
              }
            </div>
            <h2 className="text-base font-semibold">
              Income streams
              {activeEntity && <span className="text-muted-foreground font-normal text-sm ml-2">— {activeEntity.name}</span>}
            </h2>
          </button>

          <div className="flex items-center gap-3">
            {incomeCollapsed && activeStreams.length > 0 && (
              <span className="text-sm font-semibold text-green-600 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-0.5">
                {fmtCurrency(monthlyIncome)}/mo
                <span className="text-xs font-normal text-muted-foreground ml-1.5">
                  ({activeStreams.length} stream{activeStreams.length !== 1 ? 's' : ''})
                </span>
              </span>
            )}
            <Link href="/finance/income"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Manage income
            </Link>
          </div>
        </div>

        {!incomeCollapsed && (
          <>
            <div className="mb-3 flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Income streams are driven by your{' '}
                <Link href="/finance/income" className="text-primary hover:underline">Income records</Link>.
                Add, edit, or delete income entries there and they will automatically appear here.
                The Budget Planner and P&amp;L now use the same data source — no double-entry.
              </p>
            </div>

            {activeStreams.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">No active income for {activeEntity?.name ?? 'this entity'}.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add income entries on the{' '}
                  <Link href="/finance/income" className="text-primary hover:underline">Income page</Link>{' '}
                  and they will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeStreams.map(s => {
                  const monthly = streamToMonthly(s)
                  return (
                    <div key={s.id} className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-3 cursor-default">
                      <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground ml-2 capitalize">{s.frequency}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-green-600">{fmtCurrency(s.amount)}</p>
                        {s.frequency !== 'monthly' && (
                          <p className="text-xs text-muted-foreground">{fmtCurrency(monthly)}/mo</p>
                        )}
                      </div>
                      <Link href="/finance/income" className="p-1 hover:bg-accent rounded" title="Edit on Income page">
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </Link>
                    </div>
                  )
                })}
              </div>
            )}
          </>
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
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setExpenseView('list')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
                  expenseView === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
                title="List view"
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">List</span>
              </button>
              <button
                onClick={() => setExpenseView('category')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border-l border-border',
                  expenseView === 'category'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
                title="Category spend view"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">By Category</span>
              </button>
            </div>
            <button onClick={openNewRule}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <Plus className="h-4 w-4" /> Add rule
            </button>
          </div>
        </div>

        <Dialog open={showRuleForm} onOpenChange={open => { if (!open) { setShowRuleForm(false); setEditingRule(null) } }}>
          <DialogContent className="sm:max-w-2xl" showCloseButton={true}>
            <DialogHeader>
              <DialogTitle>{editingRule ? 'Edit budget rule' : 'New budget rule'}</DialogTitle>
            </DialogHeader>
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
                  {entities.map(e => <option key={e.id} value={e.id}>{e.name}{e.isDefault ? ' (default)' : ''}</option>)}
                </select>
              </div>
            </div>
            <DialogFooter>
              <button onClick={handleSaveRule}
                className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium">
                {editingRule ? 'Update' : 'Add rule'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {activeRules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No budget rules for {activeEntity?.name ?? 'this entity'}.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tick "Include in budget" when adding bills, or add manual rules above.
            </p>
          </div>
        ) : expenseView === 'category' ? (
          <CategorySpendView rules={activeRules} />
        ) : (
          <div className="space-y-2">
            {activeRules.map(r => {
              const monthly  = toMonthly(r.amount, r.period)
              const barPct   = maxExpense > 0 ? (monthly / maxExpense) * 100 : 0
              const fromBill = !!r.billId
              return (
                <div key={r.id} className={cn(
                  'flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-default',
                  r.isIncludedInPlanner ? 'border-border' : 'border-border opacity-50',
                )} onDoubleClick={() => openEditRule(r)}>
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
                {surplus >= 0
                  ? (showYearly ? 'Estimated yearly surplus' : 'Estimated monthly surplus')
                  : (showYearly ? 'Estimated yearly shortfall' : 'Estimated monthly shortfall')}
                {activeEntity && <span className="text-muted-foreground font-normal"> — {activeEntity.name}</span>}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {showYearly
                  ? <>{fmtCurrency(monthlyIncome * 12)} income − {fmtCurrency(monthlyExpenses * 12)} expenses (yearly)</>
                  : <>{fmtCurrency(monthlyIncome)} income − {fmtCurrency(monthlyExpenses)} expenses</>
                }
              </p>
            </div>
            <div className="text-right">
              <p className={cn('text-3xl font-bold', surplus >= 0 ? 'text-primary' : 'text-red-600')}>
                {fmtCurrency(Math.abs(showYearly ? surplus * 12 : surplus))}
              </p>
              {showYearly && (
                <p className="text-xs text-muted-foreground mt-0.5">{fmtCurrency(Math.abs(surplus))}/mo</p>
              )}
            </div>
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
          <Link
            href="/finance/entities"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          >
            <ExternalLink className="h-4 w-4" /> Go to Entities
          </Link>
        </div>
      )}
    </div>
  )
}
