'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHero } from '@/components/shared/PageHero'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import AccountLedgerPanel from '@/components/finance/AccountLedgerPanel'
import { CategoryDialog, type Category } from '@/components/finance/CategoryDialog'
import { CategoryRow, type FilterType, FILTER_OPTIONS, NOT_IN_USE_NAME } from '@/components/finance/CategoryRow'

// ─── Main Page ────────────────────────────────────────────────────────
// "Category" is the internal DB model name; users see "Chart of Accounts" / "Account".
// Do NOT rename the TypeScript interface or DB field names — the route path and
// Prisma schema keep "category" as the internal implementation detail.

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]       = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing]       = useState<Category | null>(null)
  const [collapsedRootIds, setCollapsedRootIds] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')

  const [obEdit, setObEdit] = useState<{ cat: Category; amount: string; date: string } | null>(null)
  const [obSaving, setObSaving] = useState(false)

  const [ledgerCategory, setLedgerCategory] = useState<{ id: string; name: string } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/categories?showAll=true')
      if (res.ok) setCategories(await res.json())
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

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

  const typeCounts = categories.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1
    return acc
  }, {})

  if (loading) return <div className="p-4 text-muted-foreground">Loading accounts…</div>

  return (
    <div className="space-y-4">
      <PageHero title="Chart of Accounts" />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Account
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_OPTIONS.map(opt => {
          const count = opt.value === 'all' ? categories.length : (typeCounts[opt.value] ?? 0)
          const isActive = activeFilter === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setActiveFilter(opt.value)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                isActive
                  ? opt.color
                  : 'text-muted-foreground border-border hover:text-foreground hover:border-foreground/30',
              )}
            >
              {opt.label}
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded-full font-semibold',
                isActive ? 'bg-black/10 dark:bg-white/20' : 'bg-muted',
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <Dialog open={!!obEdit} onOpenChange={open => { if (!open) setObEdit(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton>
          <DialogHeader>
            <DialogTitle>Opening Balance — {obEdit?.cat.name}</DialogTitle>
          </DialogHeader>
          {obEdit && (
            <div className="space-y-4">
              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {obEdit.cat.type === 'asset'     && 'Enter the balance this asset account held as at the date below. Positive = funds/value held. Negative = unusual (e.g. overdrawn asset).'}
                {obEdit.cat.type === 'liability' && 'Enter the amount owed as at the date below. Positive = debt outstanding. Negative = unusual (creditor paid more than owed).'}
                {obEdit.cat.type === 'equity'    && 'Enter the equity balance as at the date below. Positive = equity in your favour.'}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Opening Balance ($)</label>
                <input
                  type="number" step="0.01"
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
                <p className="text-xs text-muted-foreground/60 mt-0.5">Leave blank or 0 to clear the opening balance.</p>
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
                <p className="text-xs text-muted-foreground/60 mt-0.5">The date from which this balance applies (usually 1 July of the FY start).</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setObEdit(null)} disabled={obSaving}
              className="rounded-md border border-border px-4 py-1.5 text-sm">
              Cancel
            </button>
            <button onClick={handleObSave} disabled={obSaving}
              className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium disabled:opacity-50">
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

      <AccountLedgerPanel
        categoryId={ledgerCategory?.id ?? null}
        categoryName={ledgerCategory?.name ?? ''}
        onClose={() => setLedgerCategory(null)}
        fyStartMonth={7}
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
              onOpenLedger={cat => setLedgerCategory({ id: cat.id, name: cat.name })}
              activeFilter={activeFilter}
            />
          ))}
          {activeFilter !== 'all' && !orderedRoots.some(r => {
            function hasMatch(c: Category): boolean {
              if (c.type === activeFilter) return true
              return (childMap.get(c.id) ?? []).some(hasMatch)
            }
            return hasMatch(r)
          }) && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No {FILTER_OPTIONS.find(o => o.value === activeFilter)?.label.toLowerCase()} accounts yet.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
