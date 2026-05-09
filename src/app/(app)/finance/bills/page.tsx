'use client'

import { useEffect, useState, useRef } from 'react'
import {
  Plus, Pencil, Trash2, Bell, Settings2, CheckCircle2, Receipt,
  RefreshCw, Layers, Paperclip, Upload, X, FileText, Download, Building2,
  BookmarkCheck, Briefcase, Eye, EyeOff,
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
interface Vendor { id: string; name: string; defaultCategory?: { id: string; name: string } | null }
interface Entity { id: string; name: string; color: string | null; type: string; isDefault: boolean }
interface BillAttachment {
  id: string; billId: string; title: string; fileName: string
  fileSize: number; mimeType: string; createdAt: string
}

export interface Bill {
  id: string; name: string; amount: number; frequency: string
  dayOfMonth: number | null; monthOfYear: number | null
  nextDueDate: string; endDate: string | null; isActive: boolean
  autoPay: boolean; emailReminder: boolean; reminderDays: number
  notes: string | null; memberId: string | null
  account: { id: string; name: string } | null
  category: { id: string; name: string; color: string | null } | null
  vendor: { id: string; name: string } | null
  member: Member | null
  location: Location | null
  entity: Entity | null
  paid: boolean; paidDate: string | null
  invoiceReceived: boolean; invoiceReceivedDate: string | null
  billType: string; recurrenceInterval: string | null; parentBillId: string | null
  attachments?: BillAttachment[]
}

function toMonthlyAmount(amount: number, frequency: string): number {
  if (frequency === 'weekly')      return amount * 52 / 12
  if (frequency === 'fortnightly') return amount * 26 / 12
  if (frequency === 'quarterly')   return amount / 3
  if (frequency === 'yearly')      return amount / 12
  return amount
}

// Entity colour badge helper
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

export default function BillsPage() {
  const [bills, setBills]           = useState<Bill[]>([])
  const [accounts, setAccounts]     = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; parentId: string | null }[]>([])
  const [members, setMembers]       = useState<Member[]>([])
  const [locations, setLocations]   = useState<Location[]>([])
  const [vendors, setVendors]       = useState<Vendor[]>([])
  const [entities, setEntities]     = useState<Entity[]>([])
  const [budgetBillIds, setBudgetBillIds] = useState<Set<string>>(new Set())
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState<Bill | null>(null)
  const [dateRange, setDateRange]   = useState<'14' | '30' | 'quarter' | '12months'>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('bills-dateRange')
      if (saved === '14' || saved === '30' || saved === 'quarter' || saved === '12months') return saved
    }
    return '30'
  })
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem('bills-selectedCatIds')
        if (saved) return JSON.parse(saved) as string[]
      } catch {}
    }
    return []
  })
  const [showCatPicker, setShowCatPicker] = useState(false)
  const [attachmentBillId, setAttachmentBillId] = useState<string | null>(null)
  const [attachments, setAttachments]           = useState<BillAttachment[]>([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null)
  const attachFileRef = useRef<HTMLInputElement>(null)

  const emptyForm = {
    name: '', amount: 0, frequency: 'monthly', accountId: '', categoryId: '',
    dayOfMonth: '', monthOfYear: '', nextDueDate: new Date().toISOString().split('T')[0],
    endDate: '', autoPay: false, emailReminder: false, reminderDays: 3,
    notes: '', memberId: '', locationId: '', vendorId: '',
    entityId: entities.find(e => e.isDefault)?.id ?? '',
    billType: 'recurring', recurrenceInterval: '',
    invoiceReceived: false, invoiceReceivedDate: '',
    addToBudget: false,
  }
  const [form, setForm] = useState(emptyForm)

  function enrichBills(data: any[]): Bill[] {
    return data.map((b: any) => ({
      ...b,
      member: b.memberId ? (members.find((m) => m.id === b.memberId) ?? null) : null,
    }))
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/bills')
      if (res.ok) setBills(enrichBills(await res.json()))
    } finally { setLoading(false) }
  }

  async function loadRefs() {
    const [aRes, cRes, mRes, lRes, vRes, bRes, eRes] = await Promise.all([
      fetch('/api/finance/accounts'),
      fetch('/api/finance/categories'),
      fetch('/api/finance/members'),
      fetch('/api/finance/locations'),
      fetch('/api/finance/vendors'),
      fetch('/api/finance/budget'),
      fetch('/api/finance/entities'),
    ])
    if (aRes.ok) setAccounts(await aRes.json())
    if (cRes.ok) setCategories(await cRes.json())
    if (mRes.ok) setMembers(await mRes.json())
    if (lRes.ok) setLocations(await lRes.json())
    if (vRes.ok) setVendors(await vRes.json())
    if (eRes.ok) setEntities(await eRes.json())
    if (bRes.ok) {
      const budgets: any[] = await bRes.json()
      setBudgetBillIds(new Set(budgets.filter(b => b.billId).map(b => b.billId)))
    }
  }

  useEffect(() => { loadRefs() }, [])
  useEffect(() => { if (members.length > 0 || accounts.length > 0) load() }, [members, accounts])

  async function syncBudgetRule(bill: Bill, addToBudget: boolean) {
    if (addToBudget) {
      await fetch('/api/finance/budget', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upsertFromBill: true,
          billId: bill.id,
          name: bill.name,
          amount: toMonthlyAmount(bill.amount, bill.frequency),
          categoryId: bill.category?.id ?? null,
          period: 'monthly',
          entityId: bill.entity?.id ?? null,
        }),
      })
      setBudgetBillIds(prev => new Set([...prev, bill.id]))
    } else {
      await fetch('/api/finance/budget', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeFromBill: true, billId: bill.id }),
      })
      setBudgetBillIds(prev => { const s = new Set(prev); s.delete(bill.id); return s })
    }
  }

  async function openAttachments(bill: Bill) {
    setAttachmentBillId(bill.id)
    setAttachmentsLoading(true)
    try {
      const res = await fetch(`/api/finance/bills/${bill.id}/attachments`)
      if (res.ok) setAttachments(await res.json())
    } finally { setAttachmentsLoading(false) }
  }

  function closeAttachments() { setAttachmentBillId(null); setAttachments([]); setPreviewAttachmentId(null) }

  function togglePreview(attId: string) {
    setPreviewAttachmentId(prev => prev === attId ? null : attId)
  }

  function isImageMime(mime: string) {
    return mime.startsWith('image/')
  }

  function isPdfMime(mime: string) {
    return mime === 'application/pdf'
  }

  async function handleAttachmentUpload(billId: string, file: File) {
    setUploadingAttachment(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', file.name.replace(/\.[^/.]+$/, ''))
      const res = await fetch(`/api/finance/bills/${billId}/attachments`, { method: 'POST', body: fd })
      if (res.ok) { const a = await res.json(); setAttachments(prev => [...prev, a]); toast.success('Attachment uploaded') }
      else toast.error('Failed to upload attachment')
    } finally { setUploadingAttachment(false) }
  }

  async function handleAttachmentDelete(billId: string, attachmentId: string) {
    if (!confirm('Remove this attachment?')) return
    const res = await fetch(`/api/finance/bills/${billId}/attachments/${attachmentId}`, { method: 'DELETE' })
    if (res.ok) { setAttachments(prev => prev.filter(a => a.id !== attachmentId)); toast.success('Attachment removed') }
    else toast.error('Failed to remove attachment')
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function setDateRangePersisted(r: '14' | '30' | 'quarter' | '12months') {
    sessionStorage.setItem('bills-dateRange', r); setDateRange(r)
  }

  function toggleCat(id: string) {
    setSelectedCatIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      sessionStorage.setItem('bills-selectedCatIds', JSON.stringify(next))
      return next
    })
  }

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true) }

  function openEdit(b: Bill) {
    setEditing(b)
    setForm({
      name: b.name, amount: b.amount, frequency: b.frequency,
      accountId: b.account?.id ?? '', categoryId: b.category?.id ?? '',
      dayOfMonth: b.dayOfMonth?.toString() ?? '',
      monthOfYear: b.monthOfYear?.toString() ?? '',
      nextDueDate: new Date(b.nextDueDate).toISOString().split('T')[0],
      endDate: b.endDate ? new Date(b.endDate).toISOString().split('T')[0] : '',
      autoPay: b.autoPay, emailReminder: b.emailReminder, reminderDays: b.reminderDays,
      notes: b.notes ?? '', memberId: b.memberId ?? '',
      locationId: b.location?.id ?? '', vendorId: b.vendor?.id ?? '',
      // If no entity is set, default to the first entity with isDefault=true
      entityId: b.entity?.id ?? entities.find(e => e.isDefault)?.id ?? '',
      billType: b.billType ?? 'recurring', recurrenceInterval: b.recurrenceInterval ?? '',
      invoiceReceived: b.invoiceReceived ?? false,
      invoiceReceivedDate: b.invoiceReceivedDate
        ? new Date(b.invoiceReceivedDate).toISOString().split('T')[0] : '',
      addToBudget: budgetBillIds.has(b.id),
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
      vendorId: form.vendorId || null,
      entityId: form.entityId || null,
      dayOfMonth: form.dayOfMonth || null,
      monthOfYear: form.monthOfYear || null,
      endDate: form.endDate || null,
      notes: form.notes || null,
      memberId: form.memberId || null,
      locationId: form.locationId || null,
      billType: form.billType || 'recurring',
      recurrenceInterval: form.recurrenceInterval || null,
      invoiceReceived: form.invoiceReceived,
      invoiceReceivedDate: form.invoiceReceived && form.invoiceReceivedDate ? form.invoiceReceivedDate : null,
    }
  }

  async function handleSave() {
    const { addToBudget, ...payload } = getFormPayload() as any
    const body = editing ? { id: editing.id, ...payload } : payload
    const res = await fetch('/api/finance/bills', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { const err = await res.json(); toast.error(err.error ?? 'Failed'); return }
    const savedBill: Bill = await res.json()
    toast.success(editing ? 'Bill updated' : 'Bill created')
    await syncBudgetRule(savedBill, form.addToBudget)
    closeForm()
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this bill?')) return
    await fetch('/api/finance/budget', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeFromBill: true, billId: id }),
    })
    const res = await fetch(`/api/finance/bills?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Bill deleted'); load() }
    else toast.error('Failed to delete')
  }

  async function handleMarkPaid(bill: Bill) {
    const res = await fetch('/api/finance/bills', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bill.id, paid: true }),
    })
    if (res.ok) { toast.success('Bill marked as paid'); load() }
    else toast.error('Failed to mark as paid')
  }

  async function handleToggleInvoice(bill: Bill) {
    const newVal = !bill.invoiceReceived
    const res = await fetch('/api/finance/bills', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bill.id, invoiceReceived: newVal }),
    })
    if (res.ok) { toast.success(newVal ? 'Invoice marked received' : 'Invoice unmarked'); load() }
    else toast.error('Failed to update invoice status')
  }

  function handleVendorChange(vendorId: string) {
    const vendor = vendors.find(v => v.id === vendorId)
    const update: any = { vendorId }
    if (vendor?.defaultCategory && !form.categoryId) update.categoryId = vendor.defaultCategory.id
    setForm(p => ({ ...p, ...update }))
  }

  function getNextDue(bill: Bill): Date {
    const due = new Date(bill.nextDueDate)
    if (isPast(due)) {
      if (bill.frequency === 'monthly')      return addMonths(due, 1)
      if (bill.frequency === 'fortnightly')  return addWeeks(due, 2)
      if (bill.frequency === 'weekly')       return addWeeks(due, 1)
      if (bill.frequency === 'quarterly')    return addMonths(due, 3)
      if (bill.frequency === 'yearly')       return addMonths(due, 12)
    }
    return due
  }

  function formatCurrency(n: number) {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
  }

  function billAmountForCat(bill: Bill, rootCatId: string): number {
    if (!bill.category) return 0
    const cat = categories.find(c => c.id === bill.category!.id)
    if (!cat) return 0
    if (cat.id === rootCatId || cat.parentId === rootCatId) return bill.amount
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

  const activeBills     = bills.filter(b => b.isActive && !b.paid)
  const overdue         = activeBills.filter(b => b.billType !== 'one-off' && toLocalMidnight(new Date(b.nextDueDate)) < todayStart)
  const overdueOneOff   = activeBills.filter(b => b.billType === 'one-off' && toLocalMidnight(new Date(b.nextDueDate)) < todayStart)
  const upcoming        = activeBills.filter(b => {
    const due = toLocalMidnight(new Date(b.nextDueDate))
    return due >= todayStart && due <= rangeEnd
  })
  const visibleBills    = [...overdue, ...upcoming]
  const colCats         = rootCategories.filter(c => selectedCatIds.includes(c.id))
  const grandTotal      = visibleBills.reduce((s, b) => s + b.amount, 0)
  const catTotals: Record<string, number> = {}
  for (const catId of selectedCatIds) {
    catTotals[catId] = visibleBills.reduce((s, b) => s + billAmountForCat(b, catId), 0)
  }
  const gridTemplate = `2.25rem 1fr${colCats.map(() => ' 6.5rem').join('')} 7rem 8.5rem`
  const attachmentBill = attachmentBillId ? bills.find(b => b.id === attachmentBillId) ?? null : null

  if (loading) return <div className="p-4 text-muted-foreground">Loading bills…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bills & Recurring</h1>
        <div className="flex items-center gap-3">
          <Link href="/finance/paid-bills" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Paid Bills
          </Link>
          <button onClick={openNew} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <Plus className="h-4 w-4" /> Add Bill
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

      {overdue.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 text-red-500 font-medium mb-2">
            <Bell className="h-4 w-4" /> {overdue.length} overdue recurring bill{overdue.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-1">
            {overdue.map(b => (
              <div key={b.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate min-w-0 flex-1">{b.name}</span>
                <span className="font-medium shrink-0">{formatCurrency(b.amount)}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => handleMarkPaid(b)} title="Mark as paid"
                    className="p-1 hover:bg-red-500/10 rounded text-green-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => openEdit(b)} title="Edit"
                    className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(b.id)} title="Delete"
                    className="p-1 hover:bg-red-500/10 rounded text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {overdueOneOff.length > 0 && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
          <div className="flex items-center gap-2 text-orange-500 font-medium mb-2">
            <Layers className="h-4 w-4" /> {overdueOneOff.length} overdue one-off bill{overdueOneOff.length !== 1 ? 's' : ''}
          </div>
          <div className="space-y-1">
            {overdueOneOff.map(b => (
              <div key={b.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <span>{b.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">Due {format(new Date(b.nextDueDate), 'd MMM yyyy')}</span>
                </div>
                <span className="font-medium shrink-0">{formatCurrency(b.amount)}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => handleMarkPaid(b)} title="Mark as paid"
                    className="p-1 hover:bg-orange-500/10 rounded text-green-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => openEdit(b)} title="Edit"
                    className="p-1 hover:bg-orange-500/10 rounded text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(b.id)} title="Delete"
                    className="p-1 hover:bg-orange-500/10 rounded text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bill Editor Modal */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) closeForm() }}>
        <DialogContent className="sm:max-w-2xl w-full max-h-[90vh] overflow-y-auto" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Bill' : 'New Bill'}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-4 pb-1">
            {(['recurring', 'one-off'] as const).map(bt => (
              <label key={bt} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="billType" value={bt} checked={form.billType === bt}
                  onChange={() => setForm(p => ({ ...p, billType: bt }))} className="accent-primary" />
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
            {form.billType === 'recurring' && (
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
              <label className="text-xs text-muted-foreground">Vendor</label>
              <div className="flex gap-1">
                <select value={form.vendorId} onChange={e => handleVendorChange(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="">No vendor</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <Link href="/finance/vendors"
                  className="shrink-0 inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-1.5 text-muted-foreground hover:text-foreground"
                  title="Manage vendors">
                  <Building2 className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
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
              <label className="text-xs text-muted-foreground">Day of Month</label>
              <input type="number" min={1} max={31} value={form.dayOfMonth}
                onChange={e => setForm(p => ({ ...p, dayOfMonth: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Month of Year (for annual)</label>
              <select value={form.monthOfYear} onChange={e => setForm(p => ({ ...p, monthOfYear: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">None</option>
                {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                  <option key={i+1} value={i+1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{form.billType === 'one-off' ? 'Due Date *' : 'Next Due Date *'}</label>
              <input type="date" value={form.nextDueDate} onChange={e => setForm(p => ({ ...p, nextDueDate: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
            {form.billType === 'recurring' && (
              <div>
                <label className="text-xs text-muted-foreground">End Date (optional)</label>
                <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
            )}
            {/* Assign To: members + entity separator */}
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

          <div className="flex flex-wrap gap-6 pt-1">
            {form.billType === 'recurring' && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.autoPay} onChange={e => setForm(p => ({ ...p, autoPay: e.target.checked }))} className="rounded border-input" />
                Auto-pay
              </label>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.emailReminder} onChange={e => setForm(p => ({ ...p, emailReminder: e.target.checked }))} className="rounded border-input" />
              Email reminder
            </label>
            {form.emailReminder && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Remind</label>
                <input type="number" min={0} max={30} value={form.reminderDays}
                  onChange={e => setForm(p => ({ ...p, reminderDays: parseInt(e.target.value) || 0 }))}
                  className="w-16 rounded-md border border-input bg-background px-2 py-1 text-sm text-center" />
                <span className="text-xs text-muted-foreground">days before</span>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.invoiceReceived} onChange={e => setForm(p => ({ ...p, invoiceReceived: e.target.checked }))} className="rounded border-input" />
              <Receipt className="h-3.5 w-3.5 text-green-500" /> Invoice received
            </label>
            {form.invoiceReceived && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Invoice date</label>
                <input type="date" value={form.invoiceReceivedDate}
                  onChange={e => setForm(p => ({ ...p, invoiceReceivedDate: e.target.value }))}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm" />
              </div>
            )}
          </div>

          <div className={cn(
            'rounded-md border px-3 py-2.5 flex items-start gap-3',
            form.addToBudget ? 'border-primary/40 bg-primary/5' : 'border-border',
          )}>
            <input type="checkbox" id="addToBudget" checked={form.addToBudget}
              onChange={e => setForm(p => ({ ...p, addToBudget: e.target.checked }))}
              className="rounded border-input mt-0.5" />
            <label htmlFor="addToBudget" className="cursor-pointer flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
                Include in budget planner
              </div>
              {form.addToBudget && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Creates a budget rule for{' '}
                  <strong>{formatCurrency(toMonthlyAmount(form.amount || 0, form.frequency))}</strong>/month
                  {form.frequency !== 'monthly' ? ` (${form.frequency} amount normalised to monthly)` : ''}.
                  {form.entityId && entities.find(e => e.id === form.entityId) && (
                    <> Appears under <strong>{entities.find(e => e.id === form.entityId)!.name}</strong> tab.</>
                  )}
                </p>
              )}
            </label>
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

      {/* Bill list */}
      {bills.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bills yet.</p>
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
          {overdue.map(b => (
            <BillRow key={b.id} bill={b} nextDue={getNextDue(b)} isOverdue
              colCats={colCats} billAmountForCat={billAmountForCat} gridTemplate={gridTemplate}
              inBudget={budgetBillIds.has(b.id)}
              onEdit={openEdit} onDelete={handleDelete} onMarkPaid={handleMarkPaid}
              onToggleInvoice={handleToggleInvoice} onOpenAttachments={openAttachments}
              attachmentBillId={attachmentBillId}
              attachments={attachments} attachmentsLoading={attachmentsLoading}
              uploadingAttachment={uploadingAttachment} attachFileRef={attachFileRef}
              previewAttachmentId={previewAttachmentId}
              onCloseAttachments={closeAttachments} onTogglePreview={togglePreview}
              onAttachmentUpload={handleAttachmentUpload} onAttachmentDelete={handleAttachmentDelete}
              isImageMime={isImageMime} isPdfMime={isPdfMime} formatFileSize={formatFileSize}
              formatCurrency={formatCurrency} />
          ))}
          {upcoming.map(b => (
            <BillRow key={b.id} bill={b} nextDue={getNextDue(b)} isOverdue={false}
              colCats={colCats} billAmountForCat={billAmountForCat} gridTemplate={gridTemplate}
              inBudget={budgetBillIds.has(b.id)}
              onEdit={openEdit} onDelete={handleDelete} onMarkPaid={handleMarkPaid}
              onToggleInvoice={handleToggleInvoice} onOpenAttachments={openAttachments}
              attachmentBillId={attachmentBillId}
              attachments={attachments} attachmentsLoading={attachmentsLoading}
              uploadingAttachment={uploadingAttachment} attachFileRef={attachFileRef}
              previewAttachmentId={previewAttachmentId}
              onCloseAttachments={closeAttachments} onTogglePreview={togglePreview}
              onAttachmentUpload={handleAttachmentUpload} onAttachmentDelete={handleAttachmentDelete}
              isImageMime={isImageMime} isPdfMime={isPdfMime} formatFileSize={formatFileSize}
              formatCurrency={formatCurrency} />
          ))}
          {visibleBills.length > 0 && (
            <div className="grid gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 mt-1"
              style={{ gridTemplateColumns: gridTemplate, alignItems: 'center' }}>
              <div />
              <div className="text-xs font-semibold text-muted-foreground">
                {visibleBills.length} bill{visibleBills.length !== 1 ? 's' : ''}
                {overdue.length > 0 && <span className="text-red-500 ml-1">({overdue.length} overdue)</span>}
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

function BillRow({
  bill, nextDue, isOverdue, colCats, billAmountForCat, gridTemplate,
  inBudget, onEdit, onDelete, onMarkPaid, onToggleInvoice, onOpenAttachments,
  attachmentBillId, attachments, attachmentsLoading, uploadingAttachment, attachFileRef,
  previewAttachmentId, onCloseAttachments, onTogglePreview,
  onAttachmentUpload, onAttachmentDelete, isImageMime, isPdfMime, formatFileSize,
  formatCurrency,
}: {
  bill: Bill; nextDue: Date; isOverdue: boolean
  colCats: { id: string; name: string }[]
  billAmountForCat: (bill: Bill, catId: string) => number
  gridTemplate: string; inBudget: boolean
  onEdit: (b: Bill) => void; onDelete: (id: string) => void
  onMarkPaid: (b: Bill) => void; onToggleInvoice: (b: Bill) => void
  onOpenAttachments: (b: Bill) => void
  attachmentBillId: string | null
  attachments: BillAttachment[]; attachmentsLoading: boolean
  uploadingAttachment: boolean; attachFileRef: React.RefObject<HTMLInputElement | null>
  previewAttachmentId: string | null
  onCloseAttachments: () => void
  onTogglePreview: (id: string) => void
  onAttachmentUpload: (billId: string, file: File) => Promise<void>
  onAttachmentDelete: (billId: string, attachmentId: string) => Promise<void>
  isImageMime: (mime: string) => boolean; isPdfMime: (mime: string) => boolean
  formatFileSize: (bytes: number) => string
  formatCurrency: (n: number) => string
}) {
  const isOneOff         = bill.billType === 'one-off'
  const hasInvoice       = bill.invoiceReceived
  const isAttachmentOpen = attachmentBillId === bill.id
  const rowClass = cn(
    'grid gap-3 rounded-lg border p-3 cursor-default select-none transition-colors',
    isOverdue    ? 'border-red-500/30 bg-red-500/5'
    : hasInvoice ? 'border-green-500/30 bg-green-500/5'
    :              'border-border hover:bg-accent/50',
    isAttachmentOpen && 'ring-1 ring-green-500/40 rounded-b-none',
  )
  return (
    <div>
      {/* Bill row */}
      <div className={rowClass} style={{ gridTemplateColumns: gridTemplate, alignItems: 'center' }}
        onDoubleClick={() => onEdit(bill)}>
        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center',
          isOverdue ? 'bg-red-500/10' : hasInvoice ? 'bg-green-500/10' : isOneOff ? 'bg-orange-500/10' : 'bg-muted')}>
          {isOneOff
            ? <Layers className={cn('h-4 w-4', isOverdue ? 'text-red-500' : 'text-orange-500')} />
            : <RefreshCw className={cn('h-4 w-4', isOverdue ? 'text-red-500' : hasInvoice ? 'text-green-600' : 'text-muted-foreground')} />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{bill.name}</span>
            {!bill.isActive && <span className="text-[10px] bg-muted px-1.5 rounded">INACTIVE</span>}
            {bill.autoPay && <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 rounded">AUTO</span>}
            {hasInvoice && (
              <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 rounded flex items-center gap-0.5">
                <Receipt className="h-2.5 w-2.5" /> INVOICE
              </span>
            )}
            {inBudget && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 rounded flex items-center gap-0.5">
                <BookmarkCheck className="h-2.5 w-2.5" /> BUDGET
              </span>
            )}
            {bill.entity && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
                style={{ backgroundColor: bill.entity.color ?? '#6B7280' }}>
                {bill.entity.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="capitalize">{isOneOff ? 'One-off' : bill.frequency}</span>
            {bill.vendor   && <span className="text-purple-500">{bill.vendor.name}</span>}
            {bill.account  && <span>{bill.account.name}</span>}
            {bill.member   && <span className="text-primary">{bill.member.name}</span>}
            {bill.location && <span>{bill.location.name}</span>}
            <span>Due {format(nextDue, 'd MMM yyyy')}</span>
            {bill.notes && <span className="italic truncate max-w-[120px]" title={bill.notes}>· {bill.notes}</span>}
          </div>
        </div>
        {colCats.map(c => {
          const amt = billAmountForCat(bill, c.id)
          return <span key={c.id} className="text-sm text-right text-muted-foreground">{amt > 0 ? formatCurrency(amt) : '—'}</span>
        })}
        <p className="text-sm font-semibold text-right">{formatCurrency(bill.amount)}</p>
        <div className="flex items-center gap-0.5 justify-end">
          <button onClick={() => onOpenAttachments(bill)} title={bill.attachments && bill.attachments.length > 0 ? `${bill.attachments.length} attachment${bill.attachments.length !== 1 ? 's' : ''}` : 'Attachments'}
            className={cn('relative p-1 hover:bg-accent rounded', isAttachmentOpen ? 'text-green-600' : bill.attachments && bill.attachments.length > 0 ? 'text-green-600' : 'text-muted-foreground')}>
            <Paperclip className="h-3.5 w-3.5" />
            {!isAttachmentOpen && bill.attachments && bill.attachments.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-green-500 text-white text-[9px] font-bold flex items-center justify-center leading-none px-0.5">
                {bill.attachments.length}
              </span>
            )}
          </button>
          <button onClick={() => onToggleInvoice(bill)} title={bill.invoiceReceived ? 'Remove invoice' : 'Mark invoice received'}
            className={cn('p-1 hover:bg-accent rounded', bill.invoiceReceived ? 'text-green-500' : 'text-muted-foreground')}>
            <Receipt className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onMarkPaid(bill)} title="Mark as paid" className="p-1 hover:bg-accent rounded text-green-500">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onEdit(bill)} className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => onDelete(bill.id)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* Attachment panel — renders directly below this bill row when open */}
      {isAttachmentOpen && (
        <div className="rounded-b-lg border border-t-0 border-green-500/30 bg-green-500/5 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Paperclip className="h-3.5 w-3.5 text-green-600" />
              Attachments
            </div>
            <button onClick={onCloseAttachments} className="p-1 rounded hover:bg-accent text-muted-foreground" title="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          {attachmentsLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No attachments yet — upload an invoice or reference document below.</p>
          ) : (
            <div className="space-y-1.5">
              {attachments.map(att => {
                const attUrl      = `/api/finance/bills/${bill.id}/attachments/${att.id}`
                const isPreviewing = previewAttachmentId === att.id
                const canPreview  = isImageMime(att.mimeType) || isPdfMime(att.mimeType)
                return (
                  <div key={att.id}>
                    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate font-medium">{att.title}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(att.fileSize)}</span>
                      {canPreview && (
                        <button
                          onClick={() => onTogglePreview(att.id)}
                          title={isPreviewing ? 'Hide preview' : 'View inline'}
                          className={cn('p-1 rounded hover:bg-accent transition-colors', isPreviewing ? 'text-primary' : 'text-muted-foreground')}
                        >
                          {isPreviewing ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      <a href={attUrl} target="_blank" rel="noopener noreferrer"
                        className="p-1 rounded hover:bg-accent text-primary" title="Open / download">
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <button onClick={() => onAttachmentDelete(bill.id, att.id)}
                        className="p-1 rounded hover:bg-accent text-red-500" title="Remove">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {isPreviewing && (
                      <div className="mt-1 rounded-md border border-border bg-background overflow-hidden">
                        {isImageMime(att.mimeType) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={attUrl} alt={att.title} className="max-h-[500px] w-full object-contain p-2" />
                        ) : (
                          <iframe src={attUrl} title={att.title} className="w-full border-0" style={{ height: '600px' }} />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {attachments.length < 2 && (
            <div className="flex items-center gap-3">
              <input
                ref={attachFileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="hidden"
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (file) await onAttachmentUpload(bill.id, file)
                  e.target.value = ''
                }}
              />
              <button
                onClick={() => attachFileRef.current?.click()}
                disabled={uploadingAttachment}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploadingAttachment ? 'Uploading…' : attachments.length === 0 ? 'Upload Invoice' : 'Upload Reference Doc'}
              </button>
              <p className="text-[10px] text-muted-foreground">PDF, JPG, PNG, DOC · Max 2 files</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
