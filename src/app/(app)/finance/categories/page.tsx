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

interface Category {
  id: string; name: string; type: string; parentId: string | null
  color: string | null; icon: string | null; isSystem: boolean
  level: number; isPersonal: boolean; isLocationBased: boolean; isExternal: boolean
  isTaxDeduction: boolean
  taxIncludeInReporting: boolean
  taxDisplayLabel: string | null
  parent?: { id: string; name: string } | null
  children?: Category[]
  _count?: { transactions: number; recurringBills: number; incomeEntries: number }
}

const TYPE_COLORS: Record<string, string> = {
  income: 'text-green-500 bg-green-500/10',
  expense: 'text-red-500 bg-red-500/10',
  transfer: 'text-blue-500 bg-blue-500/10',
}

const NOT_IN_USE_NAME = 'Not In Use'

// ─── Category Dialog (Modal) ──────────────────────────────────────────

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
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset form when dialog opens
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
        })
      }
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
        ? { id: editing.id, ...form, parentId: form.parentId || null }
        : { ...form, parentId: form.parentId || null }
      const res = await fetch('/api/finance/categories', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success(editing ? 'Category updated' : 'Category created')
        onOpenChange(false)
        onSaved()
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to save category')
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
          <DialogTitle>{editing ? 'Edit Category' : 'New Category'}</DialogTitle>
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
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              onKeyDown={handleKeyDown}
              className={cn('w-full rounded-md border bg-background px-3 py-1.5 text-sm', errors.name ? 'border-red-500' : 'border-input')}
              autoFocus
              disabled={saving}
            />
            {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
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
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Parent Category</label>
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
            <label className="text-xs text-muted-foreground">Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.color}
                onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                className="h-8 w-8 rounded cursor-pointer"
                disabled={saving}
              />
              <span className="text-xs text-muted-foreground">{form.color}</span>
            </div>
          </div>
          {/* Flags */}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            {/* Tax Deduction flag — shown for expense and transfer categories */}
              {(form.type === 'expense' || form.type === 'transfer') && (
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.isTaxDeduction}
                    onChange={e => setForm(p => ({ ...p, isTaxDeduction: e.target.checked }))}
                    disabled={saving} />
                  <span className="text-orange-600 dark:text-orange-400 font-medium">Tax Deduction</span>
                </label>
              )}
            {/* Tax Reporting flag — shown for expense and income categories */}
            {(form.type === 'expense' || form.type === 'income') && (
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={form.taxIncludeInReporting}
                  onChange={e => setForm(p => ({ ...p, taxIncludeInReporting: e.target.checked }))}
                  disabled={saving} />
                <span className="text-amber-600 dark:text-amber-400 font-medium">Include in Tax Report</span>
              </label>
            )}
            {/* Tax display label — shown when taxIncludeInReporting is checked */}
            {form.taxIncludeInReporting && (
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Display label:</label>
                <input
                  value={form.taxDisplayLabel}
                  onChange={e => setForm(p => ({ ...p, taxDisplayLabel: e.target.value }))}
                  placeholder="e.g. Rental Income, Interest"
                  className="w-full sm:w-48 rounded-md border border-input bg-background px-2 py-1 text-xs"
                  disabled={saving}
                />
              </div>
            )}
            {/* Separator before standard flags */}
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
  cat,
  childrenMap,
  depth,
  onEdit,
  onDelete,
  getTypeBadge,
  isCollapsed,
  onToggleCollapse,
  showToggle,
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
}) {
  const children = childrenMap.get(cat.id) || []
  const hasChildren = children.length > 0
  const flags: string[] = []
  if (cat.isTaxDeduction) flags.push('TAX DEDUCTION')
  if (cat.taxIncludeInReporting) flags.push('TAX REPORT')
  if (cat.isPersonal) flags.push('PRIVATE')
  if (cat.isLocationBased) flags.push('LOCATION')
  if (cat.isExternal) flags.push('EXTERNAL')

  return (
    <>
      <div className={cn(
        'flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors',
        cat.name === NOT_IN_USE_NAME && 'border-dashed border-muted-foreground/30',
      )} style={{ marginLeft: depth * 24 }} onDoubleClick={() => onEdit(cat)}>
        {/* Collapse toggle for "Not In Use" */}
        {showToggle && hasChildren && (
          <button
            onClick={onToggleCollapse}
            className="p-0.5 hover:bg-accent rounded shrink-0"
            title={isCollapsed ? 'Show subcategories' : 'Hide subcategories'}
          >
            {isCollapsed
              ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </button>
        )}
        {!showToggle && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color ?? '#6B7280' }} />}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{cat.name}</span>
            {cat.isSystem && <span className="text-[10px] bg-muted px-1.5 rounded">SYSTEM</span>}
            {flags.map(f => (
              <span key={f} className="text-[10px] bg-muted px-1.5 rounded text-muted-foreground">{f}</span>
            ))}
            {showToggle && isCollapsed && hasChildren && (
              <span className="text-[10px] text-muted-foreground">
                {children.length} subcategor{children.length === 1 ? 'y' : 'ies'} (hidden)
              </span>
            )}
          </div>
          {cat._count && (cat._count.transactions + cat._count.recurringBills + cat._count.incomeEntries) > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {[cat._count.transactions > 0 && `${cat._count.transactions} txn${cat._count.transactions !== 1 ? 's' : ''}`, cat._count.recurringBills > 0 && `${cat._count.recurringBills} bill${cat._count.recurringBills !== 1 ? 's' : ''}`, cat._count.incomeEntries > 0 && `${cat._count.incomeEntries} income`].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {getTypeBadge(cat.type)}
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(cat)} className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
          {!cat.isSystem && (
            <button onClick={() => onDelete(cat.id)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
          )}
        </div>
      </div>
      {/* Only render children if not collapsed */}
      {hasChildren && (!isCollapsed) && children.map(child => (
        <CategoryRow key={child.id} cat={child} childrenMap={childrenMap} depth={depth + 1}
          onEdit={onEdit} onDelete={onDelete} getTypeBadge={getTypeBadge} />
      ))}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  // Per-root-category collapse state: set of root category IDs that are collapsed
  const [collapsedRootIds, setCollapsedRootIds] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/categories')
      if (res.ok) setCategories(await res.json())
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // Auto-collapse "Not In Use" root after categories load
  useEffect(() => {
    const notInUse = categories.find(
      c => !c.parentId && c.name.toLowerCase() === NOT_IN_USE_NAME.toLowerCase()
    )
    if (notInUse && !collapsedRootIds.has(notInUse.id)) {
      setCollapsedRootIds(prev => {
        const next = new Set(prev)
        next.add(notInUse.id)
        return next
      })
    }
  // Only run when categories change (after initial load or refresh)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories])

  function toggleCollapse(categoryId: string) {
    setCollapsedRootIds(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  function openNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(cat: Category) {
    setEditing(cat)
    setDialogOpen(true)
  }

  function handleDialogClose(open: boolean) {
    if (!open) {
      setEditing(null)
    }
    setDialogOpen(open)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this category?')) return
    const res = await fetch(`/api/finance/categories?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Category deleted'); load() }
    else { const err = await res.json(); toast.error(err.error ?? 'Failed to delete') }
  }

  function getTypeBadge(type: string) {
    return <span className={cn('text-xs px-2 py-0.5 rounded-full', TYPE_COLORS[type] || TYPE_COLORS.expense)}>{type}</span>
  }

  // Build tree
  const rootCategories = categories.filter(c => !c.parentId)
  const childMap = new Map<string, Category[]>()
  categories.forEach(c => {
    if (c.parentId) {
      const arr = childMap.get(c.parentId) || []
      arr.push(c)
      childMap.set(c.parentId, arr)
    }
  })

  // Sort: "Not In Use" always last
  const notInUseCategory = rootCategories.find(
    c => c.name.toLowerCase() === NOT_IN_USE_NAME.toLowerCase()
  )
  const regularRoots = rootCategories.filter(
    c => c.name.toLowerCase() !== NOT_IN_USE_NAME.toLowerCase()
  )
  const orderedRoots = notInUseCategory
    ? [...regularRoots, notInUseCategory]
    : regularRoots

  // Get available parents for form (only root categories, not self when editing)
  const availableParents = rootCategories.filter(c => editing ? c.id !== editing.id : true)

  if (loading) return <div className="p-4 text-muted-foreground">Loading categories…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categories</h1>
        <button onClick={openNew} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <Plus className="h-4 w-4" /> Add Category
        </button>
      </div>

      {/* Modal Dialog */}
      <CategoryDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        editing={editing}
        availableParents={availableParents}
        onSaved={load}
      />

      {/* Tree */}
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No categories yet. Create your first category above.</p>
      ) : (
        <div className="space-y-1">
          {orderedRoots.map(cat => {
            const hasChildren = (childMap.get(cat.id) || []).length > 0
            return (
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
                showToggle={hasChildren}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
