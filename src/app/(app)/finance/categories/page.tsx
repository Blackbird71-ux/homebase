'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, EyeOff, MapPin, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'

// ─── Types ────────────────────────────────────────────────────────────
// "Category" is the internal DB model name; users see "Chart of Accounts" / "Account".
// Do NOT rename the TypeScript interface or DB field names — the route path and
// Prisma schema keep "category" as the internal implementation detail.

interface Category {
  id: string; name: string; type: string; parentId: string | null
  color: string | null; icon: string | null; isSystem: boolean
  level: number; isPersonal: boolean; isLocationBased: boolean; isExternal: boolean
  isTaxDeduction: boolean
  taxIncludeInReporting: boolean
  taxDisplayLabel: string | null
  glCode: string | null              // NEW
  openingBalance: number | null      // NEW
  openingBalanceDate: string | null  // NEW
  parent?: { id: string; name: string } | null
  children?: Category[]
  _count?: { transactions: number; recurringBills: number; incomeEntries: number }
}

// ─── Badge colours per COA type ───────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  income:    'text-green-500 bg-green-500/10',
  expense:   'text-red-500 bg-red-500/10',
  transfer:  'text-blue-500 bg-blue-500/10',
  asset:     'text-purple-500 bg-purple-500/10',    // Workstream 2 — new types
  liability: 'text-orange-500 bg-orange-500/10',
  equity:    'text-cyan-500 bg-cyan-500/10',
}

const NOT_IN_USE_NAME = 'Not In Use'

// ─── Account Dialog (Modal) ───────────────────────────────────────────
// User-visible strings use "Account" per spec §3.1; internal code keeps "Category".

