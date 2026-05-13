'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Plus, Pencil, Trash2, Bell, Settings2, CheckCircle2, Receipt,
  RefreshCw, Layers, Paperclip, X, Building2,
  BookmarkCheck, Briefcase, Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, isPast, addMonths, addWeeks, addDays } from 'date-fns'
import { cn, todayAU } from '@/lib/utils'
import { sortedCategoryList } from '@/lib/finance-categories'
import { toMonthlyAmount, formatCurrency } from '@/lib/financeShared'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { JournalLinesEditor, type JournalFormLine, type GLAccount } from '@/components/finance/JournalLinesEditor'
import { useAttachmentManager } from '@/hooks/finance/useAttachmentManager'
import { AttachmentSection } from '@/components/finance/AttachmentSection'

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
  journalEntryId: string | null
  isGlPosted: boolean   // Derived: true only when linked GL journal isPosted=true
  account: { id: string; name: string } | null
  category: { id: string; name: string; color: string | null } | null
  vendor: { id: string; name: string } | null
  member: Member | null
  location: Location | null
  entity: Entity | null
  paid: boolean; paidDate: string | null
  invoiceReceived: boolean; invoiceReceivedDate: string | null
  billType: string; recurrenceInterval: string | null; parentBillId: string | null
  taxClassification: string | null
  attachments?: BillAttachment[]
  payments?: { amount: number }[]
}

type QuickFilter = { type: 'member' | 'vendor' | 'location' | 'entity'; id: string; label: string }

