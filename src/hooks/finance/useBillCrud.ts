'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { addMonths, addDays } from 'date-fns'
import { todayAU } from '@/lib/utils'
import { toMonthlyAmount } from '@/lib/financeShared'
import { type JournalFormLine, type GLAccount } from '@/components/finance/JournalLinesEditor'
import { usePaymentHistory } from '@/hooks/finance/usePaymentHistory'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Member   { id: string; name: string; email: string }
export interface Location { id: string; name: string }
export interface Vendor   { id: string; name: string; defaultCategory?: { id: string; name: string } | null }
export interface Entity   { id: string; name: string; color: string | null; type: string; isDefault: boolean }

export interface BillAttachment {
  id: string; billId: string; title: string; fileName: string
  fileSize: number; mimeType: string; createdAt: string
}

export interface Bill {
  id: string; name: string; amount: number; frequency: string
  dayOfMonth: number | null; monthOfYear: number | null
  nextDueDate: string; endDate: string | null; isActive: boolean
  autoPay: boolean; emailReminder: boolean; reminderDays: number
  showOnCalendar: boolean
  notes: string | null; memberId: string | null
  journalEntryId: string | null
  isGlPosted: boolean
  account: { id: string; name: string } | null
  category: { id: string; name: string; color: string | null } | null
  vendor: { id: string; name: string } | null
  member: Member | null
  location: Location | null
  entity: Entity | null
  paid: boolean; paidDate: string | null
  invoiceReceived: boolean; invoiceReceivedDate: string | null
  billDate: string | null
  status: string | null
  billType: string; recurrenceInterval: string | null; parentBillId: string | null
  taxClassification: string | null
  attachments?: BillAttachment[]
  payments?: { amount: number }[]
}

