'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2, XCircle, Pencil, Inbox, AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react'
import { formatCurrency } from '@/lib/financeShared'
import { sortedCategoryList } from '@/lib/finance-categories'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DraftBill {
  id: string
  name: string
  amount: number
  nextDueDate: string
  status: string | null
  spawnedSnapshotHash: string | null
  templateId: string | null
  categoryId: string | null
  vendorId: string | null
  notes: string | null
  template: { id: string; name: string } | null
  vendor: { id: string; name: string } | null
  category: { id: string; name: string; type: string } | null
}

interface DraftIncome {
  id: string
  name: string
  amount: number
  nextExpectedDate: string
  status: string | null
  spawnedSnapshotHash: string | null
  templateId: string | null
  categoryId: string | null
  vendorId: string | null
  notes: string | null
  template: { id: string; name: string } | null
  vendor: { id: string; name: string } | null
  category: { id: string; name: string; type: string } | null
  payslip: { id: string; grossPay: number; netPay: number } | null
}

interface Category {
  id: string
  name: string
  type: string
  parentId: string | null
}

interface Vendor {
  id: string
  name: string
}

interface EditState {
  kind: 'bill' | 'income'
  id: string
  name: string
  amount: string
  date: string
  categoryId: string
  vendorId: string
  notes: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Edit Dialog ───────────────────────────────────────────────────────────────

function EditDialog({
  state,
  categories,
  vendors,
  onClose,
  onSave,
}: {
  state: EditState
  categories: Category[]
  vendors: Vendor[]
  onClose: () => void
  onSave: (s: EditState) => Promise<void>
}) {
  const [form, setForm] = useState(state)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (field: keyof EditState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    const amt = parseFloat(form.amount)
    if (isNaN(amt) || amt <= 0) { setError('Amount must be a positive number'); return }
    if (!form.date) { setError('Date is required'); return }
    setSaving(true)
    setError('')
    try {
      await onSave(form)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const catLabel = form.kind === 'bill' ? 'Expense Category' : 'Income Category'
  const dateLabel = form.kind === 'bill' ? 'Due Date' : 'Expected Date'

  const targetType = form.kind === 'bill' ? 'expense' : 'income'
  const filteredCats = sortedCategoryList(
    categories
      .filter(c => c.type === targetType)
      .map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        parentId: c.parentId ?? null,
      })),
  )

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Draft</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Amount ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{dateLabel}</label>
            <input
              type="date"
              value={form.date}
              onChange={e => set('date', e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{catLabel}</label>
            <select
              value={form.categoryId}
              onChange={e => set('categoryId', e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— none —</option>
              {filteredCats.map(c => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? `  ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Vendor / Payer</label>
            <select
              value={form.vendorId}
              onChange={e => set('vendorId', e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— none —</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm border border-border text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Draft Row ─────────────────────────────────────────────────────────────────

function DraftRow({
  kind,
  id,
  name,
  amount,
  date,
  templateName,
  vendorName,
  categoryName,
  isChanged,
  isPayslip,
  onApprove,
  onCancel,
  onEdit,
}: {
  kind: 'bill' | 'income'
  id: string
  name: string
  amount: number
  date: string
  templateName: string | null
  vendorName: string | null
  categoryName: string | null
  isChanged: boolean
  isPayslip: boolean
  onApprove: () => void
  onCancel: () => void
  onEdit: () => void
}) {
  const [busy, setBusy] = useState<'approve' | 'cancel' | null>(null)

  async function handle(action: 'approve' | 'cancel', fn: () => void) {
    setBusy(action)
    try { await fn() } finally { setBusy(null) }
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm">{name}</span>
          {isChanged && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Changed
            </span>
          )}
          {isPayslip && (
            <span className="rounded-full bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
              Payslip
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{fmtDate(date)}</span>
          <span className="font-medium text-foreground">{formatCurrency(amount)}</span>
          {categoryName && <span>{categoryName}</span>}
          {vendorName && <span>{vendorName}</span>}
          {templateName && <span className="italic">from "{templateName}"</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => handle('approve', onApprove)}
          disabled={busy !== null}
          title="Approve"
          className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-40 transition-colors"
        >
          {busy === 'approve' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        </button>
        <button
          onClick={onEdit}
          disabled={busy !== null}
          title="Edit"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 transition-colors"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => handle('cancel', onCancel)}
          disabled={busy !== null}
          title="Cancel draft"
          className="rounded-md p-1.5 text-destructive/70 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 transition-colors"
        >
          {busy === 'cancel' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function DraftSection({
  title,
  kind,
  count,
  children,
  onBulkApprove,
  bulkBusy,
}: {
  title: string
  kind: 'bill' | 'income'
  count: number
  children: React.ReactNode
  onBulkApprove: () => void
  bulkBusy: boolean
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <section className="rounded-xl border border-border bg-background shadow-sm overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none bg-muted/20 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(p => !p)}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{title}</span>
          <span className="rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">
            {count}
          </span>
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {count > 0 && (
            <button
              onClick={onBulkApprove}
              disabled={bulkBusy}
              className="flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
            >
              {bulkBusy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Approve Unchanged
            </button>
          )}
          <button
            onClick={() => setExpanded(p => !p)}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="divide-y divide-border/50 p-2 space-y-1">
          {children}
        </div>
      )}
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DraftsPage() {
  const [bills, setBills] = useState<DraftBill[]>([])
  const [income, setIncome] = useState<DraftIncome[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [editState, setEditState] = useState<EditState | null>(null)
  const [bulkBusyBills, setBulkBusyBills] = useState(false)
  const [bulkBusyIncome, setBulkBusyIncome] = useState(false)
  const [toastMsg, setToastMsg] = useState('')

  function toast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [draftsRes, catsRes, vendorsRes] = await Promise.all([
        fetch('/api/finance/drafts'),
        fetch('/api/finance/categories'),
        fetch('/api/finance/contacts'),
      ])
      if (!draftsRes.ok) throw new Error('Failed to load drafts')
      const draftsData = await draftsRes.json()
      const catsData = catsRes.ok ? await catsRes.json() : []
      const vendorsData = vendorsRes.ok ? await vendorsRes.json() : []
      setBills(draftsData.bills ?? [])
      setIncome(draftsData.income ?? [])
      setCategories(Array.isArray(catsData) ? catsData : (catsData.categories ?? []))
      setVendors(Array.isArray(vendorsData) ? vendorsData : [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleApprove(kind: 'bill' | 'income', id: string) {
    const res = await fetch(`/api/finance/drafts/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? 'Approve failed')
    }
    toast(`Draft approved`)
    await load()
  }

  async function handleCancel(kind: 'bill' | 'income', id: string) {
    const res = await fetch(`/api/finance/drafts/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? 'Cancel failed')
    }
    toast('Draft cancelled')
    await load()
  }

  function openEdit(kind: 'bill' | 'income', d: DraftBill | DraftIncome) {
    const date = 'nextDueDate' in d
      ? new Date(d.nextDueDate).toISOString().slice(0, 10)
      : new Date((d as DraftIncome).nextExpectedDate).toISOString().slice(0, 10)
    setEditState({
      kind,
      id: d.id,
      name: d.name,
      amount: String(d.amount),
      date,
      categoryId: d.categoryId ?? '',
      vendorId: d.vendorId ?? '',
      notes: d.notes ?? '',
    })
  }

  async function handleEditSave(s: EditState) {
    const body: Record<string, unknown> = {
      kind: s.kind,
      name: s.name,
      amount: s.amount,
      [s.kind === 'bill' ? 'nextDueDate' : 'nextExpectedDate']: s.date,
      categoryId: s.categoryId || null,
      vendorId: s.vendorId || null,
      notes: s.notes || null,
    }
    const res = await fetch(`/api/finance/drafts/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? 'Save failed')
    }
    setEditState(null)
    toast('Draft updated')
    await load()
  }

  async function handleBulkApprove(kind: 'bill' | 'income') {
    const setter = kind === 'bill' ? setBulkBusyBills : setBulkBusyIncome
    setter(true)
    try {
      const res = await fetch('/api/finance/drafts/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Bulk approve failed')
      const { approved, candidatesFound, failures } = data
      if (failures?.length > 0) {
        toast(`Approved ${approved}/${candidatesFound} — ${failures.length} failed`)
      } else if (approved === 0) {
        toast('No unchanged drafts to approve')
      } else {
        toast(`Approved ${approved} unchanged draft${approved !== 1 ? 's' : ''}`)
      }
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Bulk approve failed')
    } finally {
      setter(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" />
        Loading drafts…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive mb-3">{loadError}</p>
        <button onClick={load} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
          Retry
        </button>
      </div>
    )
  }

  const totalDrafts = bills.length + income.length

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Inbox className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Drafts Inbox</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recurring transaction drafts awaiting review
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Empty state */}
      {totalDrafts === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center">
          <Inbox className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-medium text-muted-foreground">No drafts</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Drafts are created automatically by the daily spawn scheduler
          </p>
        </div>
      )}

      {/* Bill Drafts */}
      {bills.length > 0 && (
        <DraftSection
          title="Bill Drafts"
          kind="bill"
          count={bills.length}
          onBulkApprove={() => handleBulkApprove('bill')}
          bulkBusy={bulkBusyBills}
        >
          {bills.map(d => (
            <DraftRow
              key={d.id}
              kind="bill"
              id={d.id}
              name={d.name}
              amount={d.amount}
              date={d.nextDueDate}
              templateName={d.template?.name ?? null}
              vendorName={d.vendor?.name ?? null}
              categoryName={d.category?.name ?? null}
              isChanged={d.spawnedSnapshotHash === null && d.templateId !== null}
              isPayslip={false}
              onApprove={() => handleApprove('bill', d.id)}
              onCancel={() => handleCancel('bill', d.id)}
              onEdit={() => openEdit('bill', d)}
            />
          ))}
        </DraftSection>
      )}

      {/* Income Drafts */}
      {income.length > 0 && (
        <DraftSection
          title="Income Drafts"
          kind="income"
          count={income.length}
          onBulkApprove={() => handleBulkApprove('income')}
          bulkBusy={bulkBusyIncome}
        >
          {income.map(d => (
            <DraftRow
              key={d.id}
              kind="income"
              id={d.id}
              name={d.name}
              amount={d.amount}
              date={d.nextExpectedDate}
              templateName={d.template?.name ?? null}
              vendorName={d.vendor?.name ?? null}
              categoryName={d.category?.name ?? null}
              isChanged={d.spawnedSnapshotHash === null && d.templateId !== null}
              isPayslip={d.payslip !== null}
              onApprove={() => handleApprove('income', d.id)}
              onCancel={() => handleCancel('income', d.id)}
              onEdit={() => openEdit('income', d)}
            />
          ))}
        </DraftSection>
      )}

      {/* Edit dialog */}
      {editState && (
        <EditDialog
          state={editState}
          categories={categories}
          vendors={vendors}
          onClose={() => setEditState(null)}
          onSave={handleEditSave}
        />
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-border bg-background shadow-lg px-4 py-2.5 text-sm font-medium">
          {toastMsg}
        </div>
      )}
    </div>
  )
}
