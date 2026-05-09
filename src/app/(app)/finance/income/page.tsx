'use client'

import { useEffect, useState } from 'react'
import {
  Plus, Pencil, Trash2, Bell, Settings2, CheckCircle2,
  RefreshCw, Layers, Briefcase,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, isPast, addMonths, addWeeks, addDays } from 'date-fns'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface Member { id: string; name: string; email: string }
interface Location { id: string; name: string }
interface Entity { id: string; name: string; color: string | null; type: string; isDefault: boolean }

export interface IncomeEntry {
  id: string; name: string; amount: number; frequency: string
  incomeType: string
  nextExpectedDate: string; endDate: string | null; isActive: boolean
  received: boolean; receivedDate: string | null
  notes: string | null; memberId: string | null
  account: { id: string; name: string } | null
  category: { id: string; name: string; color: string | null } | null
  member: Member | null
  location: Location | null
  entity: Entity | null
  parentIncomeId: string | null
}

function toMonthlyAmount(amount: number, frequency: string): number {
  if (frequency === 'weekly')      return amount * 52 / 12
  if (frequency === 'fortnightly') return amount * 26 / 12
  if (frequency === 'quarterly')   return amount / 3
  if (frequency === 'yearly')      return amount / 12
  return amount
}

function entityChip(entity: Entity | null) {
  if (!entity) return null
  const bg = entity.color ?? '#6B7280'
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
      style={{ backgroundColor: bg }}
    >
      {entity.name}
    </span>
  )
}