export default function BillsPage() {
  const [bills, setBills]           = useState<Bill[]>([])
  const [accounts, setAccounts]     = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; type: string; parentId: string | null }[]>([])
  const [glAccounts, setGLAccounts] = useState<GLAccount[]>([])
  const [members, setMembers]       = useState<Member[]>([])
  const [locations, setLocations]   = useState<Location[]>([])
  const [vendors, setVendors]       = useState<Vendor[]>([])
  const [entities, setEntities]     = useState<Entity[]>([])
  const [budgetBillIds, setBudgetBillIds] = useState<Set<string>>(new Set())
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState<Bill | null>(null)
  const [journalLines, setJournalLines] = useState<JournalFormLine[]>([])
  const [journalErrors, setJournalErrors] = useState<Record<string, string>>({})
  const [paidConfirm, setPaidConfirm] = useState<{ bill: Bill } | null>(null)
  const [paidConfirmDate, setPaidConfirmDate] = useState<string>('')
  const [paidConfirmGlAccountId, setPaidConfirmGlAccountId] = useState<string>('')
  const [paidConfirmAmount, setPaidConfirmAmount] = useState<number>(0)
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
  const [paymentHistoryBillId, setPaymentHistoryBillId] = useState<string | null>(null)
  const [paymentHistory, setPaymentHistory] = useState<any[]>([])
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false)
  const [quickFilter, setQuickFilter] = useState<QuickFilter | null>(null)
  const att = useAttachmentManager('/api/finance/bills')
  const prevBillAmountRef = useRef<number>(0)

  const emptyForm = {
    name: '', amount: 0, frequency: 'monthly', accountId: '', categoryId: '',
    dayOfMonth: '', monthOfYear: '', nextDueDate: todayAU(),
    endDate: '', autoPay: false, emailReminder: false, reminderDays: 3,
    notes: '', memberId: '', locationId: '', vendorId: '',
    entityId: '',
    billType: 'recurring', recurrenceInterval: '',
    invoiceReceived: false, invoiceReceivedDate: '',
    taxClassification: '',
    addToBudget: false,
  }
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (!form.amount || form.amount <= 0) errs.amount = 'Amount must be greater than 0'
    if (!form.nextDueDate) errs.nextDueDate = 'Due date is required'
    // taxClassification is intentionally optional — most bills don't need ATO classification
    return errs
  }

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
    const [aRes, cRes, glRes, mRes, lRes, vRes, bRes, eRes] = await Promise.all([
      fetch('/api/finance/accounts'),
      fetch('/api/finance/categories'),           // full list for category/P&L selector
      fetch('/api/finance/categories?forPicker=true'), // filtered for GL journal line picker
      fetch('/api/finance/members'),
      fetch('/api/finance/locations'),
      fetch('/api/finance/contacts'),
      fetch('/api/finance/budget'),
      fetch('/api/finance/entities'),
    ])
    if (aRes.ok) setAccounts(await aRes.json())
    if (cRes.ok) {
      const cats = await cRes.json()
      setCategories(cats)
    }
    if (glRes.ok) {
      const glCats = await glRes.json()
      // GL accounts for journal line picker = user-created categories only (no system seeds)
      setGLAccounts(glCats.filter((c: any) => c.type !== 'transfer'))
    }
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

  // ── Pre-seed journal lines for bills ───────────────────────────────────────
  // DR: blank expense line (user selects the account) / CR: Accounts Payable
  // Amount pre-filled when editing an existing bill.
  function defaultBillLines(amount?: number): JournalFormLine[] {
    const amtStr = amount && amount > 0 ? amount.toFixed(2) : ''
    const ap = glAccounts.find(a => a.name === 'Accounts Payable' && a.type === 'liability')
    return [
      { glAccountId: '',      side: 'debit',  amount: amtStr, description: '' },  // user picks expense GL
      { glAccountId: ap?.id ?? '', side: 'credit', amount: amtStr, description: '' },
    ]
  }

  async function loadExistingBillJournalLines(journalEntryId: string): Promise<JournalFormLine[]> {
    try {
      const res = await fetch(`/api/finance/journals/${journalEntryId}`)
      if (!res.ok) return defaultBillLines()
      const entry = await res.json()
      if (entry?.lines?.length >= 2) {
        return entry.lines.map((l: any) => ({
          glAccountId: l.glAccountId,
          side: l.side,
          amount: l.amount.toFixed(2),
          description: l.description ?? '',
        }))
      }
    } catch { /* fall through */ }
    return defaultBillLines()
  }

  // Auto-fill journal line amounts when bill amount changes.
  // Updates lines that are blank, zero, or still equal to the previously auto-filled value
  // so typing "2" → "20" → "200" keeps journal lines in sync.
  useEffect(() => {
    if (!showForm || form.amount <= 0) return
    const prev = prevBillAmountRef.current
    const prevStr = prev > 0 ? prev.toFixed(2) : ''
    setJournalLines(lines => lines.map(l =>
      l.amount === '' || l.amount === '0.00' || l.amount === prevStr
        ? { ...l, amount: (form.amount as number).toFixed(2) }
        : l
    ))
    prevBillAmountRef.current = form.amount as number
  }, [form.amount]) // eslint-disable-line react-hooks/exhaustive-deps

  async function syncBudgetRule(bill: Bill, addToBudget: boolean) {
    try {
      if (addToBudget) {
        const res = await fetch('/api/finance/budget', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            upsertFromBill: true, billId: bill.id, name: bill.name,
            amount: toMonthlyAmount(bill.amount, bill.frequency),
            categoryId: bill.category?.id ?? null, period: 'monthly',
            entityId: bill.entity?.id ?? null,
          }),
        })
        if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to sync budget rule'); return }
        setBudgetBillIds(prev => new Set([...prev, bill.id]))
      } else {
        const res = await fetch('/api/finance/budget', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ removeFromBill: true, billId: bill.id }),
        })
        if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to remove from budget'); return }
        setBudgetBillIds(prev => { const s = new Set(prev); s.delete(bill.id); return s })
      }
    } catch { toast.error('Network error updating budget rule') }
  }

  function closePaymentHistory() { setPaymentHistoryBillId(null); setPaymentHistory([]) }

  async function openPaymentHistory(bill: Bill) {
    if (paymentHistoryBillId === bill.id) { closePaymentHistory(); return }
    setPaymentHistoryBillId(bill.id); setPaymentHistoryLoading(true)
    try {
      const res = await fetch(`/api/finance/bills/${bill.id}/payments`)
      if (res.ok) setPaymentHistory(await res.json())
      else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to load payment history') }
    } finally { setPaymentHistoryLoading(false) }
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

  function openNew() { prevBillAmountRef.current = 0; setEditing(null); setErrors({}); setJournalLines(defaultBillLines()); setJournalErrors({}); setForm(emptyForm); setShowForm(true) }

  function openEdit(b: Bill) {
    setEditing(b)
    setErrors({})
    setJournalErrors({})
    // Pre-seed journal lines: load existing JE lines if present, else defaults
    if (b.journalEntryId) {
      setJournalLines(defaultBillLines(b.amount))  // show defaults immediately while loading
      loadExistingBillJournalLines(b.journalEntryId).then(setJournalLines)
    } else {
      setJournalLines(defaultBillLines(b.amount))
    }
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
      entityId: b.entity?.id ?? entities.find(e => e.isDefault)?.id ?? '',
      billType: b.billType ?? 'recurring', recurrenceInterval: b.recurrenceInterval ?? '',
      invoiceReceived: b.invoiceReceived ?? false,
      invoiceReceivedDate: b.invoiceReceivedDate ? new Date(b.invoiceReceivedDate).toISOString().split('T')[0] : '',
      taxClassification: b.taxClassification ?? '',
      addToBudget: budgetBillIds.has(b.id),
    })
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditing(null); setJournalLines([]); setJournalErrors({}) }

  function getFormPayload() {
    return {
      ...form, amount: form.amount || 0,
      accountId: form.accountId || null, categoryId: form.categoryId || null,
      vendorId: form.vendorId || null, entityId: form.entityId || null,
      dayOfMonth: form.dayOfMonth || null, monthOfYear: form.monthOfYear || null,
      endDate: form.endDate || null, notes: form.notes || null,
      memberId: form.memberId || null, locationId: form.locationId || null,
      billType: form.billType || 'recurring', recurrenceInterval: form.recurrenceInterval || null,
      invoiceReceived: form.invoiceReceived,
      invoiceReceivedDate: form.invoiceReceived && form.invoiceReceivedDate ? form.invoiceReceivedDate : null,
      taxClassification: form.taxClassification || null,
    }
  }

  async function handleSave() {
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      toast.error(Object.values(errs).join(' · '))
      return
    }
    try {
      const { addToBudget, ...payload } = getFormPayload() as any
      const validLines = journalLines.filter(l => l.glAccountId && parseFloat(l.amount) > 0)
      const body = editing
        ? { id: editing.id, ...payload, ...(validLines.length >= 2 ? { journalLines: validLines.map(l => ({ glAccountId: l.glAccountId, side: l.side, amount: parseFloat(l.amount), description: l.description || null })) } : {}) }
        : { ...payload, ...(validLines.length >= 2 ? { journalLines: validLines.map(l => ({ glAccountId: l.glAccountId, side: l.side, amount: parseFloat(l.amount), description: l.description || null })) } : {}) }
      const res = await fetch('/api/finance/bills', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? `Failed (${res.status})`)
        return
      }
      const savedBill: Bill = await res.json()
      toast.success(editing ? 'Bill updated' : 'Bill created')
      await syncBudgetRule(savedBill, form.addToBudget)
      closeForm(); load()
    } catch (err) {
      console.error('[handleSave]', err)
      toast.error('An unexpected error occurred. Check the browser console for details.')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this bill?')) return
    await fetch('/api/finance/budget', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeFromBill: true, billId: id }),
    })
    const res = await fetch(`/api/finance/bills?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Bill deleted'); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to delete') }
  }

  async function handleMarkPaid(bill: Bill) {
    setPaidConfirmDate(todayAU())
    setPaidConfirmGlAccountId('')
    setPaidConfirmAmount(bill.amount)
    setPaidConfirm({ bill })
  }

  async function confirmMarkPaid() {
    if (!paidConfirm) return
    const payAmount = Math.min(paidConfirmAmount, paidConfirm.bill.amount)
    if (payAmount <= 0) { toast.error('Payment amount must be greater than 0'); return }
    const res = await fetch('/api/finance/bills', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: paidConfirm.bill.id,
        paid: true,
        paidDate: paidConfirmDate,
        payFromGlAccountId: paidConfirmGlAccountId || null,
        paymentAmount: payAmount < paidConfirm.bill.amount ? payAmount : undefined,
      }),
    })
    if (res.ok) { toast.success('Bill marked as paid'); setPaidConfirm(null); load() }
    else {
      const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }))
      toast.error(err.error ?? 'Failed to mark as paid')
    }
  }

  async function handleToggleInvoice(bill: Bill) {
    const newVal = !bill.invoiceReceived
    // Posting requires a confirmation when un-posting (reversing the accrual)
    if (!newVal && bill.invoiceReceived) {
      if (!confirm(`Unpost "${bill.name}"? This will reverse the accrual journal entry and remove the pending expense transaction.`)) return
    }
    const res = await fetch('/api/finance/bills', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bill.id, invoiceReceived: newVal }),
    })
    if (res.ok) { toast.success(newVal ? 'Bill posted to journals' : 'Bill unposted'); load() }
    else {
      const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }))
      toast.error(err.error ?? 'Failed to update posting status')
    }
  }

  async function handleUnmarkPaid(bill: Bill) {
    if (!confirm(`Undo payment for "${bill.name}"? This will reverse the payment transaction.`)) return
    const res = await fetch('/api/finance/bills', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bill.id, paid: false }),
    })
    if (res.ok) { toast.success('Payment reversed — bill restored'); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to reverse payment') }
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
      if (bill.frequency === 'monthly')     return addMonths(due, 1)
      if (bill.frequency === 'fortnightly') return addWeeks(due, 2)
      if (bill.frequency === 'weekly')      return addWeeks(due, 1)
      if (bill.frequency === 'bimonthly')   return addMonths(due, 2)
      if (bill.frequency === 'quarterly')   return addMonths(due, 3)
      if (bill.frequency === 'halfyearly')  return addMonths(due, 6)
      if (bill.frequency === 'yearly')      return addMonths(due, 12)
    }
    return due
  }

  function billAmountForCat(bill: Bill, rootCatId: string): number {
    if (!bill.category) return 0
    const cat = categories.find(c => c.id === bill.category!.id)
    if (!cat) return 0
    if (cat.id === rootCatId || cat.parentId === rootCatId) return bill.amount
    return 0
  }

  const rootCategories = categories.filter(c => !c.parentId && c.type === 'expense')
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const rangeEnd = dateRange === '14' ? addDays(todayStart, 14)
    : dateRange === '30' ? addDays(todayStart, 30)
    : dateRange === '12months' ? addMonths(todayStart, 12)
    : addMonths(todayStart, 3)

  function toLocalMidnight(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }

  const activeBills = bills.filter(b => {
    if (!b.isActive || b.paid) return false
    if (quickFilter) {
      if (quickFilter.type === 'member'   && b.member?.id   !== quickFilter.id) return false
      if (quickFilter.type === 'vendor'   && b.vendor?.id   !== quickFilter.id) return false
      if (quickFilter.type === 'location' && b.location?.id !== quickFilter.id) return false
      if (quickFilter.type === 'entity'   && b.entity?.id   !== quickFilter.id) return false
    }
    return true
  })

  const overdue       = activeBills.filter(b => b.billType !== 'one-off' && toLocalMidnight(new Date(b.nextDueDate)) < todayStart)
  const overdueOneOff = activeBills.filter(b => b.billType === 'one-off' && toLocalMidnight(new Date(b.nextDueDate)) < todayStart)
  const upcoming      = activeBills.filter(b => {
    const due = toLocalMidnight(new Date(b.nextDueDate))
    return due >= todayStart && due <= rangeEnd
  })
  const visibleBills  = [...overdue, ...upcoming]
  const colCats       = rootCategories.filter(c => selectedCatIds.includes(c.id))
  const grandTotal    = visibleBills.reduce((s, b) => s + b.amount, 0)
  const catTotals: Record<string, number> = {}
  for (const catId of selectedCatIds) {
    catTotals[catId] = visibleBills.reduce((s, b) => s + billAmountForCat(b, catId), 0)
  }
  const gridTemplate = `2.25rem 1fr${colCats.map(() => ' 6.5rem').join('')} 7rem 8.5rem`

  function handleQuickFilter(f: QuickFilter) {
    setQuickFilter(q => q?.id === f.id ? null : f)
  }

  if (loading) return <div className="p-4 text-muted-foreground">Loading bills&hellip;</div>

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

        {quickFilter && (
          <button
            onClick={() => setQuickFilter(null)}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            <span className="capitalize">{quickFilter.type}:</span>
            <span>{quickFilter.label}</span>
            <X className="h-3 w-3 ml-0.5" />
          </button>
        )}

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
                  <button onClick={() => handleMarkPaid(b)} className="p-1 hover:bg-red-500/10 rounded text-green-500"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => openEdit(b)} className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDelete(b.id)} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
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
                  <button onClick={() => handleMarkPaid(b)} className="p-1 hover:bg-orange-500/10 rounded text-green-500"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => openEdit(b)} className="p-1 hover:bg-orange-500/10 rounded text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDelete(b.id)} className="p-1 hover:bg-orange-500/10 rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bill form dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { closeForm(); setErrors({}) } }}>
        <DialogContent className="sm:max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden p-0" showCloseButton={true}>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          <DialogHeader><DialogTitle>{editing ? 'Edit Bill' : 'New Bill'}</DialogTitle></DialogHeader>
          {Object.keys(errors).length > 0 && (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 mb-3">
              <p className="text-xs text-red-500 font-medium">Please fix the following errors:</p>
              <ul className="list-disc list-inside text-xs text-red-500/80 mt-1">
                {Object.values(errors).map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
          <div className="flex gap-4 pb-1">
            {(['recurring', 'one-off'] as const).map(bt => (
              <label key={bt} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="billType" value={bt} checked={form.billType === bt}
                  onChange={() => setForm(p => ({ ...p, billType: bt }))} className="accent-primary" />
                {bt === 'recurring' ? <><RefreshCw className="h-3.5 w-3.5 text-blue-500" /> Recurring</> : <><Layers className="h-3.5 w-3.5 text-orange-500" /> One-off</>}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className={cn('w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm', errors.name && 'border-red-500')} />
              {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Amount *</label>
              <input type="number" step="0.01" value={form.amount || ''}
                onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                onFocus={e => e.target.select()}
                className={cn('w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm', errors.amount && 'border-red-500')} />
              {errors.amount && <p className="text-xs text-red-500 mt-0.5">{errors.amount}</p>}
            </div>
            {form.billType === 'recurring' && (
              <div>
                <label className="text-xs text-muted-foreground">Frequency *</label>
                <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="bimonthly">Bi-Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="halfyearly">Half-Yearly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Financial Contact</label>
              <div className="flex gap-1">
                <select value={form.vendorId} onChange={e => handleVendorChange(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                  <option value="">No contact</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <Link href="/finance/contacts"
                  className="shrink-0 inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-1.5 text-muted-foreground hover:text-foreground"
                  title="Manage contacts"><Building2 className="h-3.5 w-3.5" /></Link>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{form.billType === 'one-off' ? 'Due Date *' : 'Next Due Date *'}</label>
              <input type="date" value={form.nextDueDate} onChange={e => setForm(p => ({ ...p, nextDueDate: e.target.value }))}
                className={cn('w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm', errors.nextDueDate && 'border-red-500')} />
              {errors.nextDueDate && <p className="text-xs text-red-500 mt-0.5">{errors.nextDueDate}</p>}
            </div>
            {form.billType === 'recurring' && (
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
              <label className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="h-3 w-3" /> Entity / Fund</label>
              <select value={form.entityId} onChange={e => setForm(p => ({ ...p, entityId: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">Select entity&hellip;</option>
                {entities.map(e => <option key={e.id} value={e.id}>{e.name}{e.isDefault ? ' (default)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground flex items-center gap-1"><Receipt className="h-3 w-3 text-amber-500" /> Tax Classification</label>
              <select value={form.taxClassification} onChange={e => setForm(p => ({ ...p, taxClassification: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                <option value="">Not classified</option>
                <option value="tax_deduction">Tax Deduction</option>
                <option value="tax_payment">Tax Payment (PAYG)</option>
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
          {/* Journal Lines — double-entry accrual (replaces Category + GL Account fields) */}
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <JournalLinesEditor
              lines={journalLines}
              onChange={setJournalLines}
              glAccounts={glAccounts}
              expectedTotal={form.amount || 0}
              errors={journalErrors}
              onErrorsClear={keys => setJournalErrors(p => { const n = { ...p }; keys.forEach(k => delete n[k]); return n })}
              lineHints={['Expense account (what you\'re paying for)', 'Accounts Payable — liability (what you owe)']}
            />
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
              <Receipt className="h-3.5 w-3.5 text-green-500" /> Posted to journals
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
          <div className={cn('rounded-md border px-3 py-2.5 flex items-start gap-3', form.addToBudget ? 'border-primary/40 bg-primary/5' : 'border-border')}>
            <input type="checkbox" id="addToBudget" checked={form.addToBudget}
              onChange={e => setForm(p => ({ ...p, addToBudget: e.target.checked }))} className="rounded border-input mt-0.5" />
            <label htmlFor="addToBudget" className="cursor-pointer flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <BookmarkCheck className="h-3.5 w-3.5 text-primary" /> Include in budget planner
              </div>
              {form.addToBudget && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Creates a budget rule for <strong>{formatCurrency(toMonthlyAmount(form.amount || 0, form.frequency))}</strong>/month
                  {form.frequency !== 'monthly' ? ` (${form.frequency} normalised to monthly)` : ''}.
                </p>
              )}
            </label>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <textarea value={form.notes} rows={2} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none" />
          </div>
          </div>
          <DialogFooter className="mx-0 mb-0">
            <button onClick={closeForm} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={handleSave} className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium">
              {editing ? 'Update' : 'Create'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Date paid confirmation */}
      <Dialog open={!!paidConfirm} onOpenChange={open => { if (!open) setPaidConfirm(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={true}>
          <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
          {paidConfirm && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                Record payment for <span className="font-medium text-foreground">{paidConfirm.bill.name}</span>.
              </p>
              <div>
                <label className="text-xs text-muted-foreground">Amount paid (this installment)</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <input type="number" min="0.01" max={paidConfirm.bill.amount} step="0.01"
                    value={paidConfirmAmount} onChange={e => setPaidConfirmAmount(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background pl-7 pr-3 py-1.5 text-sm" />
                </div>
                {paidConfirmAmount < paidConfirm.bill.amount && (
                  <p className="text-xs text-amber-500 mt-1">⚠ Partial payment — remaining <span className="font-medium">{formatCurrency(paidConfirm.bill.amount - paidConfirmAmount)}</span> will stay due</p>
                )}
                {paidConfirmAmount > paidConfirm.bill.amount && (
                  <p className="text-xs text-destructive mt-1">⚠ Amount exceeds bill total of {formatCurrency(paidConfirm.bill.amount)}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Date paid</label>
                <input type="date" value={paidConfirmDate} onChange={e => setPaidConfirmDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Pay from GL account</label>
                <select value={paidConfirmGlAccountId} onChange={e => setPaidConfirmGlAccountId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1">
                  <option value="">No GL account (unlinked)</option>
                  {sortedCategoryList(categories.filter(c => c.type === 'asset')).map(c => (
                    <option key={c.id} value={c.id}>{c.parentId ? `\u2014 ${c.name}` : c.name}</option>
                  ))}
                </select>
                {!paidConfirmGlAccountId && (
                  <p className="text-xs text-amber-500 mt-1">⚠ No GL account selected — balance sheet won't update</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {paidConfirmAmount < paidConfirm.bill.amount
                  ? `A partial transaction of ${formatCurrency(paidConfirmAmount)} will be recorded.`
                  : `An expense transaction of ${formatCurrency(paidConfirmAmount)} will be recorded on this date.`
                }
              </p>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setPaidConfirm(null)} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={confirmMarkPaid} className="rounded-md bg-green-600 text-white px-4 py-1.5 text-sm font-medium">Record payment</button>
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
          {[...overdue, ...upcoming].map(b => (
            <BillRow key={b.id} bill={b} nextDue={getNextDue(b)} isOverdue={overdue.includes(b)}
              colCats={colCats} billAmountForCat={billAmountForCat} gridTemplate={gridTemplate}
              inBudget={budgetBillIds.has(b.id)}
              onEdit={openEdit} onDelete={handleDelete} onMarkPaid={handleMarkPaid}
              onUnmarkPaid={handleUnmarkPaid}
              onToggleInvoice={handleToggleInvoice}
              onQuickFilter={handleQuickFilter}
              att={att}
              paymentHistoryBillId={paymentHistoryBillId}
              paymentHistory={paymentHistory}
              paymentHistoryLoading={paymentHistoryLoading}
              onOpenPaymentHistory={openPaymentHistory}
              onClosePaymentHistory={closePaymentHistory} />
          ))}
          {visibleBills.length > 0 && (
            <div className="grid gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 mt-1"
              style={{ gridTemplateColumns: gridTemplate, alignItems: 'center' }}>
              <div />
              <div className="text-xs font-semibold text-muted-foreground">
                {visibleBills.length} bill{visibleBills.length !== 1 ? 's' : ''}
                {overdue.length > 0 && <span className="text-red-500 ml-1">({overdue.length} overdue)</span>}
                {quickFilter && <span className="text-primary ml-1">· filtered</span>}
              </div>
              {colCats.map(c => (
                <span key={c.id} className="text-xs font-semibold text-right">
                  {catTotals[c.id] > 0 ? formatCurrency(catTotals[c.id]) : <span className="text-muted-foreground">&mdash;</span>}
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
  inBudget, onEdit, onDelete, onMarkPaid, onUnmarkPaid, onToggleInvoice, onQuickFilter,
  att,
  paymentHistoryBillId, paymentHistory, paymentHistoryLoading,
  onOpenPaymentHistory, onClosePaymentHistory,
}: {
  bill: Bill; nextDue: Date; isOverdue: boolean
  colCats: { id: string; name: string }[]
  billAmountForCat: (bill: Bill, catId: string) => number
  gridTemplate: string; inBudget: boolean
  onEdit: (b: Bill) => void; onDelete: (id: string) => void
  onMarkPaid: (b: Bill) => void; onUnmarkPaid: (b: Bill) => void; onToggleInvoice: (b: Bill) => void
  onQuickFilter: (f: QuickFilter) => void
  att: ReturnType<typeof useAttachmentManager>
  paymentHistoryBillId: string | null
  paymentHistory: any[]; paymentHistoryLoading: boolean
  onOpenPaymentHistory: (b: Bill) => void; onClosePaymentHistory: () => void
}) {
  const isOneOff            = bill.billType === 'one-off'
  const hasInvoice = bill.isGlPosted === true   // TRUE only when GL journal is actually posted
  const isAttachmentOpen    = att.openEntityId === bill.id
  const isPaymentHistoryOpen = paymentHistoryBillId === bill.id
  const totalPaid           = bill.payments?.reduce((s, p) => s + p.amount, 0) ?? 0
  const isPartiallyPaid     = totalPaid > 0 && totalPaid < bill.amount

  return (
    <div>
      <div
        className={cn(
          'grid gap-3 rounded-lg border p-3 cursor-default select-none transition-colors',
          isOverdue    ? 'border-red-500/30 bg-red-500/5'
          : isPartiallyPaid ? 'border-amber-500/30 bg-amber-500/5'
          : hasInvoice ? 'border-green-500/30 bg-green-500/5'
          :              'border-border hover:bg-accent/50',
          isAttachmentOpen && 'ring-1 ring-green-500/40 rounded-b-none',
        )}
        style={{ gridTemplateColumns: gridTemplate, alignItems: 'center' }}
        onDoubleClick={() => onEdit(bill)}
      >
        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center',
          isOverdue ? 'bg-red-500/10' : isPartiallyPaid ? 'bg-amber-500/10' : hasInvoice ? 'bg-green-500/10' : isOneOff ? 'bg-orange-500/10' : 'bg-muted')}>
          {isOneOff
            ? <Layers className={cn('h-4 w-4', isOverdue ? 'text-red-500' : 'text-orange-500')} />
            : <RefreshCw className={cn('h-4 w-4', isOverdue ? 'text-red-500' : isPartiallyPaid ? 'text-amber-500' : hasInvoice ? 'text-green-600' : 'text-muted-foreground')} />}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{bill.name}</span>
            {!bill.isActive && <span className="text-[10px] bg-muted px-1.5 rounded">INACTIVE</span>}
            {bill.autoPay && <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 rounded">AUTO</span>}
            {hasInvoice && (
              <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 rounded flex items-center gap-0.5">
                <Receipt className="h-2.5 w-2.5" /> POSTED
              </span>
            )}
            {bill.invoiceReceived && !hasInvoice && (
              <span className="text-[10px] bg-amber-500/10 text-amber-600 px-1.5 rounded flex items-center gap-0.5" title="invoiceReceived=true but no posted GL journal — data integrity warning">
                <Receipt className="h-2.5 w-2.5" /> POSTED (no GL)
              </span>
            )}
            {inBudget && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 rounded flex items-center gap-0.5">
                <BookmarkCheck className="h-2.5 w-2.5" /> BUDGET
              </span>
            )}
            {isPartiallyPaid && (
              <span className="text-[10px] bg-amber-500/10 text-amber-600 px-1.5 rounded flex items-center gap-0.5">
                PARTIAL
              </span>
            )}
            {bill.entity && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
                style={{ backgroundColor: bill.entity.color ?? '#6B7280' }}>
                {bill.entity.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
            <span className="capitalize">{isOneOff ? 'One-off' : bill.frequency}</span>
            {bill.vendor && (
              <button className="text-purple-500 hover:underline"
                onClick={e => { e.stopPropagation(); onQuickFilter({ type: 'vendor', id: bill.vendor!.id, label: bill.vendor!.name }) }}
                title={`Filter by vendor: ${bill.vendor.name}`}>
                {bill.vendor.name}
              </button>
            )}
            {bill.account && <span>{bill.account.name}</span>}
            {bill.member && (
              <button className="text-primary hover:underline"
                onClick={e => { e.stopPropagation(); onQuickFilter({ type: 'member', id: bill.member!.id, label: bill.member!.name }) }}
                title={`Filter by member: ${bill.member.name}`}>
                {bill.member.name}
              </button>
            )}
            {bill.location && (
              <button className="hover:underline"
                onClick={e => { e.stopPropagation(); onQuickFilter({ type: 'location', id: bill.location!.id, label: bill.location!.name }) }}
                title={`Filter by location: ${bill.location.name}`}>
                {bill.location.name}
              </button>
            )}
            <span>Due {format(nextDue, 'd MMM yyyy')}</span>
            {bill.notes && <span className="italic truncate max-w-[120px]" title={bill.notes}>· {bill.notes}</span>}
          </div>
        </div>

        {colCats.map(c => {
          const amt = billAmountForCat(bill, c.id)
          return <span key={c.id} className="text-sm text-right text-muted-foreground">{amt > 0 ? formatCurrency(amt) : '—'}</span>
        })}

        <div className="text-right">
          <p className="text-sm font-semibold">{formatCurrency(bill.amount)}</p>
          {isPartiallyPaid && (
            <p className="text-[10px] text-amber-600 font-medium mt-0.5">
              {formatCurrency(totalPaid)} paid
            </p>
          )}
        </div>

        <div className="flex items-center gap-0.5 justify-end">
          <button onClick={() => onOpenPaymentHistory(bill)}
            title="Payment history"
            className={cn('p-1 hover:bg-accent rounded', isPaymentHistoryOpen ? 'text-amber-600' : 'text-muted-foreground')}>
            <Clock className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => att.open(bill.id)}
            title={bill.attachments && bill.attachments.length > 0 ? `${bill.attachments.length} attachment${bill.attachments.length !== 1 ? 's' : ''}` : 'Attachments'}
            className={cn('relative p-1 hover:bg-accent rounded',
              isAttachmentOpen || (bill.attachments && bill.attachments.length > 0) ? 'text-green-600' : 'text-muted-foreground')}>
            <Paperclip className="h-3.5 w-3.5" />
            {!isAttachmentOpen && bill.attachments && bill.attachments.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-green-500 text-white text-[9px] font-bold flex items-center justify-center leading-none px-0.5">
                {bill.attachments.length}
              </span>
            )}
          </button>
          <button onClick={() => onToggleInvoice(bill)}
            title={bill.invoiceReceived ? 'Unpost (reverse accrual)' : 'Post — post this bill to journals'}
            className={cn('p-1 hover:bg-accent rounded', bill.invoiceReceived ? 'text-green-500' : 'text-amber-500')}>
            <Receipt className="h-3.5 w-3.5" />
          </button>
          {bill.paid
            ? <button onClick={() => onUnmarkPaid(bill)} title="Undo payment" className="p-1 hover:bg-accent rounded text-green-500">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
            : <button onClick={() => onMarkPaid(bill)} title="Mark as paid" className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-green-500">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
          }
          <button onClick={() => onEdit(bill)} className="p-1 hover:bg-accent rounded"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => onDelete(bill.id)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* Payment History panel */}
      {isPaymentHistoryOpen && (
        <div className="rounded-b-lg border border-t-0 border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 text-amber-600" /> Payment History
            </div>
            <button onClick={onClosePaymentHistory} className="p-1 rounded hover:bg-accent text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          {paymentHistoryLoading ? (
            <p className="text-xs text-muted-foreground">Loading&hellip;</p>
          ) : paymentHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">No payments yet.</p>
          ) : (
            <div className="space-y-1.5">
              {paymentHistory.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">{format(new Date(p.paymentDate), 'd MMM yyyy')}</span>
                  <span className="font-medium shrink-0">{formatCurrency(p.amount)}</span>
                  {p.glAccount && <span className="text-xs text-muted-foreground truncate">{p.glAccount.name}</span>}
                  {p.transaction && (
                    <span className={cn('text-[10px] px-1.5 rounded ml-auto', p.transaction.isCleared ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600')}>
                      {p.transaction.isCleared ? 'Cleared' : 'Uncleared'}
                    </span>
                  )}
                </div>
              ))}
              <div className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                Total paid: <span className="font-medium text-foreground">{formatCurrency(totalPaid)}</span>
                {totalPaid < bill.amount && (
                  <> &middot; Remaining: <span className="font-medium text-amber-600">{formatCurrency(bill.amount - totalPaid)}</span></>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {isAttachmentOpen && (
        <AttachmentSection
          attachments={att.attachments}
          loading={att.loading}
          uploading={att.uploading}
          previewId={att.previewId}
          fileRef={att.fileRef}
          getAttachmentUrl={attId => `/api/finance/bills/${bill.id}/attachments/${attId}`}
          onClose={att.close}
          onTogglePreview={att.togglePreview}
          onUpload={file => att.upload(bill.id, file)}
          onDelete={attId => att.remove(bill.id, attId)}
          firstUploadLabel="Upload Invoice"
        />
      )}
    </div>
  )
}