function CategoryDialog({
  open,
  onOpenChange,
  editing,
  availableParents,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Category | null
  availableParents: Category[]
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    type: 'expense',
    parentId: '',
    color: '#6366F1',
    icon: '',
    isPersonal: false,
    isLocationBased: false,
    isExternal: false,
    isTaxDeduction: false,
    taxIncludeInReporting: false,
    taxDisplayLabel: '',
    glCode: '',  // NEW
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          name: editing.name,
          type: editing.type,
          parentId: editing.parentId ?? '',
          color: editing.color ?? '#6366F1',
          icon: editing.icon ?? '',
          isPersonal: editing.isPersonal,
          isLocationBased: editing.isLocationBased,
          isExternal: editing.isExternal,
          isTaxDeduction: editing.isTaxDeduction,
          taxIncludeInReporting: editing.taxIncludeInReporting,
          taxDisplayLabel: editing.taxDisplayLabel ?? '',
          glCode: editing.glCode ?? '',
        })
      } else {
        setForm({
          name: '',
          type: 'expense',
          parentId: '',
          color: '#6366F1',
          icon: '',
          isPersonal: false,
          isLocationBased: false,
          isExternal: false,
          isTaxDeduction: false,
          taxIncludeInReporting: false,
          taxDisplayLabel: '',
          glCode: '',
        })
      }
      setErrors({})
    }
  }, [open, editing])

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    return errs
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setSaving(true)
    try {
      const payload = editing
        ? { id: editing.id, ...form, parentId: form.parentId || null, glCode: form.glCode || null }
        : { ...form, parentId: form.parentId || null, glCode: form.glCode || null }
      const res = await fetch('/api/finance/categories', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        // Spec §3.1: toast messages say "Account saved" / "Account deleted"
        toast.success(editing ? 'Account updated' : 'Account created')
        onOpenChange(false)
        onSaved()
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to save account')
      }
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) { onOpenChange(false); setErrors({}) } }}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogHeader>
          {/* Spec §3.1: dialog titles "Add Account" / "Edit Account" */}
          <DialogTitle>{editing ? 'Edit Account' : 'Add Account'}</DialogTitle>
        </DialogHeader>

        {Object.keys(errors).length > 0 && (
          <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 mb-2">
            <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">Please fix the following errors:</p>
            <ul className="list-disc list-inside text-xs text-red-600/80 dark:text-red-400/80 space-y-0.5">
              {Object.entries(errors).map(([key, msg]) => (
                <li key={key}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <div>
            <label className="text-xs text-muted-foreground">Name</label>
            <input
              value={form.name}
              onChange={e => { setForm(p => ({ ...p, name: e.target.value })); if (errors.name) setErrors(p => ({ ...p, name: '' })) }}
              onKeyDown={handleKeyDown}
              className={cn('w-full rounded-md border bg-background px-3 py-1.5 text-sm', errors.name ? 'border-red-500 ring-1 ring-red-500' : 'border-input')}
              autoFocus
              disabled={saving}
            />
            {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">GL Code (optional)</label>
            <input
              value={form.glCode}
              onChange={e => setForm(p => ({ ...p, glCode: e.target.value }))}
              onKeyDown={handleKeyDown}
              placeholder="e.g. 1001, 2100, 4000"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              disabled={saving}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Type</label>
            <select
              value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              disabled={saving}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="equity">Equity</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Parent Account</label>
            <select
              value={form.parentId}
              onChange={e => setForm(p => ({ ...p, parentId: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              disabled={saving}
            >
              <option value="">None (root)</option>
              {availableParents.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Color</label>
            <ColorPicker
              value={form.color}
              onChange={newColor => setForm(p => ({ ...p, color: newColor }))}
              disabled={saving}
            />
          </div>

          {/* ── Tax & flags ─────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">

            {/* Tax Deduction — expense and transfer only */}
            {(form.type === 'expense' || form.type === 'transfer') && (
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isTaxDeduction}
                  onChange={e => setForm(p => ({ ...p, isTaxDeduction: e.target.checked }))}
                  disabled={saving} />
                <span className="text-orange-600 dark:text-orange-400 font-medium">Tax Deduction</span>
              </label>
            )}

            {/* Include in Tax Report — all types */}
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={form.taxIncludeInReporting}
                onChange={e => setForm(p => ({ ...p, taxIncludeInReporting: e.target.checked }))}
                disabled={saving} />
              <span className="text-amber-600 dark:text-amber-400 font-medium">Include in Tax Report</span>
            </label>

            {/* Tax display label — shown when taxIncludeInReporting is checked */}
            {form.taxIncludeInReporting && (
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Display label:</label>
                <input
                  value={form.taxDisplayLabel}
                  onChange={e => setForm(p => ({ ...p, taxDisplayLabel: e.target.value }))}
                  placeholder="e.g. Rental Income, Interest, Voluntary Super"
                  className="w-full sm:w-52 rounded-md border border-input bg-background px-2 py-1 text-xs"
                  disabled={saving}
                />
              </div>
            )}

            <span className="text-muted-foreground/40 mx-1 select-none">|</span>

            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isPersonal}
                onChange={e => setForm(p => ({ ...p, isPersonal: e.target.checked }))}
                disabled={saving} />
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
              Personal (private to me)
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isLocationBased}
                onChange={e => setForm(p => ({ ...p, isLocationBased: e.target.checked }))}
                disabled={saving} />
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Location Based
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isExternal}
                onChange={e => setForm(p => ({ ...p, isExternal: e.target.checked }))}
                disabled={saving} />
              External
            </label>
          </div>
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Category Row ─────────────────────────────────────────────────────

function CategoryRow({
  cat, childrenMap, depth, onEdit, onDelete, getTypeBadge,
  isCollapsed, onToggleCollapse, showToggle,
  onSetOpeningBalance,
}: {
  cat: Category
  childrenMap: Map<string, Category[]>
  depth: number
  onEdit: (c: Category) => void
  onDelete: (id: string) => void
  getTypeBadge: (type: string) => React.ReactNode
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  showToggle?: boolean
  onSetOpeningBalance: (c: Category) => void
}) {
  const children = childrenMap.get(cat.id) || []
  const hasChildren = children.length > 0
  const flags: string[] = []
  if (cat.isTaxDeduction)        flags.push('TAX DED')
  if (cat.taxIncludeInReporting) flags.push('TAX RPT')
  if (cat.isPersonal)            flags.push('PRIVATE')
  if (cat.isLocationBased)       flags.push('LOCATION')
  if (cat.isExternal)            flags.push('EXTERNAL')

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors',
          cat.name === NOT_IN_USE_NAME && 'border-dashed border-muted-foreground/30',
        )}
        style={{ marginLeft: depth * 24 }}
        onDoubleClick={() => onEdit(cat)}
      >
        {showToggle && hasChildren ? (
          <button onClick={onToggleCollapse} className="p-0.5 hover:bg-accent rounded shrink-0"
            title={isCollapsed ? 'Show subcategories' : 'Hide subcategories'}>
            {isCollapsed
              ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        ) : (
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? '#6B7280' }} />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {cat.glCode && (
              <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {cat.glCode}
              </span>
            )}
            <span className="text-sm font-medium">{cat.name}</span>
            {cat.isSystem && <span className="text-[10px] bg-muted px-1.5 rounded">SYSTEM</span>}
            {flags.map(f => (
              <span key={f} className={cn(
                'text-[10px] px-1.5 py-0.5 rounded font-medium border',
                f === 'TAX DED' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' :
                f === 'TAX RPT' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' :
                'bg-muted text-muted-foreground border-border'
              )}>{f}</span>
            ))}
            {showToggle && isCollapsed && hasChildren && (
              <span className="text-[10px] text-muted-foreground">
                {children.length} subcategor{children.length === 1 ? 'y' : 'ies'} (hidden)
              </span>
            )}
          </div>
          {cat._count && (cat._count.transactions + cat._count.recurringBills + cat._count.incomeEntries) > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {[
                cat._count.transactions   > 0 && `${cat._count.transactions} txn${cat._count.transactions !== 1 ? 's' : ''}`,
                cat._count.recurringBills > 0 && `${cat._count.recurringBills} bill${cat._count.recurringBills !== 1 ? 's' : ''}`,
                cat._count.incomeEntries  > 0 && `${cat._count.incomeEntries} income`,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {getTypeBadge(cat.type)}
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(cat)} className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
          {/* Set OB button — only for balance sheet account types */}
          {(cat.type === 'asset' || cat.type === 'liability' || cat.type === 'equity') && !cat.isSystem && (
            <button
              onClick={() => onSetOpeningBalance(cat)}
              title="Set opening balance"
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                cat.openingBalance != null
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  : 'text-muted-foreground border-border hover:border-primary hover:text-primary'
              )}
            >
              {cat.openingBalance != null
                ? `OB: ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(cat.openingBalance)}`
                : 'Set OB'}
            </button>
          )}
          {!cat.isSystem && (
            <button onClick={() => onDelete(cat.id)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
          )}
        </div>
      </div>

      {hasChildren && !isCollapsed && children.map(child => (
        <CategoryRow key={child.id} cat={child} childrenMap={childrenMap} depth={depth + 1}
          onEdit={onEdit} onDelete={onDelete} getTypeBadge={getTypeBadge}
          onSetOpeningBalance={onSetOpeningBalance} />
      ))}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]       = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing]       = useState<Category | null>(null)
  const [collapsedRootIds, setCollapsedRootIds] = useState<Set<string>>(new Set())
  // Opening balance edit dialog state
  const [obEdit, setObEdit] = useState<{
    cat: Category
    amount: string
    date: string
  } | null>(null)
  const [obSaving, setObSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/categories')
      if (res.ok) setCategories(await res.json())
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // Auto-collapse "Not In Use" root after load
  useEffect(() => {
    const notInUse = categories.find(c => !c.parentId && c.name.toLowerCase() === NOT_IN_USE_NAME.toLowerCase())
    if (notInUse && !collapsedRootIds.has(notInUse.id)) {
      setCollapsedRootIds(prev => { const n = new Set(prev); n.add(notInUse.id); return n })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories])

  function toggleCollapse(id: string) {
    setCollapsedRootIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function openNew()             { setEditing(null); setDialogOpen(true) }
  function openEdit(c: Category) { setEditing(c);   setDialogOpen(true) }

  function handleDialogClose(open: boolean) {
    if (!open) setEditing(null)
    setDialogOpen(open)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this account?')) return
    const res = await fetch(`/api/finance/categories?id=${id}`, { method: 'DELETE' })
    // Spec §3.1: toast says "Account deleted"
    if (res.ok) { toast.success('Account deleted'); load() }
    else { const err = await res.json(); toast.error(err.error ?? 'Failed to delete') }
  }

  async function handleObSave() {
    if (!obEdit) return
    const rawAmount = obEdit.amount.trim()
    const amount = rawAmount !== '' && rawAmount !== '0' ? parseFloat(rawAmount) : null
    setObSaving(true)
    try {
      const res = await fetch('/api/finance/categories/opening-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: obEdit.cat.id,
          amount: amount ?? 0,
          date: obEdit.date || new Date().toISOString().split('T')[0],
        }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(data.message)
        setObEdit(null)
        load()
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to update opening balance')
      }
    } finally {
      setObSaving(false)
    }
  }

  function getTypeBadge(type: string) {
    return (
      <span className={cn('text-xs px-2 py-0.5 rounded-full', TYPE_COLORS[type] ?? TYPE_COLORS.expense)}>
        {type}
      </span>
    )
  }

  const rootCategories = categories.filter(c => !c.parentId)
  const childMap = new Map<string, Category[]>()
  categories.forEach(c => {
    if (c.parentId) {
      const arr = childMap.get(c.parentId) ?? []
      arr.push(c)
      childMap.set(c.parentId, arr)
    }
  })

  const notInUseCategory = rootCategories.find(c => c.name.toLowerCase() === NOT_IN_USE_NAME.toLowerCase())
  const regularRoots     = rootCategories.filter(c => c.name.toLowerCase() !== NOT_IN_USE_NAME.toLowerCase())
  const orderedRoots     = notInUseCategory ? [...regularRoots, notInUseCategory] : regularRoots
  const availableParents = rootCategories.filter(c => editing ? c.id !== editing.id : true)

  if (loading) return <div className="p-4 text-muted-foreground">Loading accounts…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {/* Spec §3.1: page title "Chart of Accounts" */}
        <h1 className="text-2xl font-bold">Chart of Accounts</h1>
        {/* Spec §3.1: button label "Add Account" */}
        <button onClick={openNew} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <Plus className="h-4 w-4" /> Add Account
        </button>
      </div>

      {/* Opening Balance Dialog — for asset, liability, equity accounts only */}
      <Dialog open={!!obEdit} onOpenChange={open => { if (!open) setObEdit(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton>
          <DialogHeader>
            <DialogTitle>Opening Balance — {obEdit?.cat.name}</DialogTitle>
          </DialogHeader>
          {obEdit && (
            <div className="space-y-4">
              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {obEdit.cat.type === 'asset' && 'Enter the balance this asset account held as at the date below. Positive = funds/value held. Negative = unusual (e.g. overdrawn asset).'}
                {obEdit.cat.type === 'liability' && 'Enter the amount owed as at the date below. Positive = debt outstanding. Negative = unusual (creditor paid more than owed).'}
                {obEdit.cat.type === 'equity' && 'Enter the equity balance as at the date below. Positive = equity in your favour.'}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Opening Balance ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={obEdit.amount}
                  onChange={e => setObEdit(p => p ? { ...p, amount: e.target.value } : p)}
                  placeholder={
                    obEdit.cat.type === 'liability' ? 'e.g. 350000 for a $350k mortgage' :
                    obEdit.cat.type === 'asset'     ? 'e.g. 45000 for $45k in this account' :
                    'e.g. 10000'
                  }
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  disabled={obSaving}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  Leave blank or 0 to clear the opening balance.
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">As at Date</label>
                <input
                  type="date"
                  value={obEdit.date}
                  onChange={e => setObEdit(p => p ? { ...p, date: e.target.value } : p)}
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  disabled={obSaving}
                />
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  The date from which this balance applies (usually 1 July of the FY start).
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <button
              onClick={() => setObEdit(null)}
              className="rounded-md border border-border px-4 py-1.5 text-sm"
              disabled={obSaving}
            >
              Cancel
            </button>
            <button
              onClick={handleObSave}
              disabled={obSaving}
              className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {obSaving ? 'Saving…' : 'Save Opening Balance'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        editing={editing}
        availableParents={availableParents}
        onSaved={load}
      />

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts yet. Create your first account above.</p>
      ) : (
        <div className="space-y-1">
          {orderedRoots.map(cat => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              childrenMap={childMap}
              depth={0}
              onEdit={openEdit}
              onDelete={handleDelete}
              getTypeBadge={getTypeBadge}
              isCollapsed={collapsedRootIds.has(cat.id)}
              onToggleCollapse={() => toggleCollapse(cat.id)}
              showToggle={(childMap.get(cat.id) ?? []).length > 0}
              onSetOpeningBalance={cat => {
                setObEdit({
                  cat,
                  amount: cat.openingBalance?.toString() ?? '',
                  date: cat.openingBalanceDate
                    ? new Date(cat.openingBalanceDate).toISOString().split('T')[0]
                    : new Date().toISOString().split('T')[0],
                })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
