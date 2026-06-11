'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { todayAU } from '@/lib/utils'
import { todayBoundsInTz, addLocalDays, addMonthsInTz, utcMidnightToLocalMidnight } from '@/lib/timezone'
import { type JournalFormLine, type GLAccount } from '@/components/finance/JournalLinesEditor'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Member   { id: string; name: string; email: string }
export interface Location { id: string; name: string }
export interface Vendor   { id: string; name: string; defaultCategory?: { id: string; name: string } | null }
export interface Entity   { id: string; name: string; color: string | null; type: string; isDefault: boolean }

export interface IncomeAttachment {
  id: string; incomeId: string; title: string; fileName: string
  fileSize: number; mimeType: string; createdAt: string
}

export interface PayslipComponent {
  label: string
  amount: number
}

export interface PayslipDeduction {
  label: string
  amount: number
  glAccountId: string | null
}

export interface PayslipFormData {
  enabled: boolean
  payPeriodStart: string
  payPeriodEnd: string
  grossPay: string
  netPay: string
  grossIncomeGlAccountId: string
  bankGlAccountId: string
  paygWithheld: string
  paygGlAccountId: string
  sgcAmount: string
  sgcGlAccountId: string
  sgcIncomeGlAccountId: string
  components: PayslipComponent[]
  deductions: PayslipDeduction[]
  notes: string
}

export interface StoredPayslip {
  id: string
  incomeEntryId: string
  grossPay: number
  netPay: number
  paygWithheld: number
  sgcAmount: number
  grossIncomeGlAccountId: string | null
  bankGlAccountId: string | null
  paygGlAccountId: string | null
  sgcGlAccountId: string | null
  sgcIncomeGlAccountId: string | null
  components: string  // JSON
  deductions: string  // JSON
  payPeriodStart: string | null
  payPeriodEnd: string | null
  notes: string | null
}

export interface IncomeEntry {
  id: string; name: string; amount: number; frequency: string
  incomeType: string
  nextExpectedDate: string; endDate: string | null; isActive: boolean
  received: boolean; receivedDate: string | null
  autoPay: boolean; emailReminder: boolean; reminderDays: number
  showOnCalendar: boolean
  dayOfMonth: number | null; monthOfYear: number | null
  recurrenceInterval: string | null
  invoiceReceived: boolean; invoiceReceivedDate: string | null
  isTaxTracked: boolean
  taxRate: number | null
  taxClassification: string | null
  notes: string | null; memberId: string | null
  journalEntryId: string | null
  actualAmountReceived: number | null
  templateId: string | null
  status: string | null
  payslip: StoredPayslip | null
  account: { id: string; name: string } | null
  category: { id: string; name: string; color: string | null } | null
  vendor: { id: string; name: string } | null
  member: Member | null
  location: Location | null
  entity: Entity | null
  parentIncomeId: string | null
  attachments?: IncomeAttachment[]
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useIncomeCrud() {
  const timezone = useFamilyTimezone()
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
  const [hideDeleteBills, setHideDeleteBills] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [voidConfirm, setVoidConfirm] = useState<{ id: string; name: string } | null>(null)
  const [voidNote, setVoidNote] = useState('')
  const [receivedConfirm, setReceivedConfirm] = useState<{ entry: IncomeEntry } | null>(null)
  const [receivedConfirmDate, setReceivedConfirmDate] = useState<string>('')
  const [receivedConfirmGlAccountId, setReceivedConfirmGlAccountId] = useState<string>('')
  const [receivedConfirmActualAmount, setReceivedConfirmActualAmount] = useState<string>('')
  const [payslipForm, setPayslipForm] = useState<PayslipFormData>({
    enabled: false,
    payPeriodStart: '', payPeriodEnd: '',
    grossPay: '', netPay: '',
    grossIncomeGlAccountId: '', bankGlAccountId: '',
    paygWithheld: '', paygGlAccountId: '',
    sgcAmount: '', sgcGlAccountId: '', sgcIncomeGlAccountId: '',
    components: [], deductions: [], notes: '',
  })
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
    accountId: '', categoryId: '', vendorId: '',
    dayOfMonth: '', monthOfYear: '',
    nextExpectedDate: todayAU(),
    endDate: '', autoPay: false, emailReminder: false, reminderDays: 3,
    showOnCalendar: true,
    notes: '', memberId: '', locationId: '',
    entityId: '',
    invoiceReceived: false, invoiceReceivedDate: '',
    recurrenceInterval: '',
    isTaxTracked: false,
    taxRate: '',
    taxClassification: '',
  }
  const [form, setForm] = useState(emptyForm)

