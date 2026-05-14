'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Plus, Pencil, Trash2, Bell, Settings2, CheckCircle2,
  RefreshCw, Layers, Briefcase, Paperclip, X,
  Building2, BookmarkCheck, Receipt, ReceiptText,
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
  ResizableDialogContent,
} from '@/components/ui/dialog'
import { JournalLinesEditor, type JournalFormLine, type GLAccount } from '@/components/finance/JournalLinesEditor'
import { useAttachmentManager } from '@/hooks/finance/useAttachmentManager'
import { AttachmentSection } from '@/components/finance/AttachmentSection'

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
  journalEntryId: string | null
  account: { id: string; name: string } | null
  category: { id: string; name: string; color: string | null } | null
  vendor: { id: string; name: string } | null
  member: Member | null
  location: Location | null
  entity: Entity | null
  parentIncomeId: string | null
  attachments?: IncomeAttachment[]
}

export default function IncomePage() {
  const [entries, setEntries]         = useState<IncomeEntry[]>([])
  const [accounts, setAccounts]       = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories]   = useState<{ id: string; name: string; type: string; parentId: string | null }[]>([])
  const [glAccounts, setGLAccounts]   = useState<GLAccount[]>([])
  const [members, setMembers]         = useState<Member[]>([])
  const [locations, setLocations]     = useState<Location[]>([])
  const [vendors, setVendors]         = useState<Vendor[]>([])
  const [entities, setEntities]       = useState<Entity[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [editing, setEditing]         = useState<IncomeEntry | null>(null)
  const [errors, setErrors]           = useState<Record<string, string>>({})
  const [journalLines, setJournalLines] = useState<JournalFormLine[]>([])
  const [journalErrors, setJournalErrors] = useState<Record<string, string>>({})
  const [receivedConfirm, setReceivedConfirm] = useState<{ entry: IncomeEntry } | null>(null)
  const [receivedConfirmDate, setReceivedConfirmDate] = useState<string>('')
  const [receivedConfirmGlAccountId, setReceivedConfirmGlAccountId] = useState<string>('')
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
  const att = useAttachmentManager('/api/finance/income')
  const prevIncomeAmountRef = useRef<number>(0)

  // ── FIX: Use todayAU() instead of new Date().toISOString().split('T')[0] ──
  const emptyForm = {
    name: '', amount: 0, frequency: 'monthly', incomeType: 'recurring',
    accountId: '', categoryId: '', vendorId: '',
    dayOfMonth: '', monthOfYear: '',
    nextExpectedDate: todayAU(),
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
    const [aRes, cRes, glRes, mRes, lRes, vRes, eRes] = await Promise.all([
      fetch('/api/finance/accounts'),
      fetch('/api/finance/categories'),           // full list for category/P&L selector
      fetch('/api/finance/categories?forPicker=true'), // filtered for GL journal line picker
      fetch('/api/finance/members'),
      fetch('/api/finance/locations'),
      fetch('/api/finance/contacts'),
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
  }

  useEffect(() => { loadRefs() }, [])
  useEffect(() => { if (members.length > 0 || accounts.length > 0) load() }, [members, accounts])

  // When amount changes, auto-fill blank/zero lines or lines still showing the previous auto-filled value
  useEffect(() => {
    if (!showForm || form.amount <= 0) return
    const prev = prevIncomeAmountRef.current
    const prevStr = prev > 0 ? prev.toFixed(2) : ''
    setJournalLines(lines => lines.map(l =>
      l.amount === '' || l.amount === '0.00' || l.amount === prevStr
        ? { ...l, amount: form.amount.toFixed(2) }
        : l
    ))
    prevIncomeAmountRef.current = form.amount
  }, [form.amount]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Pre-seed journal lines for income ───────────────────────────────────
  // DR: Accounts Receivable / CR: income account (pre-filled from entry's categoryId if known)
  function defaultIncomeLines(amount?: number, incomeCategoryId?: string): JournalFormLine[] {
    const amtStr = amount && amount > 0 ? amount.toFixed(2) : ''
    // Match by partial name (case-insensitive) so leading chart-of-accounts codes
    // like "0 Accounts Receivable" or "1100 Accounts Receivable" are found correctly.
    const ar = glAccounts.find(a => a.name.toLowerCase().includes('accounts receivable'))
    return [
      { glAccountId: ar?.id ?? '',          side: 'debit',  amount: amtStr, description: '' },
      { glAccountId: incomeCategoryId ?? '', side: 'credit', amount: amtStr, description: '' },
    ]
  }

  async function loadExistingJournalLines(journalEntryId: string): Promise<JournalFormLine[]> {
    try {
      const res = await fetch(`/api/finance/journals/${journalEntryId}`)
      if (!res.ok) return defaultIncomeLines()
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
    return defaultIncomeLines()
  }

  function openNew() { prevIncomeAmountRef.current = 0; setEditing(null); setForm(emptyForm); setErrors({}); setJournalLines(defaultIncomeLines()); setJournalErrors({}); setShowForm(true) }

  function openEdit(e: IncomeEntry) {
    setEditing(e)
    setErrors({})
    setJournalErrors({})
    prevIncomeAmountRef.current = 0  // reset so amount-sync useEffect doesn't corrupt incoming GL lines
    // Pre-seed journal lines from GL if a journal entry exists, else default using the entry's category
    if (e.journalEntryId) {
      setJournalLines(defaultIncomeLines(e.amount, e.category?.id))  // show defaults immediately while loading
      loadExistingJournalLines(e.journalEntryId).then(setJournalLines)
    } else {
      setJournalLines(defaultIncomeLines(e.amount, e.category?.id))
    }
    setForm({
      name: e.name, amount: e.amount, frequency: e.frequency,
      incomeType: e.incomeType ?? 'recurring',
      accountId: e.account?.id ?? '', categoryId: e.category?.id ?? '',
      vendorId: e.vendor?.id ?? '',
      dayOfMonth: e.dayOfMonth?.toString() ?? '',
      monthOfYear: e.monthOfYear?.toString() ?? '',
      // ── FIX: use date part only, not full ISO string (works correctly in AU tz for display) ──
      nextExpectedDate: e.nextExpectedDate.split('T')[0],
      endDate: e.endDate ? e.endDate.split('T')[0] : '',
      autoPay: e.autoPay ?? false,
      emailReminder: e.emailReminder ?? false,
      reminderDays: e.reminderDays ?? 3,
      notes: e.notes ?? '', memberId: e.memberId ?? '',
      locationId: e.location?.id ?? '',
      entityId: e.entity?.id ?? '',
      invoiceReceived: e.invoiceReceived ?? false,
      invoiceReceivedDate: e.invoiceReceivedDate
        ? e.invoiceReceivedDate.split('T')[0] : '',
      recurrenceInterval: e.recurrenceInterval ?? '',
      isTaxTracked: e.isTaxTracked ?? false,
      taxRate: e.taxRate != null ? e.taxRate.toString() : '',
      taxClassification: e.taxClassification ?? '',
    })
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditing(null); setErrors({}); setJournalLines([]); setJournalErrors({}) }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    if (!form.amount || form.amount <= 0) errs.amount = 'Amount must be greater than 0'
    if (!form.nextExpectedDate) errs.nextExpectedDate = 'Expected date is required'
    return errs
  }

  function handleCategoryChange(categoryId: string) {
    setForm(p => ({ ...p, categoryId }))
    // Keep the first credit line in sync so the GL journal reflects the chosen income account
    setJournalLines(lines => {
      const firstCreditIdx = lines.findIndex(l => l.side === 'credit')
      if (firstCreditIdx === -1) return lines
      return lines.map((l, i) => i === firstCreditIdx ? { ...l, glAccountId: categoryId } : l)
    })
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
    if (Object.keys(errs).length > 0) { setErrors(errs); toast.error(Object.values(errs).join(' · ')); return }
    try {
      const payload = getFormPayload()

      // ── EDIT path ────────────────────────────────────────────────────────
      if (editing) {
        // If the user is unticking "Posted to journals" on an already-posted entry,
        // the PUT route has no unpost logic — PATCH first to reverse the GL entry.
        if (editing.invoiceReceived === true && form.invoiceReceived === false) {
          const unpostRes = await fetch('/api/finance/income', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editing.id, invoiceReceived: false }),
          })
          if (!unpostRes.ok) {
            const err = await unpostRes.json().catch(() => ({ error: `Server error (${unpostRes.status})` }))
            toast.error(err.error ?? 'Failed to unpost income from journals')
            return
          }
        }

        // isNewPost: posting for the first time — lines become the posted GL entry
        // isDraftPersist: remains unposted — persist line edits to the draft journal
        // Already-posted: never re-submit lines
        const isNewPost = form.invoiceReceived && !editing.invoiceReceived
        const isDraftPersist = !editing.invoiceReceived && !form.invoiceReceived
        const validLines = (isNewPost || isDraftPersist)
          ? journalLines.filter(l => l.glAccountId && parseFloat(l.amount) > 0)
          : []

        const body = {
          id: editing.id,
          ...payload,
          ...(validLines.length >= 2 ? { journalLines: validLines.map(l => ({ glAccountId: l.glAccountId, side: l.side, amount: parseFloat(l.amount), description: l.description || null })) } : {}),
        }

        const res = await fetch('/api/finance/income', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }))
          toast.error(err.error ?? 'Failed to update income')
          return
        }
        toast.success('Income updated')
        closeForm()
        load()
        return
      }

      // ── CREATE path ──────────────────────────────────────────────────────
      // Always create the entry as a draft (invoiceReceived: false) regardless
      // of what the checkbox says. This guarantees the POST never touches the GL.
      // If the user ticked "Posted to journals", a follow-up PATCH fires below
      // to trigger the existing atomic GL-posting path in the PATCH handler.
      const wantsPosted = form.invoiceReceived
      const wantsPostedDate = form.invoiceReceivedDate || null

      const postRes = await fetch('/api/finance/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Force invoiceReceived: false so the POST never touches the GL.
        // invoiceReceivedDate is preserved so the field is pre-filled when
        // the user reopens the draft to review or post it later.
        body: JSON.stringify({ ...payload, invoiceReceived: false }),
      })
      if (!postRes.ok) {
        const err = await postRes.json().catch(() => ({ error: `Server error (${postRes.status})` }))
        toast.error(err.error ?? 'Failed to create income')
        return
      }
      const created = await postRes.json()

      // If the user had "Posted to journals" ticked, now post it via PATCH so
      // the full atomic GL write (DR AR / CR Income + tracking transaction) runs
      // through the single authoritative posting path — same as clicking the
      // Receipt button on the income row after creation.
      if (wantsPosted) {
        const patchRes = await fetch('/api/finance/income', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: created.id,
            invoiceReceived: true,
            invoiceReceivedDate: wantsPostedDate,
          }),
        })
        if (!patchRes.ok) {
          // Entry was saved as draft — warn the user but don't block them.
          const err = await patchRes.json().catch(() => ({ error: `Server error (${patchRes.status})` }))
          toast.warning(`Income saved as draft — GL posting failed: ${err.error ?? 'unknown error'}`)
          closeForm()
          load()
          return
        }
      }

      toast.success('Income created')
      closeForm()
      load()
    } catch (err) {
      console.error('[handleSave income]', err)
      toast.error('An unexpected error occurred. Check the browser console for details.')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this income entry?')) return
    const res = await fetch(`/api/finance/income?id=${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Income deleted'); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to delete') }
  }

  // ── FIX: use todayAU() for the date default ──
  async function handleMarkReceived(entry: IncomeEntry) {
    setReceivedConfirmDate(todayAU())
    setReceivedConfirmGlAccountId('')
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
        receiveToGlAccountId: receivedConfirmGlAccountId || null,
      }),
    })
    if (res.ok) { toast.success('Income marked as received'); setReceivedConfirm(null); load() }
    else {
      const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }))
      toast.error(err.error ?? 'Failed to mark as received')
    }
  }

  async function handleToggleInvoice(entry: IncomeEntry) {
    const newVal = !entry.invoiceReceived
    // Confirm when un-posting (reversing the accrual)
    if (!newVal && entry.invoiceReceived) {
      if (!confirm(`Unpost "${entry.name}"? This will reverse the accrual journal entry and remove the pending income transaction.`)) return
    }
    const res = await fetch('/api/finance/income', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, invoiceReceived: newVal }),
    })
    if (res.ok) { toast.success(newVal ? 'Income posted to journals' : 'Income unposted'); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to update posting status') }
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
      <h1 className="text-2xl font-bold">Income</h1>

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

        <Link href="/finance/income/received"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
          <CheckCircle2 className="h-3.5 w-3.5" /> Received Income
        </Link>

        <button onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Income
        </button>

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
        <ResizableDialogContent className="w-full sm:max-w-2xl md:max-w-4xl xl:max-w-6xl 2xl:max-w-7xl max-h-[90vh] flex flex-col overflow-hidden p-0" showCloseButton={true} minWidth={600} minHeight={400}>

          {/* Fixed header — title, errors, income type toggle */}
          <div className="px-4 pt-4 pb-0 shrink-0">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Income' : 'New Income'}</DialogTitle>
            </DialogHeader>

            {Object.keys(errors).length > 0 && (
              <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 mt-3">
                <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">Please fix the following errors:</p>
                <ul className="list-disc list-inside text-xs text-red-600/80 dark:text-red-400/80 space-y-0.5">
                  {Object.entries(errors).map(([key, msg]) => (
                    <li key={key}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-4 py-3">
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
          </div>

          {/* Two-column body — single scroll on the whole panel, not per-column */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="flex flex-col md:flex-row">
              {/* Left panel — core fields */}
              <div className="md:w-1/2 px-4 pb-4 space-y-3 md:border-r md:border-border">
                <div>
                  <label className="text-xs text-muted-foreground">Name *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className={cn('w-full rounded-md border bg-background px-3 py-1.5 text-sm', errors.name ? 'border-red-500' : 'border-input')} />
                  {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Amount *</label>
                  <input type="number" step="0.01" value={form.amount || ''}
                    onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                    onFocus={e => e.target.select()}
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
                <div>
                  <label className="text-xs text-muted-foreground">Income Category (GL)</label>
                  <select value={form.categoryId} onChange={e => handleCategoryChange(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                    <option value="">No category</option>
                    {sortedCategoryList(categories.filter(c => c.type === 'income')).map(c => (
                      <option key={c.id} value={c.id}>{c.parentId ? '— ' + c.name : c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Right panel — journal lines + options + tax + notes */}
              <div className="md:w-1/2 px-4 pb-4 space-y-3">
              {/* Journal Lines */}
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <JournalLinesEditor
                  lines={journalLines}
                  onChange={setJournalLines}
                  glAccounts={glAccounts}
                  expectedTotal={form.amount || 0}
                  errors={journalErrors}
                  onErrorsClear={keys => setJournalErrors(p => { const n = { ...p }; keys.forEach(k => delete n[k]); return n })}
                  lineHints={['Accounts Receivable — asset (money owed to you)', 'Income account (what category of income)']}
                />
              </div>

              <div className="flex flex-wrap gap-4 pt-1">
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
                  <Receipt className="h-3.5 w-3.5 text-green-500" /> Posted to journals
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
            </div>
          </div>
          </div>

          <DialogFooter className="mx-0 mb-0 shrink-0">
            <button onClick={closeForm} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={handleSave} className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium">
              {editing ? 'Update' : 'Create'}
            </button>
          </DialogFooter>
        </ResizableDialogContent>
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
                <label className="text-xs text-muted-foreground">Receive into GL account</label>
                <select value={receivedConfirmGlAccountId} onChange={e => setReceivedConfirmGlAccountId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1">
                  <option value="">No GL account (unlinked)</option>
                  {sortedCategoryList(categories.filter(c => c.type === 'asset')).map(c => (
                    <option key={c.id} value={c.id}>{c.parentId ? `\u2014 ${c.name}` : c.name}</option>
                  ))}
                </select>
                {!receivedConfirmGlAccountId && (
                  <p className="text-xs text-amber-500 mt-1">⚠ No GL account selected — balance sheet won&apos;t update</p>
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
            <button onClick={confirmMarkReceived} disabled={!receivedConfirmGlAccountId}
              className="rounded-md bg-green-600 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
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
              onToggleInvoice={handleToggleInvoice}
              att={att} />
          ))}
          {upcoming.map(e => (
            <IncomeRow key={e.id} entry={e} nextExpected={getNextExpected(e)} isOverdue={false}
              colCats={colCats} entryAmountForCat={entryAmountForCat} gridTemplate={gridTemplate}
              onEdit={openEdit} onDelete={handleDelete} onMarkReceived={handleMarkReceived}
              onToggleInvoice={handleToggleInvoice}
              att={att} />
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
  onEdit, onDelete, onMarkReceived, onToggleInvoice,
  att,
}: {
  entry: IncomeEntry; nextExpected: Date; isOverdue: boolean
  colCats: { id: string; name: string }[]
  entryAmountForCat: (entry: IncomeEntry, catId: string) => number
  gridTemplate: string
  onEdit: (e: IncomeEntry) => void; onDelete: (id: string) => void
  onMarkReceived: (e: IncomeEntry) => void
  onToggleInvoice: (e: IncomeEntry) => void
  att: ReturnType<typeof useAttachmentManager>
}) {
  const isOneOff         = entry.incomeType === 'one-off'
  const hasRemittance    = entry.invoiceReceived
  const isAttachmentOpen = att.openEntityId === entry.id
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
                <Receipt className="h-2.5 w-2.5" /> POSTED
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
          <button onClick={() => att.open(entry.id)}
            title={entry.attachments && entry.attachments.length > 0 ? `${entry.attachments.length} attachment${entry.attachments.length !== 1 ? 's' : ''}` : 'Attachments'}
            className={cn('relative p-1 hover:bg-accent rounded', isAttachmentOpen ? 'text-green-600' : entry.attachments && entry.attachments.length > 0 ? 'text-green-600' : 'text-muted-foreground')}>
            <Paperclip className="h-3.5 w-3.5" />
            {!isAttachmentOpen && entry.attachments && entry.attachments.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-green-500 text-white text-[9px] font-bold flex items-center justify-center leading-none px-0.5">
                {entry.attachments.length}
              </span>
            )}
          </button>
          <button onClick={() => onToggleInvoice(entry)} title={entry.invoiceReceived ? 'Unpost (reverse accrual)' : 'Post — post this income to journals'}
            className={cn('p-1 hover:bg-accent rounded', entry.invoiceReceived ? 'text-green-500' : 'text-amber-500')}>
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
        <AttachmentSection
          attachments={att.attachments}
          loading={att.loading}
          uploading={att.uploading}
          previewId={att.previewId}
          fileRef={att.fileRef}
          getAttachmentUrl={attId => `/api/finance/income/${entry.id}/attachments/${attId}`}
          onClose={att.close}
          onTogglePreview={att.togglePreview}
          onUpload={file => att.upload(entry.id, file)}
          onDelete={attId => att.remove(entry.id, attId)}
          firstUploadLabel="Upload Payslip"
          emptyMessage="No attachments yet — upload a payslip or remittance advice below."
        />
      )}
    </div>
  )
}