export type QuickFilter = { type: 'member' | 'vendor' | 'location' | 'entity'; id: string; label: string }

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBillCrud() {
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
  const [quickFilter, setQuickFilter] = useState<QuickFilter | null>(null)
  const [hideDeleteBills, setHideDeleteBills] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [voidConfirm, setVoidConfirm] = useState<{ id: string; name: string } | null>(null)
  const [voidNote, setVoidNote] = useState('')

  const emptyForm = {
    name: '', amount: 0, frequency: 'monthly', accountId: '', categoryId: '',
    dayOfMonth: '', monthOfYear: '', nextDueDate: todayAU(),
    endDate: '', autoPay: false, emailReminder: false, reminderDays: 3,
    notes: '', memberId: '', locationId: '', vendorId: '',
    entityId: '',
    billType: 'recurring', recurrenceInterval: '',
    invoiceReceived: false, invoiceReceivedDate: '',
    taxClassification: '',
    showOnCalendar: true,
    addToBudget: true,
  }
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // ── Payment history — extracted hook ────────────────────────────────────────
  // Manages open panel, payments list, add-payment form, and undo per payment.
  // load() is passed so the bill list refreshes after any payment change.

  const paymentHistory = usePaymentHistory(() => load())

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (!form.amount || form.amount <= 0) errs.amount = 'Amount must be greater than 0'
    if (!form.nextDueDate) errs.nextDueDate = 'Due date is required'
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
    const [aRes, cRes, glRes, mRes, lRes, vRes, bRes, eRes, sRes] = await Promise.all([
      fetch('/api/finance/accounts'),
      fetch('/api/finance/categories'),
      fetch('/api/finance/categories?forPicker=true'),
      fetch('/api/finance/members'),
      fetch('/api/finance/locations'),
      fetch('/api/finance/contacts'),
      fetch('/api/finance/budget'),
      fetch('/api/finance/entities'),
      fetch('/api/settings'),
    ])
    if (aRes.ok) setAccounts(await aRes.json())
    if (cRes.ok) setCategories(await cRes.json())
    if (glRes.ok) {
      const glCats = await glRes.json()
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
    if (sRes.ok) {
      const settings = await sRes.json()
      setHideDeleteBills(settings.uiPreferences?.hideDeleteBills === true)
    }
  }

  useEffect(() => { loadRefs() }, [])
  useEffect(() => { if (members.length > 0 || accounts.length > 0) load() }, [members, accounts])

  // ── Journal line default seeding ─────────────────────────────────────────────

  function defaultBillLines(amount?: number, expenseCategoryId?: string): JournalFormLine[] {
    const amtStr = amount && amount > 0 ? amount.toFixed(2) : ''
    const ap = glAccounts.find(a => a.name.toLowerCase().includes('accounts payable'))
    return [
      { glAccountId: expenseCategoryId ?? '', side: 'debit',  amount: amtStr, description: '' },
      { glAccountId: ap?.id ?? '',            side: 'credit', amount: amtStr, description: '' },
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

  // ── Amount → journal lines mirror (GL-FIRST invariant) ──────────────────────
  useEffect(() => {
    if (!showForm || form.amount <= 0) return
    if (journalLines.length !== 2) return
    const a0 = journalLines[0]?.amount ?? ''
    const a1 = journalLines[1]?.amount ?? ''
    const inMirror = a0 === a1
    if (!inMirror) return
    const target = (form.amount as number).toFixed(2)
    if (a0 === target) return
    setJournalLines(lines => lines.map(l => ({ ...l, amount: target })))
  }, [form.amount, showForm]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── First debit GL → form.categoryId reverse-sync ───────────────────────────
  useEffect(() => {
    if (!showForm) return
    const firstDebit = journalLines.find(l => l.side === 'debit')
    const principalGl = firstDebit?.glAccountId ?? ''
    if (principalGl === form.categoryId) return
    setForm(p => ({ ...p, categoryId: principalGl }))
  }, [journalLines, showForm]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Budget sync ──────────────────────────────────────────────────────────────

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

  // ── Filter helpers ───────────────────────────────────────────────────────────

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

  function handleQuickFilter(f: QuickFilter) {
    setQuickFilter(q => q?.id === f.id ? null : f)
  }

  // ── Form open/close ──────────────────────────────────────────────────────────

  function openNew() {
    setEditing(null); setErrors({}); setJournalLines(defaultBillLines()); setJournalErrors({})
    setForm(emptyForm); setShowForm(true)
  }

  async function openEdit(b: Bill) {
    setEditing(b)
    setErrors({})
    setJournalErrors({})
    if (b.journalEntryId) {
      const lines = await loadExistingBillJournalLines(b.journalEntryId)
      setJournalLines(lines)
    } else {
      setJournalLines(defaultBillLines(b.amount, b.category?.id))
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
      showOnCalendar: b.showOnCalendar ?? true,
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
      invoiceReceivedDate: form.invoiceReceivedDate || null,
      taxClassification: form.taxClassification || null,
      showOnCalendar: form.showOnCalendar,
    }
  }

  // ── GL-FIRST save ────────────────────────────────────────────────────────────

  async function handleSave() {
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      toast.error(Object.values(errs).join(' · '))
      return
    }
    try {
      const { addToBudget, ...payload } = getFormPayload() as any

      if (editing && editing.invoiceReceived === true && form.invoiceReceived === false) {
        const unpostRes = await fetch('/api/finance/bills', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, invoiceReceived: false }),
        })
        if (!unpostRes.ok) {
          const err = await unpostRes.json().catch(() => ({ error: `Server error (${unpostRes.status})` }))
          toast.error(err.error ?? 'Failed to unpost bill from journals')
          return
        }
      }

      const isNewPost     = form.invoiceReceived && (!editing || !editing.invoiceReceived)
      const isDraftPersist = !!editing && !editing.invoiceReceived && !form.invoiceReceived
      const isNewDraft    = !editing && !form.invoiceReceived

      if (isNewPost || isDraftPersist || isNewDraft) {
        const missingAccountIdx = journalLines.findIndex(
          l => (parseFloat(l.amount) || 0) > 0 && l.glAccountId.trim() === ''
        )
        if (missingAccountIdx !== -1) {
          toast.error(`Journal line ${missingAccountIdx + 1} has an amount but no GL account. Please select a GL account or remove the line before saving.`)
          return
        }
      }

      const linesToSubmit = (isNewPost || isDraftPersist || isNewDraft)
        ? journalLines.filter(l => l.glAccountId.trim() !== '')
        : []

      if (linesToSubmit.length >= 2) {
        const drTotal = linesToSubmit.filter(l => l.side === 'debit').reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
        const crTotal = linesToSubmit.filter(l => l.side === 'credit').reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
        if (Math.abs(drTotal - crTotal) > 0.005) {
          toast.error(`Journal lines are not balanced — debits ${drTotal.toFixed(2)} ≠ credits ${crTotal.toFixed(2)}. Please fix the split before saving.`)
          return
        }
      }

      const serialisedLines = linesToSubmit.map(l => ({
        glAccountId: l.glAccountId,
        side: l.side,
        amount: parseFloat(l.amount) || 0,
        description: l.description || null,
      }))

      const body = editing
        ? { id: editing.id, ...payload, ...(serialisedLines.length >= 2 ? { journalLines: serialisedLines } : {}) }
        : { ...payload, ...(serialisedLines.length >= 2 ? { journalLines: serialisedLines } : {}) }

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
      console.error('[handleSave bills]', err)
      toast.error('An unexpected error occurred. Check the browser console for details.')
    }
  }

  // ── Delete / void ────────────────────────────────────────────────────────────

  function handleDelete(id: string, name: string) { setDeleteConfirm({ id, name }) }

  async function confirmDelete() {
    if (!deleteConfirm) return
    await fetch('/api/finance/budget', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeFromBill: true, billId: deleteConfirm.id }),
    })
    const res = await fetch(`/api/finance/bills?id=${deleteConfirm.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Bill deleted'); setDeleteConfirm(null); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to delete') }
  }

  function handleVoid(id: string, name: string) { setVoidNote(''); setVoidConfirm({ id, name }) }

  async function confirmVoid() {
    if (!voidConfirm) return
    const res = await fetch('/api/finance/bills', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: voidConfirm.id, void: true, voidNote: voidNote || null }),
    })
    if (res.ok) { toast.success('Bill voided — GL reversal journals created'); setVoidConfirm(null); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to void') }
  }

  // ── Mark paid / unpaid ───────────────────────────────────────────────────────

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

  // ── Category / vendor change ─────────────────────────────────────────────────

  function handleCategoryChange(categoryId: string) {
    setForm(p => ({ ...p, categoryId }))
    setJournalLines(lines => {
      const firstDebitIdx = lines.findIndex(l => l.side === 'debit')
      if (firstDebitIdx === -1) return lines
      return lines.map((l, i) => i === firstDebitIdx ? { ...l, glAccountId: categoryId } : l)
    })
  }

  function handleVendorChange(vendorId: string) {
    const vendor = vendors.find(v => v.id === vendorId)
    const update: any = { vendorId }
    if (vendor?.defaultCategory && !form.categoryId) update.categoryId = vendor.defaultCategory.id
    setForm(p => ({ ...p, ...update }))
  }

  // ── Per-bill helpers ─────────────────────────────────────────────────────────

  function getNextDue(bill: Bill): Date { return new Date(bill.nextDueDate) }

  function billAmountForCat(bill: Bill, rootCatId: string): number {
    if (!bill.category) return 0
    const cat = categories.find(c => c.id === bill.category!.id)
    if (!cat) return 0
    if (cat.id === rootCatId || cat.parentId === rootCatId) return bill.amount
    return 0
  }

  // ── Derived list state ───────────────────────────────────────────────────────

  function toLocalMidnight(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }

  const rootCategories = categories.filter(c => !c.parentId && c.type === 'expense')
  const now       = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const rangeEnd  = dateRange === '14' ? addDays(todayStart, 14)
    : dateRange === '30' ? addDays(todayStart, 30)
    : dateRange === '12months' ? addMonths(todayStart, 12)
    : addMonths(todayStart, 3)

  const activeBills = bills.filter(b => {
    if (!b.isActive || b.paid || b.status === 'draft') return false
    if (quickFilter) {
      if (quickFilter.type === 'member'   && b.member?.id   !== quickFilter.id) return false
      if (quickFilter.type === 'vendor'   && b.vendor?.id   !== quickFilter.id) return false
      if (quickFilter.type === 'location' && b.location?.id !== quickFilter.id) return false
      if (quickFilter.type === 'entity'   && b.entity?.id   !== quickFilter.id) return false
    }
    return true
  })

  const overdue       = activeBills.filter(b => b.billType !== 'one-off' && toLocalMidnight(new Date(b.nextDueDate)) < todayStart)
  const overdueOneOff = activeBills.filter(b => b.billType === 'one-off'  && toLocalMidnight(new Date(b.nextDueDate)) < todayStart)
  const upcoming      = activeBills.filter(b => {
    const due = toLocalMidnight(new Date(b.nextDueDate))
    return due >= todayStart && due <= rangeEnd
  })
  const visibleBills = [...overdue, ...upcoming]
  const colCats      = rootCategories.filter(c => selectedCatIds.includes(c.id))
  const grandTotal   = visibleBills.reduce((s, b) => s + b.amount, 0)
  const catTotals: Record<string, number> = {}
  for (const catId of selectedCatIds) {
    catTotals[catId] = visibleBills.reduce((s, b) => s + billAmountForCat(b, catId), 0)
  }
  const gridTemplate = `2.25rem 1fr${colCats.map(() => ' 6.5rem').join('')} 8rem 10rem`

  return {
    // Core state
    bills, loading, showForm, editing,
    journalLines, setJournalLines,
    journalErrors, setJournalErrors,
    // Form
    form, setForm, errors,
    // Reference data
    accounts, categories, glAccounts, members, locations, vendors, entities,
    budgetBillIds,
    // Confirmation dialogs
    paidConfirm, setPaidConfirm,
    paidConfirmDate, setPaidConfirmDate,
    paidConfirmGlAccountId, setPaidConfirmGlAccountId,
    paidConfirmAmount, setPaidConfirmAmount,
    deleteConfirm, setDeleteConfirm,
    voidConfirm, setVoidConfirm,
    voidNote, setVoidNote,
    // Filter state
    dateRange, setDateRangePersisted,
    selectedCatIds, showCatPicker, setShowCatPicker, toggleCat,
    quickFilter,
    hideDeleteBills,
    // Derived list data
    rootCategories, overdue, overdueOneOff, upcoming, visibleBills,
    colCats, grandTotal, catTotals, gridTemplate,
    // Payment history — from usePaymentHistory hook
    paymentHistory,
    // Actions
    openNew, openEdit, closeForm,
    handleSave, handleDelete, confirmDelete,
    handleVoid, confirmVoid,
    handleMarkPaid, confirmMarkPaid,
    handleToggleInvoice, handleUnmarkPaid,
    handleCategoryChange, handleVendorChange,
    handleQuickFilter,
    getNextDue, billAmountForCat,
  }
}