  // ── Helpers ─────────────────────────────────────────────────────────────────

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
    const [aRes, cRes, glRes, mRes, lRes, vRes, eRes, sRes] = await Promise.all([
      fetch('/api/finance/accounts'),
      fetch('/api/finance/categories'),
      fetch('/api/finance/categories?forPicker=true'),
      fetch('/api/finance/members'),
      fetch('/api/finance/locations'),
      fetch('/api/finance/contacts'),
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
    if (sRes.ok) {
      const settings = await sRes.json()
      setHideDeleteBills(!!settings.uiPreferences?.hideDeleteBills)
    }
  }

  useEffect(() => { loadRefs() }, [])
  useEffect(() => { if (members.length > 0 || accounts.length > 0) load() }, [members, accounts])

  // ── Amount → journal lines mirror (GL-FIRST invariant) ──────────────────────
  // Only syncs while lines are in "default mirror" state (exactly 2 equal-amount lines).
  // Once a 3rd line is added or amounts diverge, lines are user-owned and never auto-edited.
  useEffect(() => {
    if (!showForm || form.amount <= 0) return
    if (journalLines.length !== 2) return
    const a0 = journalLines[0]?.amount ?? ''
    const a1 = journalLines[1]?.amount ?? ''
    const inMirror = a0 === a1
    if (!inMirror) return
    const target = form.amount.toFixed(2)
    if (a0 === target) return
    setJournalLines(lines => lines.map(l => ({ ...l, amount: target })))
  }, [form.amount, showForm]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── First credit GL → form.categoryId reverse-sync ──────────────────────────
  // Income: DR AR / CR Income. The credit line's GL is the income account,
  // which is the principal GL account kept in sync with form.categoryId.
  useEffect(() => {
    if (!showForm) return
    const firstCredit = journalLines.find(l => l.side === 'credit')
    const principalGl = firstCredit?.glAccountId ?? ''
    if (!principalGl) return // a blank primary line must never wipe an explicitly-set category
    if (principalGl === form.categoryId) return
    setForm(p => ({ ...p, categoryId: principalGl }))
  }, [journalLines, showForm]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Journal line default seeding ─────────────────────────────────────────────
  // Income: DR Accounts Receivable / CR income account

  function defaultIncomeLines(amount?: number, incomeCategoryId?: string): JournalFormLine[] {
    const amtStr = amount && amount > 0 ? amount.toFixed(2) : ''
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

  // ── Filter helpers ───────────────────────────────────────────────────────────

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

  // ── Form open/close ──────────────────────────────────────────────────────────

  function openNew() {
    setEditing(null); setForm(emptyForm); setErrors({})
    setJournalLines(defaultIncomeLines()); setJournalErrors({}); setShowForm(true)
  }

  async function openEdit(e: IncomeEntry) {
    setEditing(e)
    setErrors({})
    setJournalErrors({})
    if (e.journalEntryId) {
      const lines = await loadExistingJournalLines(e.journalEntryId)
      setJournalLines(lines)
    } else if (e.status === 'draft' && e.templateId) {
      // Legacy draft spawned before the journal-linking fix: load current
      // template lines so the user sees the correct GL split rather than
      // a plain 2-line default.
      try {
        const tmpl = await fetch(`/api/finance/templates/${e.templateId}`).then(r => r.json())
        if (Array.isArray(tmpl?.lines) && tmpl.lines.length >= 2) {
          setJournalLines(tmpl.lines.map((l: { glAccountId: string; side: string; amount: number; description?: string }) => ({
            glAccountId: l.glAccountId,
            side: l.side as 'debit' | 'credit',
            amount: l.amount,
            description: l.description ?? '',
          })))
        } else {
          setJournalLines(defaultIncomeLines(e.amount, e.category?.id))
        }
      } catch {
        setJournalLines(defaultIncomeLines(e.amount, e.category?.id))
      }
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
      nextExpectedDate: e.nextExpectedDate.split('T')[0],
      endDate: e.endDate ? e.endDate.split('T')[0] : '',
      autoPay: e.autoPay ?? false,
      emailReminder: e.emailReminder ?? false,
      reminderDays: e.reminderDays ?? 3,
      showOnCalendar: e.showOnCalendar ?? true,
      notes: e.notes ?? '', memberId: e.memberId ?? '',
      locationId: e.location?.id ?? '',
      entityId: e.entity?.id ?? '',
      invoiceReceived: e.invoiceReceived ?? false,
      invoiceReceivedDate: e.invoiceReceivedDate ? e.invoiceReceivedDate.split('T')[0] : '',
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
      invoiceReceivedDate: form.invoiceReceivedDate || null,
      isTaxTracked: form.isTaxTracked,
      taxRate: form.taxRate !== '' ? parseFloat(form.taxRate) : null,
      taxClassification: form.taxClassification || null,
    }
  }

  // ── GL-FIRST save ────────────────────────────────────────────────────────────

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); toast.error(Object.values(errs).join(' · ')); return }
    try {
      const payload = getFormPayload()

      // ── EDIT path ────────────────────────────────────────────────────────
      if (editing) {
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

        const isNewPost      = form.invoiceReceived && !editing.invoiceReceived
        const isDraftPersist = !editing.invoiceReceived && !form.invoiceReceived

        if (isNewPost || isDraftPersist) {
          const missingAccountIdx = journalLines.findIndex(
            l => (parseFloat(l.amount) || 0) > 0 && l.glAccountId.trim() === ''
          )
          if (missingAccountIdx !== -1) {
            toast.error(`Journal line ${missingAccountIdx + 1} has an amount but no GL account. Please select a GL account or remove the line before saving.`)
            return
          }
        }

        const linesToSubmit = (isNewPost || isDraftPersist)
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

        const body = {
          id: editing.id,
          ...payload,
          ...(serialisedLines.length >= 2 ? { journalLines: serialisedLines } : {}),
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
        closeForm(); load()
        return
      }

      // ── CREATE path ──────────────────────────────────────────────────────
      // Always create as draft (invoiceReceived: false). If the user ticked
      // "Posted to journals", a follow-up PATCH fires to trigger the atomic
      // GL-posting path in the PATCH handler — same as clicking Receipt after creation.
      const wantsPosted     = form.invoiceReceived
      const wantsPostedDate = form.invoiceReceivedDate || null

      const missingAccountIdx = journalLines.findIndex(
        l => (parseFloat(l.amount) || 0) > 0 && l.glAccountId.trim() === ''
      )
      if (missingAccountIdx !== -1) {
        toast.error(`Journal line ${missingAccountIdx + 1} has an amount but no GL account. Please select a GL account or remove the line before saving.`)
        return
      }

      const createLines = journalLines.filter(l => l.glAccountId.trim() !== '')

      if (createLines.length >= 2) {
        const drTotal = createLines.filter(l => l.side === 'debit').reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
        const crTotal = createLines.filter(l => l.side === 'credit').reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
        if (Math.abs(drTotal - crTotal) > 0.005) {
          toast.error(`Journal lines are not balanced — debits ${drTotal.toFixed(2)} ≠ credits ${crTotal.toFixed(2)}. Please fix the split before saving.`)
          return
        }
      }

      const serialisedCreateLines = createLines.map(l => ({
        glAccountId: l.glAccountId,
        side: l.side,
        amount: parseFloat(l.amount) || 0,
        description: l.description || null,
      }))

      const postRes = await fetch('/api/finance/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          invoiceReceived: false,
          ...(serialisedCreateLines.length >= 2 ? { journalLines: serialisedCreateLines } : {}),
        }),
      })
      if (!postRes.ok) {
        const err = await postRes.json().catch(() => ({ error: `Server error (${postRes.status})` }))
        toast.error(err.error ?? 'Failed to create income')
        return
      }
      const created = await postRes.json()

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
          const err = await patchRes.json().catch(() => ({ error: `Server error (${patchRes.status})` }))
          toast.warning(`Income saved as draft — GL posting failed: ${err.error ?? 'unknown error'}`)
          closeForm(); load()
          return
        }
      }

      toast.success('Income created')
      closeForm(); load()
    } catch (err) {
      console.error('[handleSave income]', err)
      toast.error('An unexpected error occurred. Check the browser console for details.')
    }
  }

  // ── Delete / void ────────────────────────────────────────────────────────────

  function handleDelete(id: string, name: string) { setDeleteConfirm({ id, name }) }

  async function confirmDelete() {
    if (!deleteConfirm) return
    const res = await fetch(`/api/finance/income?id=${deleteConfirm.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Income deleted'); setDeleteConfirm(null); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to delete') }
  }

  function handleVoid(id: string, name: string) { setVoidNote(''); setVoidConfirm({ id, name }) }

  async function confirmVoid() {
    if (!voidConfirm) return
    const res = await fetch('/api/finance/income', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: voidConfirm.id, void: true, voidNote }),
    })
    if (res.ok) { toast.success('Income voided'); setVoidConfirm(null); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to void') }
  }

  // ── Mark received ────────────────────────────────────────────────────────────

  async function handleMarkReceived(entry: IncomeEntry) {
    setReceivedConfirmDate(todayAU())
    setReceivedConfirmGlAccountId('')
    setReceivedConfirmActualAmount(entry.amount.toFixed(2))

    if (entry.payslip) {
      // Pre-populate from the spawned payslip so gross/PAYG/net survive to receipt
      const ps = entry.payslip
      let components: PayslipComponent[] = []
      let deductions: PayslipDeduction[] = []
      try { components = JSON.parse(ps.components) } catch { /* leave empty */ }
      try { deductions = JSON.parse(ps.deductions) } catch { /* leave empty */ }
      setPayslipForm({
        enabled: true,
        payPeriodStart: ps.payPeriodStart ? ps.payPeriodStart.split('T')[0] : '',
        payPeriodEnd:   ps.payPeriodEnd   ? ps.payPeriodEnd.split('T')[0]   : '',
        grossPay:               ps.grossPay.toFixed(2),
        netPay:                 ps.netPay.toFixed(2),
        grossIncomeGlAccountId: ps.grossIncomeGlAccountId ?? '',
        bankGlAccountId:        ps.bankGlAccountId        ?? '',
        paygWithheld:           ps.paygWithheld.toFixed(2),
        paygGlAccountId:        ps.paygGlAccountId        ?? '',
        sgcAmount:              ps.sgcAmount.toFixed(2),
        sgcGlAccountId:         ps.sgcGlAccountId         ?? '',
        sgcIncomeGlAccountId:   ps.sgcIncomeGlAccountId   ?? '',
        components,
        deductions,
        notes: ps.notes ?? '',
      })
      // Actual amount = net take-home (what hits the bank)
      setReceivedConfirmActualAmount(ps.netPay.toFixed(2))
    } else {
      setPayslipForm({
        enabled: false,
        payPeriodStart: '', payPeriodEnd: '',
        grossPay: entry.amount.toFixed(2),
        netPay: entry.amount.toFixed(2),
        grossIncomeGlAccountId: entry.category?.id ?? '',
        bankGlAccountId: '',
        paygWithheld: '0', paygGlAccountId: '',
        sgcAmount: '0', sgcGlAccountId: '', sgcIncomeGlAccountId: '',
        components: [], deductions: [], notes: '',
      })
    }
    setReceivedConfirm({ entry })
  }

  async function confirmMarkReceived() {
    if (!receivedConfirm) return
    const { entry } = receivedConfirm

    // Build request body — payslip mode or simple mode
    const body: Record<string, any> = {
      id: entry.id,
      received: true,
      receivedDate: receivedConfirmDate,
    }

    if (payslipForm.enabled) {
      // Payslip mode: send full breakdown, GL accounts come from payslip
      body.payslip = {
        grossPay:               parseFloat(payslipForm.grossPay) || 0,
        netPay:                 parseFloat(payslipForm.netPay) || 0,
        grossIncomeGlAccountId: payslipForm.grossIncomeGlAccountId || null,
        bankGlAccountId:        payslipForm.bankGlAccountId || null,
        paygWithheld:           parseFloat(payslipForm.paygWithheld) || 0,
        paygGlAccountId:        payslipForm.paygGlAccountId || null,
        sgcAmount:              parseFloat(payslipForm.sgcAmount) || 0,
        sgcGlAccountId:         payslipForm.sgcGlAccountId || null,
        sgcIncomeGlAccountId:   payslipForm.sgcIncomeGlAccountId || null,
        components:             payslipForm.components,
        deductions:             payslipForm.deductions,
        payPeriodStart:         payslipForm.payPeriodStart || null,
        payPeriodEnd:           payslipForm.payPeriodEnd || null,
        notes:                  payslipForm.notes || null,
      }
      body.actualAmountReceived = parseFloat(payslipForm.netPay) || 0
    } else {
      // Simple mode: just bank GL account + optional actual amount
      body.receiveToGlAccountId = receivedConfirmGlAccountId || null
      const actual = parseFloat(receivedConfirmActualAmount)
      if (!isNaN(actual) && Math.abs(actual - entry.amount) > 0.005) {
        body.actualAmountReceived = actual
      }
    }

    const res = await fetch('/api/finance/income', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { toast.success('Income marked as received'); setReceivedConfirm(null); load() }
    else {
      const err = await res.json().catch(() => ({ error: `Server error (${res.status})` }))
      toast.error(err.error ?? 'Failed to mark as received')
    }
  }

  async function handleToggleInvoice(entry: IncomeEntry) {
    const newVal = !entry.invoiceReceived
    if (!newVal && entry.invoiceReceived) {
      if (!confirm(`Unpost "${entry.name}"? This will reverse the accrual journal entry and remove the pending income transaction.`)) return
    }
    const res = await fetch('/api/finance/income', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, invoiceReceived: newVal }),
    })
    if (res.ok) { toast.success(newVal ? 'Income posted to journals' : 'Income unposted'); load() }
    else { const err = await res.json().catch(() => ({})); toast.error(err.error ?? 'Failed to update posting status') }
  }

  // ── Category / vendor change ─────────────────────────────────────────────────

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
    setForm(p => ({ ...p, vendorId }))
    // A vendor pick drives the primary GL account (line + category) unconditionally — last action wins.
    if (vendor?.defaultCategory) handleCategoryChange(vendor.defaultCategory.id)
  }

  // ── Per-entry helpers ────────────────────────────────────────────────────────

  function getNextExpected(entry: IncomeEntry): Date { return new Date(entry.nextExpectedDate) }

  function entryAmountForCat(entry: IncomeEntry, rootCatId: string): number {
    if (!entry.category) return 0
    const cat = categories.find(c => c.id === entry.category!.id)
    if (!cat) return 0
    if (cat.id === rootCatId || cat.parentId === rootCatId) return entry.amount
    return 0
  }

  // ── Derived list state ───────────────────────────────────────────────────────

  function toLocalMidnight(d: Date): Date {
    return utcMidnightToLocalMidnight(d, timezone)
  }

  function isTrulyOverdue(e: IncomeEntry): boolean {
    const due = toLocalMidnight(new Date(e.nextExpectedDate))
    if (due >= todayStart) return false
    if (e.incomeType === 'one-off') return false
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

  const rootCategories = categories.filter(c => !c.parentId && c.type === 'income')
  const todayStart = todayBoundsInTz(timezone).start
  const rangeEnd   = dateRange === '14' ? addLocalDays(todayStart, 14, timezone)
    : dateRange === '30' ? addLocalDays(todayStart, 30, timezone)
    : dateRange === '12months' ? addMonthsInTz(todayStart, 12, timezone)
    : addMonthsInTz(todayStart, 3, timezone)

  const activeEntries = entries.filter(e => e.isActive && !e.received)

  const overdue       = activeEntries.filter(isTrulyOverdue)
  const overdueOneOff = activeEntries.filter(e => e.incomeType === 'one-off' && toLocalMidnight(new Date(e.nextExpectedDate)) < todayStart)
  const upcoming      = activeEntries.filter(e => {
    const due = toLocalMidnight(new Date(e.nextExpectedDate))
    return due >= todayStart && due <= rangeEnd
  })
  // Spawned child entries land exactly 1 period after the paid entry.
  // Show them in "Scheduled" so nothing correctly spawned becomes invisible.
  const futureScheduled = activeEntries.filter(e => {
    const due = toLocalMidnight(new Date(e.nextExpectedDate))
    return due > rangeEnd && e.incomeType !== 'one-off'
  })
  const visibleEntries = [...overdue, ...upcoming]
  const colCats        = rootCategories.filter(c => selectedCatIds.includes(c.id))
  const grandTotal     = visibleEntries.reduce((s, e) => s + e.amount, 0)
  const catTotals: Record<string, number> = {}
  for (const catId of selectedCatIds) {
    catTotals[catId] = visibleEntries.reduce((s, e) => s + entryAmountForCat(e, catId), 0)
  }
  const gridTemplate = `2.25rem 1fr${colCats.map(() => ' 6.5rem').join('')} 7rem 8.5rem`

  // cycleMs is computed but not exposed — kept for potential future use without eslint warnings
  void cycleMs

  return {
    // Core state
    entries, loading, showForm, editing,
    journalLines, setJournalLines,
    journalErrors, setJournalErrors,
    // Form
    form, setForm, errors,
    // Reference data
    accounts, categories, glAccounts, members, locations, vendors, entities,
    // Confirmation dialogs
    deleteConfirm, setDeleteConfirm,
    voidConfirm, setVoidConfirm,
    voidNote, setVoidNote,
    receivedConfirm, setReceivedConfirm,
    receivedConfirmDate, setReceivedConfirmDate,
    receivedConfirmGlAccountId, setReceivedConfirmGlAccountId,
    receivedConfirmActualAmount, setReceivedConfirmActualAmount,
    payslipForm, setPayslipForm,
    // Filter state
    dateRange, setDateRangePersisted,
    selectedCatIds, showCatPicker, setShowCatPicker, toggleCat,
    hideDeleteBills,
    // Derived list data
    rootCategories, overdue, overdueOneOff, upcoming, futureScheduled, visibleEntries,
    colCats, grandTotal, catTotals, gridTemplate,
    // Actions
    openNew, openEdit, closeForm,
    handleSave, handleDelete, confirmDelete,
    handleVoid, confirmVoid,
    handleMarkReceived, confirmMarkReceived,
    handleToggleInvoice,
    handleCategoryChange, handleVendorChange,
    getNextExpected, entryAmountForCat,
  }
}
