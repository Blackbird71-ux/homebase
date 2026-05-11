'use client'

import { useEffect, useState, useRef } from 'react'
import {
  Plus, Pencil, Trash2, Bell, Settings2, CheckCircle2,
  RefreshCw, Layers, Briefcase, Paperclip, Upload, X,
  FileText, Download, Building2, BookmarkCheck, Receipt,
  Eye, EyeOff, ReceiptText,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, isPast, addMonths, addWeeks, addDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { sortedCategoryList } from '@/lib/finance-categories'
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
interface IncomeAttachment {
  id: string; incomeId: string; title: string; fileName: string
  fileSize: number; mimeType: string; createdAt: string
}

export interface IncomeEntry {
  id: string; name: string; amount: number; frequency: string
  incomeType: string
  nextExpectedDate: string; endDate: string | null; isActive: boolean
  received: boolean; receivedDate: string | null
  autoPay: boolean; emailReminder: boolean; reminderDays: number
  dayOfMonth: number | null; monthOfYear: number | null
  recurrenceInterval: string | null
  invoiceReceived: boolean; invoiceReceivedDate: string | null
  isTaxTracked: boolean
  taxRate: number | null
  taxClassification: string | null
  notes: string | null; memberId: string | null
  account: { id: string; name: string } | null
  category: { id: string; name: string; color: string | null } | null
  vendor: { id: string; name: string } | null
  member: Member | null
  location: Location | null
  entity: Entity | null
  parentIncomeId: string | null
  attachments?: IncomeAttachment[]
}

function toMonthlyAmount(amount: number, frequency: string): number {
  if (frequency === 'weekly')      return amount * 52 / 12
  if (frequency === 'fortnightly') return amount * 26 / 12
  if (frequency === 'quarterly')   return amount / 3
  if (frequency === 'halfyearly')  return amount / 6
  if (frequency === 'yearly')      return amount / 12
  return amount
}

export default function IncomePage() {
  const [entries, setEntries]         = useState<IncomeEntry[]>([])
  const [accounts, setAccounts]       = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories]   = useState<{ id: string; name: string; type: string; parentId: string | null }[]>([])
  const [members, setMembers]         = useState<Member[]>([])
  const [locations, setLocations]     = useState<Location[]>([])
  const [vendors, setVendors]         = useState<Vendor[]>([])
  const [entities, setEntities]       = useState<Entity[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [editing, setEditing]         = useState<IncomeEntry | null>(null)
  const [errors, setErrors]           = useState<Record<string, string>>({})
  const [receivedConfirm, setReceivedConfirm] = useState<{ entry: IncomeEntry } | null>(null)
  const [receivedConfirmDate, setReceivedConfirmDate] = useState<string>('')
  const [receivedConfirmAccountId, setReceivedConfirmAccountId] = useState<string>('')
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

  const [attachmentIncomeId, setAttachmentIncomeId]     = useState<string | null>(null)
  const [attachments, setAttachments]                   = useState<IncomeAttachment[]>([])
  const [attachmentsLoading, setAttachmentsLoading]     = useState(false)
  const [uploadingAttachment, setUploadingAttachment]   = useState(false)
  const [previewAttachmentId, setPreviewAttachmentId]   = useState<string | null>(null)
  const attachFileRef = useRef<HTMLInputElement>(null)

  const emptyForm = {
    name: '', amount: 0, frequency: 'monthly', incomeType: 'recurring',
    accountId: '', categoryId: '', vendorId: '',
    dayOfMonth: '', monthOfYear: '',
    nextExpectedDate: new Date().toISOString().split('T')[0],
    endDate: '', autoPay: false, emailReminder: false, reminderDays: 3,
    notes: '', memberId: '', locationId: '',
    entityId: '',
    invoiceReceived: false, invoiceReceivedDate: '',
    recurrenceInterval: '',
    isTaxTracked: false,
    taxRate: '',
    taxClassification: '',
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
    const [aRes, cRes, mRes, lRes, vRes, eRes] = await Promise.all([
      fetch('/api/finance/accounts'),
      fetch('/api/finance/categories'),
      fetch('/api/finance/members'),
      fetch('/api/finance/locations'),
      fetch('/api/finance/contacts'),
      fetch('/api/finance/entities'),
    ])
    if (aRes.ok) setAccounts(await aRes.json())
    if (cRes.ok) setCategories(await cRes.json())
    if (mRes.ok) setMembers(await mRes.json())
    if (lRes.ok) setLocations(await lRes.json())
    if (vRes.ok) setVendors(await vRes.json())
    if (eRes.ok) setEntities(await eRes.json())
  }

  useEffect(() => { loadRefs() }, [])
  useEffect(() => { if (members.length > 0 || accounts.length > 0) load() }, [members, accounts])

  async function openAttachments(entry: IncomeEntry) {
    setAttachmentIncomeId(entry.id)
    setAttachmentsLoading(true)
    try {
      const res = await fetch(`/api/finance/income/${entry.id}/attachments`)
      if (res.ok) setAttachments(await res.json())
    } finally { setAttachmentsLoading(false) }
  }

  function closeAttachments() { setAttachmentIncomeId(null); setAttachments([]); setPreviewAttachmentId(null) }
  function togglePreview(attId: string) { setPreviewAttachmentId(prev => prev === attId ? null : attId) }
  function isImageMime(mime: string) { return mime.startsWith('image/') }
  function isPdfMime(mime: string)   { return mime === 'application/pdf' }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function handleAttachmentUpload(incomeId: string, file: File) {
    setUploadingAttachment(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', file.name.replace(/\.[^/.]+$/, ''))
      const res = await fetch(`/api/finance/income/${incomeId}/attachments`, { method: 'POST', body: fd })
      if (res.ok) { const a = await res.json(); setAttachments(prev => [...prev, a]); toast.success('Attachment uploaded') }
      else toast.error('Failed to upload attachment')
    } finally { setUploadingAttachment(false) }
  }

  async function handleAttachmentDelete(incomeId: string, attachmentId: string) {
    if (!confirm('Remove this attachment?')) return
    const res = await fetch(`/api/finance/income/${incomeId}/attachments/${attachmentId}`, { method: 'DELETE' })
    if (res.ok) { setAttachments(prev => prev.filter(a => a.id !== attachmentId)); toast.success('Attachment removed') }
    else toast.error('Failed to remove attachment')
  }

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

  function openNew() { setEditing(null); setForm(emptyForm); setErrors({}); setShowForm(true) }

  function openEdit(e: IncomeEntry) {
    setEditing(e)
    setForm({
      name: e.name, amount: e.amount, frequency: e.frequency,
      incomeType: e.incomeType ?? 'recurring',
      accountId: e.account?.id ?? '', categoryId: e.category?.id ?? '',
      vendorId: e.vendor?.id ?? '',
      dayOfMonth: e.dayOfMonth?.toString() ?? '',
      monthOfYear: e.monthOfYear?.toString() ?? '',
      nextExpectedDate: new Date(e.nextExpectedDate).toISOString().split('T')[0],
      endDate: e.endDate ? new Date(e.endDate).toISOString().split('T')[0] : '',
      autoPay: e.autoPay ?? false,
      emailReminder: e.emailReminder ?? false,
      reminderDays: e.reminderDays ?? 3,
      notes: e.notes ?? '', memberId: e.memberId ?? '',
      locationId: e.location?.id ?? '',
      entityId: e.entity?.id ?? '',
      invoiceReceived: e.invoiceReceived ?? false,
      invoiceReceivedDate: e.invoiceReceivedDate
        ? new Date(e.invoiceReceivedDate).toISOString().split('T')[0] : '',
      recurrenceInterval: e.recurrenceInterval ?? '',
      isTaxTracked: e.isTaxTracked ?? false,
      taxRate: e.taxRate != null ? e.taxRate.toString() : '',
      taxClassification: e.taxClassification ?? '',
    })
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditing(null); setErrors({}) }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (!form.amount || form.amount <= 0) errs.amount = 'Amount must be greater than 0'
    if (!form.nextExpectedDate) errs.nextExpectedDate = 'Expected date is required'
    // taxClassification is intentionally optional — warn via amber UI but do not block save
    return errs
  }

  function handleVendorChange(vendorId: string) {
    const vendor = vendors.find(v => v.id === vendorId)
    const update: any = { vendorId }
    if (vendor?.defaultCategory && !form.categoryId) update.categoryId = vendor.defaultCategory.id
    setForm(p => ({ ...p, ...update }))
  }

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
      incomeType: form.incomeType || 'recurring',
      recurrenceInterval: form.recurrenceInterval || null,
      invoiceReceived: form.invoiceReceived,
      invoiceReceivedDate: form.invoiceReceived && form.invoiceReceivedDate ? form.invoiceReceivedDate : null,
      isTaxTracked: form.isTaxTracked,
      taxRate: form.taxRate !== '' ? parseFloat(form.taxRate) : null,
      taxClassification: form.taxClassification || null,
    }
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
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
    const today = new Date().toISOString().split('T')[0]
    setReceivedConfirmDate(today)
    setReceivedConfirmAccountId(entry.account?.id ?? '')
    setReceivedConfirm({ entry })
  }

  async function confirmMarkReceived() {
    if (!receivedConfirm) return
    const { entry } = receivedConfirm
    const res = await fetch('/api/finance/income', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: entry.id,
        received: true,
        receivedDate: receivedConfirmDate,
        receiveToAccountId: receivedConfirmAccountId || null,
      }),
    })
    if (res.ok) { toast.success('Income marked as received'); setReceivedConfirm(null); load() }
    else toast.error('Failed to mark as received')
  }

  async function handleToggleInvoice(entry: IncomeEntry) {
    const newVal = !entry.invoiceReceived
    const res = await fetch('/api/finance/income', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, invoiceReceived: newVal }),
    })
    if (res.ok) { toast.success(newVal ? 'Remittance marked received' : 'Remittance unmarked'); load() }
    else toast.error('Failed to update remittance status')
  }

  function getNextExpected(entry: IncomeEntry): Date {
    const due = new Date(entry.nextExpectedDate)
    if (isPast(due)) {
      if (entry.frequency === 'monthly')      return addMonths(due, 1)
      if (entry.frequency === 'fortnightly')  return addWeeks(due, 2)
      if (entry.frequency === 'weekly')       return addWeeks(due, 1)
      if (entry.frequency === 'quarterly')    return addMonths(due, 3)
      if (entry.frequency === 'halfyearly')   return addMonths(due, 6)
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

  const rootCategories = categories.filter(c => !c.parentId && c.type === 'income')
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const rangeEnd = dateRange === '14' ? addDays(todayStart, 14)
    : dateRange === '30' ? addDays(todayStart, 30)
    : dateRange === '12months' ? addMonths(todayStart, 12)
    : addMonths(todayStart, 3)

  function toLocalMidnight(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }

  const activeEntries = entries.filter(e => e.isActive && !e.received)

  function isTrulyOverdue(e: IncomeEntry): boolean {
    const due = toLocalMidnight(new Date(e.nextExpectedDate))
    if (due >= todayStart) return false
    if (e.incomeType === 'one-off') return false
    if (e.parentIncomeId) {
      const graceMs = cycleMs(e.frequency)
      return (todayStart.getTime() - due.getTime()) > graceMs
    }
    return true
  }

  function cycleMs(frequency: string): number {
    const day = 86_400_000
    if (frequency === 'weekly')      return 7  * day
    if (frequency === 'fortnightly') return 14 * day
    if (frequency === 'monthly')     return 31 * day
    if (frequency === 'quarterly')   return 92 * day
    if (frequency === 'halfyearly')  return 183 * day
    if (frequency === 'yearly')      return 366 * day
    return 31 * day
  }

  const overdue       = activeEntries.filter(isTrulyOverdue)
  const overdueOneOff = activeEntries.filter(e => e.incomeType === 'one-off' && toLocalMidnight(new Date(e.nextExpectedDate)) < todayStart)
  const upcoming      = activeEntries.filter(e => {
    const due = toLocalMidnight(new Date(e.nextExpectedDate))
    return due >= todayStart && due <= rangeEnd
  })
  const visibleEntries = [...overdue, ...upcoming]
  const colCats        = rootCategories.filter(c => selectedCatIds.includes(c.id))
  const grandTotal     = visibleEntries.reduce((s, e) => s + e.amount, 0)
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
                  <button onClick={() => handleMarkReceived(e)} title="Mark as received" className="p-1 hover:bg-amber-500/10 rounded text-green-500"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => openEdit(e)} title="Edit" className="p-1 hover:bg-amber-500/10 rounded text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDelete(e.id)} title="Delete" className="p-1 hover:bg-amber-500/10 rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                  <button onClick={() => handleMarkReceived(e)} title="Mark as received" className="p-1 hover:bg-orange-500/10 rounded text-green-500"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => openEdit(e)} title="Edit" className="p-1 hover:bg-orange-500/10 rounded text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDelete(e.id)} title="Delete" className="p-1 hover:bg-orange-500/10 rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={open => { if (!open) { closeForm(); setErrors({}) } }}>
        <DialogContent className="sm:max-w-2xl w-full max-h-[90vh] overflow-y-auto" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Income' : 'New Income'}</DialogTitle>
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
                className={cn('w-full rounded-md border bg-background px-3 py-1.5 text-sm', errors.name ? 'border-red-500' : 'border-input')} />
              {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Amount *</label>
              <input type="number" step="0.01" value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                className={cn('w-full rounded-md border bg-background px-3 py-1.5 text-sm', errors.amount ? 'border-red-500' : 'border-input')} />
              {errors.amount && <p className="text-xs text-red-500 mt-0.5">{errors.amount}</p>}
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
                  <option value="halfyearly">6 Monthly / Half-Yearly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Payer / Source</label>
              <div className="flex gap-1">
                <select value={form.vendorId} onChange={e => handleVendorChange(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="">No payer</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <Link href="/finance/contacts"
                  className="shrink-0 inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-1.5 text-muted-foreground hover:text-foreground"
                  title="Manage contacts">
                  <Building2 className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <select value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">No category</option>
                {sortedCategoryList(categories.filter(c => c.type === 'income')).map(c => (
                  <option key={c.id} value={c.id}>{c.parentId ? `\u2014 ${c.name}` : c.name}</option>
                ))}
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
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                placeholder="e.g. 15" />
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
              <label className="text-xs text-muted-foreground">{form.incomeType === 'one-off' ? 'Expected Date *' : 'Next Expected Date *'}</label>
              <input type="date" value={form.nextExpectedDate} onChange={e => setForm(p => ({ ...p, nextExpectedDate: e.target.value }))}
                className={cn('w-full rounded-md border bg-background px-3 py-1.5 text-sm', errors.nextExpectedDate ? 'border-red-500' : 'border-input')} />
              {errors.nextExpectedDate && <p className="text-xs text-red-500 mt-0.5">{errors.nextExpectedDate}</p>}
            </div>
            {form.incomeType === 'recurring' && (
              <div>
                <label className="text-xs text-muted-foreground">End Date (optional)</label>
                <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Assigned To (person)</label>
              <select value={form.memberId} onChange={e => setForm(p => ({ ...p, memberId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">Shared (household)</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> Entity / Fund
              </label>
              <select value={form.entityId} onChange={e => setForm(p => ({ ...p, entityId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">Select entity…</option>
                {entities.map(e => <option key={e.id} value={e.id}>{e.name}{e.isDefault ? ' (default)' : ''}</option>)}
              </select>
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
            {form.incomeType === 'recurring' && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.autoPay} onChange={e => setForm(p => ({ ...p, autoPay: e.target.checked }))} className="rounded border-input" />
                Direct deposit
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
              <Receipt className="h-3.5 w-3.5 text-green-500" /> Remittance received
            </label>
            {form.invoiceReceived && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Remittance date</label>
                <input type="date" value={form.invoiceReceivedDate}
                  onChange={e => setForm(p => ({ ...p, invoiceReceivedDate: e.target.value }))}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm" />
              </div>
            )}
          </div>

          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ReceiptText className="h-4 w-4 text-orange-500" />
                ATO / Tax Tracking
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isTaxTracked}
                  onChange={e => setForm(p => ({ ...p, isTaxTracked: e.target.checked }))}
                  className="rounded border-input accent-orange-500" />
                Track for tax
              </label>
            </div>
            {form.isTaxTracked && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">Estimated tax rate (%)</label>
                    <div className="flex items-center gap-2 mt-0.5">
                      <input type="number" step="0.1" min="0" max="100" value={form.taxRate}
                        onChange={e => setForm(p => ({ ...p, taxRate: e.target.value }))}
                        placeholder="e.g. 30"
                        className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground max-w-[200px]">
                    This rate is used in the P&L report to estimate your tax liability.
                  </p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground flex items-center gap-1"><Receipt className="h-3 w-3 text-amber-500" /> Tax Classification</label>
                  <select value={form.taxClassification} onChange={e => setForm(p => ({ ...p, taxClassification: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                    <option value="">Not classified</option>
                    <option value="taxable_income">Taxable Income</option>
                    <option value="exempt_income">Exempt Income</option>
                  </select>
                </div>
                {!form.memberId && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <ReceiptText className="h-3 w-3 shrink-0" />
                    Tax-tracked income should be assigned to a person (member) for accurate tax reporting.
                  </p>
                )}
              </div>
            )}
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

      <Dialog open={!!receivedConfirm} onOpenChange={open => { if (!open) setReceivedConfirm(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle>Confirm income received</DialogTitle>
          </DialogHeader>
          {receivedConfirm && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                Mark <span className="font-medium text-foreground">{receivedConfirm.entry.name}</span> as
                received. What date did the money arrive in your account?
              </p>
              <div>
                <label className="text-xs text-muted-foreground">Date received</label>
                <input type="date" value={receivedConfirmDate} onChange={e => setReceivedConfirmDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Receive into account</label>
                <select value={receivedConfirmAccountId} onChange={e => setReceivedConfirmAccountId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1">
                  <option value="">No account (unlinked)</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {!receivedConfirmAccountId && (
                  <p className="text-xs text-amber-500 mt-1">⚠ No account selected — bank balance won&apos;t update</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                An income transaction of{' '}
                <span className="font-medium text-foreground">
                  {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(receivedConfirm.entry.amount)}
                </span>{' '}
                will be recorded on this date.
              </p>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setReceivedConfirm(null)} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={confirmMarkReceived} className="rounded-md bg-green-600 text-white px-4 py-1.5 text-sm font-medium">
              Mark as received
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              onToggleInvoice={handleToggleInvoice} onOpenAttachments={openAttachments}
              attachmentIncomeId={attachmentIncomeId}
              attachments={attachments} attachmentsLoading={attachmentsLoading}
              uploadingAttachment={uploadingAttachment} attachFileRef={attachFileRef}
              previewAttachmentId={previewAttachmentId}
              onCloseAttachments={closeAttachments} onTogglePreview={togglePreview}
              onAttachmentUpload={handleAttachmentUpload} onAttachmentDelete={handleAttachmentDelete}
              isImageMime={isImageMime} isPdfMime={isPdfMime} formatFileSize={formatFileSize}
              formatCurrency={formatCurrency} />
          ))}
          {upcoming.map(e => (
            <IncomeRow key={e.id} entry={e} nextExpected={getNextExpected(e)} isOverdue={false}
              colCats={colCats} entryAmountForCat={entryAmountForCat} gridTemplate={gridTemplate}
              onEdit={openEdit} onDelete={handleDelete} onMarkReceived={handleMarkReceived}
              onToggleInvoice={handleToggleInvoice} onOpenAttachments={openAttachments}
              attachmentIncomeId={attachmentIncomeId}
              attachments={attachments} attachmentsLoading={attachmentsLoading}
              uploadingAttachment={uploadingAttachment} attachFileRef={attachFileRef}
              previewAttachmentId={previewAttachmentId}
              onCloseAttachments={closeAttachments} onTogglePreview={togglePreview}
              onAttachmentUpload={handleAttachmentUpload} onAttachmentDelete={handleAttachmentDelete}
              isImageMime={isImageMime} isPdfMime={isPdfMime} formatFileSize={formatFileSize}
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
  onEdit, onDelete, onMarkReceived, onToggleInvoice, onOpenAttachments,
  attachmentIncomeId, attachments, attachmentsLoading, uploadingAttachment, attachFileRef,
  previewAttachmentId, onCloseAttachments, onTogglePreview,
  onAttachmentUpload, onAttachmentDelete, isImageMime, isPdfMime, formatFileSize,
  formatCurrency,
}: {
  entry: IncomeEntry; nextExpected: Date; isOverdue: boolean
  colCats: { id: string; name: string }[]
  entryAmountForCat: (entry: IncomeEntry, catId: string) => number
  gridTemplate: string
  onEdit: (e: IncomeEntry) => void; onDelete: (id: string) => void
  onMarkReceived: (e: IncomeEntry) => void
  onToggleInvoice: (e: IncomeEntry) => void
  onOpenAttachments: (e: IncomeEntry) => void
  attachmentIncomeId: string | null
  attachments: IncomeAttachment[]; attachmentsLoading: boolean
  uploadingAttachment: boolean; attachFileRef: React.RefObject<HTMLInputElement | null>
  previewAttachmentId: string | null
  onCloseAttachments: () => void; onTogglePreview: (id: string) => void
  onAttachmentUpload: (incomeId: string, file: File) => Promise<void>
  onAttachmentDelete: (incomeId: string, attachmentId: string) => Promise<void>
  isImageMime: (mime: string) => boolean; isPdfMime: (mime: string) => boolean
  formatFileSize: (bytes: number) => string
  formatCurrency: (n: number) => string
}) {
  const isOneOff         = entry.incomeType === 'one-off'
  const hasRemittance    = entry.invoiceReceived
  const isAttachmentOpen = attachmentIncomeId === entry.id
  const rowClass = cn(
    'grid gap-3 rounded-lg border p-3 cursor-default select-none transition-colors',
    isOverdue       ? 'border-amber-500/30 bg-amber-500/5'
    : hasRemittance ? 'border-green-500/30 bg-green-500/5'
    :                 'border-border hover:bg-accent/50',
    isAttachmentOpen && 'ring-1 ring-green-500/40 rounded-b-none',
  )
  return (
    <div>
      <div className={rowClass} style={{ gridTemplateColumns: gridTemplate, alignItems: 'center' }}
        onDoubleClick={() => onEdit(entry)}>
        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center',
          isOverdue ? 'bg-amber-500/10' : hasRemittance ? 'bg-green-500/10' : isOneOff ? 'bg-orange-500/10' : 'bg-muted')}>
          {isOneOff
            ? <Layers className={cn('h-4 w-4', isOverdue ? 'text-amber-500' : 'text-orange-500')} />
            : <RefreshCw className={cn('h-4 w-4', isOverdue ? 'text-amber-500' : hasRemittance ? 'text-green-600' : 'text-muted-foreground')} />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{entry.name}</span>
            {!entry.isActive && <span className="text-[10px] bg-muted px-1.5 rounded">INACTIVE</span>}
            {entry.autoPay && <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 rounded">DIRECT</span>}
            {hasRemittance && (
              <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 rounded flex items-center gap-0.5">
                <Receipt className="h-2.5 w-2.5" /> REMITTANCE
              </span>
            )}
            {entry.isTaxTracked && (
              <span className="text-[10px] bg-orange-500/10 text-orange-600 px-1.5 rounded flex items-center gap-0.5">
                <ReceiptText className="h-2.5 w-2.5" /> TAX TRACKED
                {entry.taxRate != null && <span className="font-medium">{entry.taxRate}%</span>}
              </span>
            )}
            {entry.entity && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
                style={{ backgroundColor: entry.entity.color ?? '#6B7280' }}>
                {entry.entity.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="capitalize">{isOneOff ? 'One-off' : entry.frequency}</span>
            {entry.vendor   && <span className="text-purple-500">{entry.vendor.name}</span>}
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
          <button onClick={() => onOpenAttachments(entry)}
            title={entry.attachments && entry.attachments.length > 0 ? `${entry.attachments.length} attachment${entry.attachments.length !== 1 ? 's' : ''}` : 'Attachments'}
            className={cn('relative p-1 hover:bg-accent rounded', isAttachmentOpen ? 'text-green-600' : entry.attachments && entry.attachments.length > 0 ? 'text-green-600' : 'text-muted-foreground')}>
            <Paperclip className="h-3.5 w-3.5" />
            {!isAttachmentOpen && entry.attachments && entry.attachments.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-green-500 text-white text-[9px] font-bold flex items-center justify-center leading-none px-0.5">
                {entry.attachments.length}
              </span>
            )}
          </button>
          <button onClick={() => onToggleInvoice(entry)} title={entry.invoiceReceived ? 'Remove remittance' : 'Mark remittance received'}
            className={cn('p-1 hover:bg-accent rounded', entry.invoiceReceived ? 'text-green-500' : 'text-muted-foreground')}>
            <Receipt className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onMarkReceived(entry)} title="Mark as received" className="p-1 hover:bg-accent rounded text-green-500">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onEdit(entry)} className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => onDelete(entry.id)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

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
            <p className="text-xs text-muted-foreground">No attachments yet — upload a payslip or remittance advice below.</p>
          ) : (
            <div className="space-y-1.5">
              {attachments.map(att => {
                const attUrl       = `/api/finance/income/${entry.id}/attachments/${att.id}`
                const isPreviewing = previewAttachmentId === att.id
                const canPreview   = isImageMime(att.mimeType) || isPdfMime(att.mimeType)
                return (
                  <div key={att.id}>
                    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate font-medium">{att.title}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(att.fileSize)}</span>
                      {canPreview && (
                        <button onClick={() => onTogglePreview(att.id)}
                          title={isPreviewing ? 'Hide preview' : 'View inline'}
                          className={cn('p-1 rounded hover:bg-accent transition-colors', isPreviewing ? 'text-primary' : 'text-muted-foreground')}>
                          {isPreviewing ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      <a href={attUrl} target="_blank" rel="noopener noreferrer"
                        className="p-1 rounded hover:bg-accent text-primary" title="Open / download">
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <button onClick={() => onAttachmentDelete(entry.id, att.id)}
                        className="p-1 rounded hover:bg-accent text-red-500" title="Remove">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {isPreviewing && (
                      <div className="mt-1 rounded-md border border-border bg-background overflow-hidden">
                        {isImageMime(att.mimeType)
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={attUrl} alt={att.title} className="max-h-[500px] w-full object-contain p-2" />
                          : <iframe src={attUrl} title={att.title} className="w-full border-0" style={{ height: '600px' }} />}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {attachments.length < 2 && (
            <div className="flex items-center gap-3">
              <input ref={attachFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden"
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (file) await onAttachmentUpload(entry.id, file)
                  e.target.value = ''
                }} />
              <button onClick={() => attachFileRef.current?.click()} disabled={uploadingAttachment}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
                <Upload className="h-3.5 w-3.5" />
                {uploadingAttachment ? 'Uploading…' : attachments.length === 0 ? 'Upload Payslip' : 'Upload Reference Doc'}
              </button>
              <p className="text-[10px] text-muted-foreground">PDF, JPG, PNG, DOC · Max 2 files</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