export default function IncomePage() {
  const [entries, setEntries]         = useState<IncomeEntry[]>([])
  const [accounts, setAccounts]       = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories]   = useState<{ id: string; name: string; parentId: string | null }[]>([])
  const [members, setMembers]         = useState<Member[]>([])
  const [locations, setLocations]     = useState<Location[]>([])
  const [entities, setEntities]       = useState<Entity[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [editing, setEditing]         = useState<IncomeEntry | null>(null)
  const [dateRange, setDateRange]     = useState<'14' | '30' | 'quarter' | '12months'>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('income-dateRange')
      if (saved === '14' || saved === '30' || saved === 'quarter' || saved === '12months') return saved
    }
    return '30'
  })
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('income-selectedCatIds')
        if (saved) return JSON.parse(saved) as string[]
      } catch {}
    }
    return []
  })
  const [showCatPicker, setShowCatPicker] = useState(false)

  const emptyForm = {
    name: '', amount: 0, frequency: 'monthly', incomeType: 'recurring',
    accountId: '', categoryId: '',
    nextExpectedDate: new Date().toISOString().split('T')[0],
    endDate: '', notes: '', memberId: '', locationId: '',
    entityId: '',
  }
  const [form, setForm] = useState(emptyForm)

  function enrichEntries(data: any[]): IncomeEntry[] {
    return data.map((e: any) => ({
      ...e,
      member: e.memberId ? (members.find((m) => m.id === e.memberId) ?? null) : null,
    }))
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/income')
      if (res.ok) setEntries(enrichEntries(await res.json()))
    } finally { setLoading(false) }
  }

  async function loadRefs() {
    const [aRes, cRes, mRes, lRes, eRes] = await Promise.all([
      fetch('/api/finance/accounts'),
      fetch('/api/finance/categories'),
      fetch('/api/finance/members'),
      fetch('/api/finance/locations'),
      fetch('/api/finance/entities'),
    ])
    if (aRes.ok) setAccounts(await aRes.json())
    if (cRes.ok) setCategories(await cRes.json())
    if (mRes.ok) setMembers(await mRes.json())
    if (lRes.ok) setLocations(await lRes.json())
    if (eRes.ok) setEntities(await eRes.json())
  }

  useEffect(() => { loadRefs() }, [])
  useEffect(() => { if (members.length > 0 || accounts.length > 0) load() }, [members, accounts])

  function setDateRangePersisted(r: '14' | '30' | 'quarter' | '12months') {
    sessionStorage.setItem('income-dateRange', r); setDateRange(r)
  }

  function toggleCat(id: string) {
    setSelectedCatIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      sessionStorage.setItem('income-selectedCatIds', JSON.stringify(next))
      return next
    })
  }

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true) }

  function openEdit(e: IncomeEntry) {
    setEditing(e)
    setForm({
      name: e.name, amount: e.amount, frequency: e.frequency,
      incomeType: e.incomeType ?? 'recurring',
      accountId: e.account?.id ?? '', categoryId: e.category?.id ?? '',
      nextExpectedDate: new Date(e.nextExpectedDate).toISOString().split('T')[0],
      endDate: e.endDate ? new Date(e.endDate).toISOString().split('T')[0] : '',
      notes: e.notes ?? '', memberId: e.memberId ?? '',
      locationId: e.location?.id ?? '',
      entityId: e.entity?.id ?? '',
    })
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditing(null) }

  function getFormPayload() {
    return {
      ...form,
      amount: form.amount || 0,
      accountId: form.accountId || null,
      categoryId: form.categoryId || null,
      entityId: form.entityId || null,
      endDate: form.endDate || null,
      notes: form.notes || null,
      memberId: form.memberId || null,
      locationId: form.locationId || null,
      incomeType: form.incomeType || 'recurring',
    }
  }

  async function handleSave() {
    const payload = getFormPayload()
    const body = editing ? { id: editing.id, ...payload } : payload
    const res = await fetch('/api/finance/income', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { const err = await res.json(); toast.error(err.error ?? 'Failed'); return }
    toast.success(editing ? 'Income updated' : 'Income created')
    closeForm()
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this income entry?')) return
    const res = await fetch(`/api/finance/income?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Income deleted'); load() }
    else toast.error('Failed to delete')
  }

  async function handleMarkReceived(entry: IncomeEntry) {
    const res = await fetch('/api/finance/income', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, received: true }),
    })
    if (res.ok) { toast.success('Income marked as received'); load() }
    else toast.error('Failed to mark as received')
  }

  function getNextExpected(entry: IncomeEntry): Date {
    const due = new Date(entry.nextExpectedDate)
    if (isPast(due)) {
      if (entry.frequency === 'monthly')      return addMonths(due, 1)
      if (entry.frequency === 'fortnightly')  return addWeeks(due, 2)
      if (entry.frequency === 'weekly')       return addWeeks(due, 1)
      if (entry.frequency === 'quarterly')    return addMonths(due, 3)
      if (entry.frequency === 'yearly')       return addMonths(due, 12)
    }
    return due
  }

  function formatCurrency(n: number) {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
  }

  function entryAmountForCat(entry: IncomeEntry, rootCatId: string): number {
    if (!entry.category) return 0
    const cat = categories.find(c => c.id === entry.category!.id)
    if (!cat) return 0
    if (cat.id === rootCatId || cat.parentId === rootCatId) return entry.amount
    return 0
  }

  const rootCategories = categories.filter(c => !c.parentId)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const rangeEnd = dateRange === '14' ? addDays(todayStart, 14)
    : dateRange === '30' ? addDays(todayStart, 30)
    : dateRange === '12months' ? addMonths(todayStart, 12)
    : addMonths(todayStart, 3)

  function toLocalMidnight(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }

  const activeEntries     = entries.filter(e => e.isActive && !e.received)
  const overdue           = activeEntries.filter(e => e.incomeType !== 'one-off' && toLocalMidnight(new Date(e.nextExpectedDate)) < todayStart)
  const overdueOneOff     = activeEntries.filter(e => e.incomeType === 'one-off' && toLocalMidnight(new Date(e.nextExpectedDate)) < todayStart)
  const upcoming          = activeEntries.filter(e => {
    const due = toLocalMidnight(new Date(e.nextExpectedDate))
    return due >= todayStart && due <= rangeEnd
  })
  const visibleEntries    = [...overdue, ...upcoming]
  const colCats           = rootCategories.filter(c => selectedCatIds.includes(c.id))
  const grandTotal        = visibleEntries.reduce((s, e) => s + e.amount, 0)
  const catTotals: Record<string, number> = {}
  for (const catId of selectedCatIds) {
    catTotals[catId] = visibleEntries.reduce((s, e) => s + entryAmountForCat(e, catId), 0)
  }
  const gridTemplate = `2.25rem 1fr${colCats.map(() => ' 6.5rem').join('')} 7rem 8.5rem`

  if (loading) return <div className="p-4 text-muted-foreground">Loading income…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Income</h1>
        <div className="flex items-center gap-3">
          <Link href="/finance/income/received" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Received Income
          </Link>
          <button onClick={openNew} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <Plus className="h-4 w-4" /> Add Income
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          {(['14', '30', 'quarter', '12months'] as const).map(r => (
            <button key={r} onClick={() => setDateRangePersisted(r)}
              className={cn('px-3 py-1 text-xs rounded-md font-medium transition-colors',
                dateRange === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {r === '14' ? '14 Days' : r === '30' ? '30 Days' : r === 'quarter' ? 'Quarter' : '12 Months'}
            </button>
          ))}
        </div>

        {rootCategories.length > 0 && (
          <div className="relative">
            <button onClick={() => setShowCatPicker(p => !p)}
              className={cn('inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                selectedCatIds.length > 0 ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              <Settings2 className="h-3.5 w-3.5" />
              {selectedCatIds.length > 0 ? `${selectedCatIds.length} categor${selectedCatIds.length === 1 ? 'y' : 'ies'} shown` : 'Show category columns'}
            </button>
            {showCatPicker && (
              <div className="absolute left-0 top-full mt-1 z-20 rounded-lg border border-border bg-popover shadow-md p-3 space-y-1.5 min-w-[180px]">
                <p className="text-xs text-muted-foreground font-medium mb-2">Show as columns:</p>
                {rootCategories.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={selectedCatIds.includes(c.id)} onChange={() => toggleCat(c.id)} className="rounded border-input" />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Overdue recurring income */}
      {overdue.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-amber-600 font-medium mb-2">
            <Bell className="h-4 w-4" /> {overdue.length} overdue recurring income stream{overdue.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-1">
            {overdue.map(e => (
              <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate min-w-0 flex-1">{e.name}</span>
                <span className="font-medium shrink-0">{formatCurrency(e.amount)}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => handleMarkReceived(e)} title="Mark as received"
                    className="p-1 hover:bg-amber-500/10 rounded text-green-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => openEdit(e)} title="Edit"
                    className="p-1 hover:bg-amber-500/10 rounded text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(e.id)} title="Delete"
                    className="p-1 hover:bg-amber-500/10 rounded text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overdue one-off income */}
      {overdueOneOff.length > 0 && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
          <div className="flex items-center gap-2 text-orange-500 font-medium mb-2">
            <Layers className="h-4 w-4" /> {overdueOneOff.length} overdue one-off income{overdueOneOff.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-1">
            {overdueOneOff.map(e => (
              <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <span>{e.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">Expected {format(new Date(e.nextExpectedDate), 'd MMM yyyy')}</span>
                </div>
                <span className="font-medium shrink-0">{formatCurrency(e.amount)}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => handleMarkReceived(e)} title="Mark as received"
                    className="p-1 hover:bg-orange-500/10 rounded text-green-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => openEdit(e)} title="Edit"
                    className="p-1 hover:bg-orange-500/10 rounded text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(e.id)} title="Delete"
                    className="p-1 hover:bg-orange-500/10 rounded text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Income Editor Modal */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) closeForm() }}>
        <DialogContent className="sm:max-w-2xl w-full max-h-[90vh] overflow-y-auto" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Income' : 'New Income'}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-4 pb-1">
            {(['recurring', 'one-off'] as const).map(bt => (
              <label key={bt} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="incomeType" value={bt} checked={form.incomeType === bt}
                  onChange={() => setForm(p => ({ ...p, incomeType: bt }))} className="accent-primary" />
                {bt === 'recurring'
                  ? <><RefreshCw className="h-3.5 w-3.5 text-blue-500" /> Recurring</>
                  : <><Layers className="h-3.5 w-3.5 text-orange-500" /> One-off</>}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            {form.incomeType === 'recurring' && (
              <div>
                <label className="text-xs text-muted-foreground">Frequency *</label>
                <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <select value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">No category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Account</label>
              <select value={form.accountId} onChange={e => setForm(p => ({ ...p, accountId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">No account</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{form.incomeType === 'one-off' ? 'Expected Date *' : 'Next Expected Date *'}</label>
              <input type="date" value={form.nextExpectedDate} onChange={e => setForm(p => ({ ...p, nextExpectedDate: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            {form.incomeType === 'recurring' && (
              <div>
                <label className="text-xs text-muted-foreground">End Date (optional)</label>
                <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
            )}
            {/* Assigned To */}
            <div>
              <label className="text-xs text-muted-foreground">Assigned To (person)</label>
              <select value={form.memberId} onChange={e => setForm(p => ({ ...p, memberId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">Shared (household)</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            {/* Entity selector */}
            <div>
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> Entity / Fund
              </label>
              <select value={form.entityId} onChange={e => setForm(p => ({ ...p, entityId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">Select entity…</option>
                {entities.map(e => <option key={e.id} value={e.id}>{e.name}{e.isDefault ? ' (default)' : ''}</option>)}
              </select>
              {entities.length === 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Add entities (Super Fund, etc.) in the Budget Planner → Entities tab.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Location</label>
              <select value={form.locationId} onChange={e => setForm(p => ({ ...p, locationId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">No location</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <textarea value={form.notes} rows={2} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none" />
          </div>

          <DialogFooter>
            <button onClick={closeForm} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={handleSave} className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium">
              {editing ? 'Update' : 'Create'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Income list */}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No income entries yet.</p>
      ) : (
        <div className="space-y-2">
          {colCats.length > 0 && (
            <div className="grid gap-3 px-3 pb-1" style={{ gridTemplateColumns: gridTemplate, alignItems: 'end' }}>
              <div /><div />
              {colCats.map(c => <span key={c.id} className="text-xs font-medium text-muted-foreground text-right leading-tight">{c.name}</span>)}
              <span className="text-xs font-medium text-muted-foreground text-right">Total</span>
              <div />
            </div>
          )}
          {overdue.map(e => (
            <IncomeRow key={e.id} entry={e} nextExpected={getNextExpected(e)} isOverdue
              colCats={colCats} entryAmountForCat={entryAmountForCat} gridTemplate={gridTemplate}
              onEdit={openEdit} onDelete={handleDelete} onMarkReceived={handleMarkReceived}
              formatCurrency={formatCurrency} />
          ))}
          {upcoming.map(e => (
            <IncomeRow key={e.id} entry={e} nextExpected={getNextExpected(e)} isOverdue={false}
              colCats={colCats} entryAmountForCat={entryAmountForCat} gridTemplate={gridTemplate}
              onEdit={openEdit} onDelete={handleDelete} onMarkReceived={handleMarkReceived}
              formatCurrency={formatCurrency} />
          ))}
          {visibleEntries.length > 0 && (
            <div className="grid gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 mt-1"
              style={{ gridTemplateColumns: gridTemplate, alignItems: 'center' }}>
              <div />
              <div className="text-xs font-semibold text-muted-foreground">
                {visibleEntries.length} income entr{visibleEntries.length !== 1 ? 'ies' : 'y'}
                {overdue.length > 0 && <span className="text-amber-500 ml-1">({overdue.length} overdue)</span>}
              </div>
              {colCats.map(c => (
                <span key={c.id} className="text-xs font-semibold text-right">
                  {catTotals[c.id] > 0 ? formatCurrency(catTotals[c.id]) : <span className="text-muted-foreground">—</span>}
                </span>
              ))}
              <span className="text-sm font-bold text-right">{formatCurrency(grandTotal)}</span>
              <div />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function IncomeRow({
  entry, nextExpected, isOverdue, colCats, entryAmountForCat, gridTemplate,
  onEdit, onDelete, onMarkReceived, formatCurrency,
}: {
  entry: IncomeEntry; nextExpected: Date; isOverdue: boolean
  colCats: { id: string; name: string }[]
  entryAmountForCat: (entry: IncomeEntry, catId: string) => number
  gridTemplate: string
  onEdit: (e: IncomeEntry) => void; onDelete: (id: string) => void
  onMarkReceived: (e: IncomeEntry) => void
  formatCurrency: (n: number) => string
}) {
  const isOneOff = entry.incomeType === 'one-off'
  const rowClass = cn(
    'grid gap-3 rounded-lg border p-3 cursor-default select-none transition-colors',
    isOverdue  ? 'border-amber-500/30 bg-amber-500/5'
    :            'border-border hover:bg-accent/50',
  )
  return (
    <div className={rowClass} style={{ gridTemplateColumns: gridTemplate, alignItems: 'center' }}
      onDoubleClick={() => onEdit(entry)}>
      <div className={cn('w-9 h-9 rounded-full flex items-center justify-center',
        isOverdue ? 'bg-amber-500/10' : isOneOff ? 'bg-orange-500/10' : 'bg-muted')}>
        {isOneOff
          ? <Layers className={cn('h-4 w-4', isOverdue ? 'text-amber-500' : 'text-orange-500')} />
          : <RefreshCw className={cn('h-4 w-4', isOverdue ? 'text-amber-500' : 'text-muted-foreground')} />}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{entry.name}</span>
          {!entry.isActive && <span className="text-[10px] bg-muted px-1.5 rounded">INACTIVE</span>}
          {entry.entity && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
              style={{ backgroundColor: entry.entity.color ?? '#6B7280' }}>
              {entry.entity.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="capitalize">{isOneOff ? 'One-off' : entry.frequency}</span>
          {entry.account  && <span>{entry.account.name}</span>}
          {entry.member   && <span className="text-primary">{entry.member.name}</span>}
          {entry.location && <span>{entry.location.name}</span>}
          <span>Expected {format(nextExpected, 'd MMM yyyy')}</span>
          {entry.notes && <span className="italic truncate max-w-[120px]" title={entry.notes}>· {entry.notes}</span>}
        </div>
      </div>
      {colCats.map(c => {
        const amt = entryAmountForCat(entry, c.id)
        return <span key={c.id} className="text-sm text-right text-muted-foreground">{amt > 0 ? formatCurrency(amt) : '—'}</span>
      })}
      <p className="text-sm font-semibold text-right">{formatCurrency(entry.amount)}</p>
      <div className="flex items-center gap-0.5 justify-end">
        <button onClick={() => onMarkReceived(entry)} title="Mark as received" className="p-1 hover:bg-accent rounded text-green-500">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onEdit(entry)} className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={() => onDelete(entry.id)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}
