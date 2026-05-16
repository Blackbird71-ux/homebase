'use client'

import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, RefreshCw, AlertTriangle,
  TrendingDown, TrendingUp, CalendarClock, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { addDays, addWeeks, addMonths, setDate, getDaysInMonth, format } from 'date-fns'
import {
  Dialog, DialogHeader, DialogTitle, DialogFooter,
  ResizableDialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { todayAU } from '@/lib/utils'
import { sortedCategoryList } from '@/lib/finance-categories'
import { JournalLinesEditor } from '@/components/finance/JournalLinesEditor'
import type { JournalFormLine, GLAccount } from '@/components/finance/JournalLinesEditor'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'Overview' | 'Frequency' | 'Transaction'

interface ContactRow   { id: string; name: string }
interface AccountRow   { id: string; name: string }
interface CategoryRow  { id: string; name: string; type: string; parentId: string | null }
interface EntityRow    { id: string; name: string; color: string | null }
interface MemberRow    { id: string; name: string }
interface LocationRow  { id: string; name: string }

interface PayslipLine  { label: string; amount: string; glAccountId: string }

interface FormState {
  // Overview
  kind: 'bill' | 'income'
  name: string
  enabled: boolean
  createAutomatically: boolean
  notifyOnCreate: boolean
  counterpartyId: string
  accountId: string
  categoryId: string
  entityId: string
  locationId: string
  memberId: string
  createInAdvanceDays: string
  remindInAdvanceDays: string
  defaultDueOffsetDays: string
  notes: string
  // Frequency
  frequency: string
  interval: string
  dayOfMonth: string
  monthOfYear: string
  startDate: string
  firstDueDate: string
  endMode: string
  endDate: string
  totalOccurrences: string
  // Transaction
  lines: JournalFormLine[]
  isTaxTracked: boolean
  taxRate: string
  taxClassification: string
  payslipEnabled: boolean
  grossPay: string
  netPay: string
  grossIncomeGlAccountId: string
  bankGlAccountId: string
  paygWithheld: string
  paygGlAccountId: string
  sgcAmount: string
  sgcGlAccountId: string
  payslipComponents: PayslipLine[]
  payslipDeductions: PayslipLine[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TemplateRow = Record<string, any>

// ── Constants ─────────────────────────────────────────────────────────────────

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly',
  bimonthly: 'Every 2 months', quarterly: 'Quarterly',
  halfyearly: 'Half-yearly', yearly: 'Yearly', custom: 'Custom',
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const emptyForm: FormState = {
  kind: 'bill',
  name: '',
  enabled: true,
  createAutomatically: true,
  notifyOnCreate: false,
  counterpartyId: '',
  accountId: '',
  categoryId: '',
  entityId: '',
  locationId: '',
  memberId: '',
  createInAdvanceDays: '7',
  remindInAdvanceDays: '',
  defaultDueOffsetDays: '0',
  notes: '',
  frequency: 'monthly',
  interval: '1',
  dayOfMonth: '',
  monthOfYear: '',
  startDate: todayAU(),
  firstDueDate: todayAU(),
  endMode: 'forever',
  endDate: '',
  totalOccurrences: '',
  lines: [
    { glAccountId: '', side: 'debit',  amount: '', description: '' },
    { glAccountId: '', side: 'credit', amount: '', description: '' },
  ],
  isTaxTracked: false,
  taxRate: '',
  taxClassification: '',
  payslipEnabled: false,
  grossPay: '',
  netPay: '',
  grossIncomeGlAccountId: '',
  bankGlAccountId: '',
  paygWithheld: '',
  paygGlAccountId: '',
  sgcAmount: '',
  sgcGlAccountId: '',
  payslipComponents: [],
  payslipDeductions: [],
}

// ── Template "last used" defaults (persisted in localStorage) ─────────────────

const TEMPLATE_DEFAULTS_KEY = 'finance_template_defaults'

type TemplateDefaults = Pick<FormState,
  'accountId' | 'entityId' | 'memberId' | 'locationId' |
  'createInAdvanceDays' | 'remindInAdvanceDays' | 'defaultDueOffsetDays' |
  'createAutomatically' | 'notifyOnCreate'
>

function loadTemplateDefaults(): TemplateDefaults | null {
  try {
    const raw = localStorage.getItem(TEMPLATE_DEFAULTS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveTemplateDefaults(form: FormState) {
  try {
    const defaults: TemplateDefaults = {
      accountId: form.accountId,
      entityId: form.entityId,
      memberId: form.memberId,
      locationId: form.locationId,
      createInAdvanceDays: form.createInAdvanceDays,
      remindInAdvanceDays: form.remindInAdvanceDays,
      defaultDueOffsetDays: form.defaultDueOffsetDays,
      createAutomatically: form.createAutomatically,
      notifyOnCreate: form.notifyOnCreate,
    }
    localStorage.setItem(TEMPLATE_DEFAULTS_KEY, JSON.stringify(defaults))
  } catch { /* ignore */ }
}

// ── Client-side occurrence preview ────────────────────────────────────────────
// Replicates the server-side logic without node:crypto.

function applyDayOfMonth(d: Date, day: number): Date {
  const max = getDaysInMonth(d)
  return setDate(d, Math.min(Math.max(1, day), max))
}

function nextOccurrence(
  from: Date,
  freq: string,
  interval: number,
  dayOfMonth: number | null,
  monthOfYear: number | null,
): Date {
  let next: Date
  switch (freq) {
    case 'weekly':      next = addWeeks(from, interval); break
    case 'fortnightly': next = addWeeks(from, 2 * interval); break
    case 'monthly':     next = addMonths(from, interval); break
    case 'bimonthly':   next = addMonths(from, 2 * interval); break
    case 'quarterly':   next = addMonths(from, 3 * interval); break
    case 'halfyearly':  next = addMonths(from, 6 * interval); break
    case 'yearly':      next = addMonths(from, 12 * interval); break
    case 'custom':      next = addDays(from, interval); break
    default:            next = addMonths(from, interval)
  }
  const snapFreqs = ['monthly', 'bimonthly', 'quarterly', 'halfyearly', 'yearly']
  if (dayOfMonth && snapFreqs.includes(freq)) {
    next = applyDayOfMonth(next, dayOfMonth)
  }
  if (monthOfYear && freq === 'yearly') {
    next = new Date(next.getFullYear(), monthOfYear - 1, next.getDate())
    if (dayOfMonth) next = applyDayOfMonth(next, dayOfMonth)
  }
  return next
}

function previewOccurrences(
  startDate: Date,
  freq: string,
  interval: number,
  dayOfMonth: number | null,
  monthOfYear: number | null,
  endMode: string,
  endDate: Date | null,
  totalOccurrences: number | null,
  count: number,
): Date[] {
  const cap = endMode === 'for_n_occurrences' && totalOccurrences
    ? Math.min(count, totalOccurrences)
    : count
  const result: Date[] = []
  let cur = startDate
  while (result.length < cap) {
    if (endMode === 'until' && endDate && cur > endDate) break
    result.push(cur)
    if (result.length < cap) {
      cur = nextOccurrence(cur, freq, interval, dayOfMonth, monthOfYear)
    }
  }
  return result
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function templateToForm(t: TemplateRow): FormState {
  return {
    kind: t.kind as 'bill' | 'income',
    name: t.name,
    enabled: t.enabled,
    createAutomatically: t.createAutomatically,
    notifyOnCreate: t.notifyOnCreate,
    counterpartyId: t.counterpartyId ?? '',
    accountId: t.accountId ?? '',
    categoryId: t.categoryId ?? '',
    entityId: t.entityId ?? '',
    locationId: t.locationId ?? '',
    memberId: t.memberId ?? '',
    createInAdvanceDays: String(t.createInAdvanceDays ?? 0),
    remindInAdvanceDays: t.remindInAdvanceDays != null ? String(t.remindInAdvanceDays) : '',
    defaultDueOffsetDays: String(t.defaultDueOffsetDays ?? 0),
    notes: t.notes ?? '',
    frequency: t.frequency,
    interval: String(t.interval ?? 1),
    dayOfMonth: t.dayOfMonth != null ? String(t.dayOfMonth) : '',
    monthOfYear: t.monthOfYear != null ? String(t.monthOfYear) : '',
    startDate: (t.startDate as string).slice(0, 10),
    firstDueDate: (() => {
      const sd = new Date((t.startDate as string).slice(0, 10) + 'T00:00:00')
      const offset = parseInt(t.defaultDueOffsetDays ?? '0') || 0
      if (offset === 0) return (t.startDate as string).slice(0, 10)
      const due = new Date(sd.getTime() + offset * 86_400_000)
      return due.toISOString().slice(0, 10)
    })(),
    endMode: t.endMode ?? 'forever',
    endDate: t.endDate ? (t.endDate as string).slice(0, 10) : '',
    totalOccurrences: t.totalOccurrences != null ? String(t.totalOccurrences) : '',
    lines: (t.lines ?? []).map((l: TemplateRow) => ({
      glAccountId: l.glAccountId,
      side: l.side as 'debit' | 'credit',
      amount: String(l.amount),
      description: l.description ?? '',
    })),
    isTaxTracked: t.isTaxTracked ?? false,
    taxRate: t.taxRate != null ? String(t.taxRate) : '',
    taxClassification: t.taxClassification ?? '',
    payslipEnabled: t.payslipEnabled ?? false,
    grossPay: t.grossPay != null ? String(t.grossPay) : '',
    netPay: t.netPay != null ? String(t.netPay) : '',
    grossIncomeGlAccountId: t.grossIncomeGlAccountId ?? '',
    bankGlAccountId: t.bankGlAccountId ?? '',
    paygWithheld: t.paygWithheld != null ? String(t.paygWithheld) : '',
    paygGlAccountId: t.paygGlAccountId ?? '',
    sgcAmount: t.sgcAmount != null ? String(t.sgcAmount) : '',
    sgcGlAccountId: t.sgcGlAccountId ?? '',
    payslipComponents: t.payslipComponents
      ? (JSON.parse(t.payslipComponents) as PayslipLine[])
      : [],
    payslipDeductions: t.payslipDeductions
      ? (JSON.parse(t.payslipDeductions) as PayslipLine[])
      : [],
  }
}

function formToBody(form: FormState) {
  return {
    kind: form.kind,
    name: form.name,
    enabled: form.enabled,
    createAutomatically: form.createAutomatically,
    notifyOnCreate: form.notifyOnCreate,
    counterpartyId: form.counterpartyId || null,
    accountId: form.accountId || null,
    categoryId: form.categoryId || null,
    entityId: form.entityId || null,
    locationId: form.locationId || null,
    memberId: form.memberId || null,
    createInAdvanceDays: parseInt(form.createInAdvanceDays) || 0,
    remindInAdvanceDays: form.remindInAdvanceDays ? parseInt(form.remindInAdvanceDays) : null,
    defaultDueOffsetDays: parseInt(form.defaultDueOffsetDays) || 0,
    notes: form.notes || null,
    frequency: form.frequency,
    interval: parseInt(form.interval) || 1,
    dayOfMonth: form.dayOfMonth ? parseInt(form.dayOfMonth) : null,
    monthOfYear: form.monthOfYear ? parseInt(form.monthOfYear) : null,
    startDate: form.startDate,
    endMode: form.endMode,
    endDate: form.endDate || null,
    totalOccurrences: form.totalOccurrences ? parseInt(form.totalOccurrences) : null,
    isTaxTracked: form.isTaxTracked,
    taxRate: form.taxRate ? parseFloat(form.taxRate) : null,
    taxClassification: form.taxClassification || null,
    payslipEnabled: form.payslipEnabled,
    grossPay: form.grossPay ? parseFloat(form.grossPay) : null,
    netPay: form.netPay ? parseFloat(form.netPay) : null,
    grossIncomeGlAccountId: form.grossIncomeGlAccountId || null,
    bankGlAccountId: form.bankGlAccountId || null,
    paygWithheld: form.paygWithheld ? parseFloat(form.paygWithheld) : null,
    paygGlAccountId: form.paygGlAccountId || null,
    sgcAmount: form.sgcAmount ? parseFloat(form.sgcAmount) : null,
    sgcGlAccountId: form.sgcGlAccountId || null,
    payslipComponents: form.payslipComponents.length > 0 ? form.payslipComponents : null,
    payslipDeductions: form.payslipDeductions.length > 0 ? form.payslipDeductions : null,
    lines: form.lines.map((l, i) => ({
      description: l.description || '',
      amount: parseFloat(l.amount) || 0,
      unitPrice: parseFloat(l.amount) || 0,
      qty: 1,
      side: l.side,
      glAccountId: l.glAccountId,
      sortOrder: i,
    })),
  }
}

function validate(form: FormState): Record<string, string> {
  const e: Record<string, string> = {}
  if (!form.name.trim()) e.name = 'Name is required'
  if (!form.startDate) e.startDate = 'Start date is required'
  if (form.frequency === 'custom' && (!form.interval || parseInt(form.interval) < 1)) {
    e.interval = 'Interval must be at least 1 day'
  }
  if (form.endMode === 'until' && !form.endDate) {
    e.endDate = 'End date is required'
  }
  if (form.endMode === 'for_n_occurrences' && (!form.totalOccurrences || parseInt(form.totalOccurrences) < 1)) {
    e.totalOccurrences = 'Must be at least 1'
  }
  if (form.lines.length === 0) {
    e.lines = 'At least one journal line is required'
  }
  form.lines.forEach((l, i) => {
    if (!l.glAccountId) e[`line_${i}_account`] = 'Select an account'
    const amt = parseFloat(l.amount)
    if (isNaN(amt) || amt < 0) e[`line_${i}_amount`] = 'Enter a valid amount'
  })
  if (form.lines.length >= 2) {
    let dr = 0, cr = 0
    form.lines.forEach(l => {
      const a = parseFloat(l.amount) || 0
      if (l.side === 'debit') dr += a
      else cr += a
    })
    if (Math.abs(dr - cr) > 0.005) e.balance = 'Lines must balance (debits = credits)'
  }
  if (form.payslipEnabled && form.kind === 'income') {
    if (!form.grossIncomeGlAccountId) e.grossIncomeGlAccountId = 'Required for payslip mode'
    if (!form.bankGlAccountId) e.bankGlAccountId = 'Required for payslip mode'
  }
  return e
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function useTemplatesCrud() {
  const [templates, setTemplates]   = useState<TemplateRow[]>([])
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [contacts, setContacts]     = useState<ContactRow[]>([])
  const [accounts, setAccounts]     = useState<AccountRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [entities, setEntities]     = useState<EntityRow[]>([])
  const [members, setMembers]       = useState<MemberRow[]>([])
  const [locations, setLocations]   = useState<LocationRow[]>([])

  const [form, setForm]       = useState<FormState>(emptyForm)
  const [errors, setErrors]   = useState<Record<string, string>>({})
  const [tab, setTab]         = useState<Tab>('Overview')
  const [saving, setSaving]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]   = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TemplateRow | null>(null)

  async function load() {
    const res = await fetch('/api/finance/templates?includeDisabled=true')
    if (res.ok) setTemplates(await res.json())
  }

  async function loadRefs() {
    const [aRes, catRes, conRes, entRes, memRes, locRes] = await Promise.all([
      fetch('/api/finance/accounts'),
      fetch('/api/finance/categories'),
      fetch('/api/finance/contacts'),
      fetch('/api/finance/entities'),
      fetch('/api/finance/members'),
      fetch('/api/finance/locations'),
    ])
    if (aRes.ok)   setAccounts(await aRes.json())
    if (catRes.ok) {
      const cats = await catRes.json()
      setCategories(cats)
      setGlAccounts(cats)
    }
    if (conRes.ok) setContacts(await conRes.json())
    if (entRes.ok) setEntities(await entRes.json())
    if (memRes.ok) setMembers(await memRes.json())
    if (locRes.ok) setLocations(await locRes.json())
  }

  useEffect(() => { loadRefs() }, [])
  useEffect(() => { if (glAccounts.length > 0) load() }, [glAccounts])

  function openCreate() {
    const saved = loadTemplateDefaults()
    setForm(saved ? { ...emptyForm, ...saved } : emptyForm)
    setErrors({})
    setTab('Overview')
    setEditId(null)
    setShowForm(true)
  }

  function openEdit(t: TemplateRow) {
    setForm(templateToForm(t))
    setErrors({})
    setTab('Overview')
    setEditId(t.id)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
  }

  async function handleSave() {
    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      // Jump to the first tab with errors
      const hasOverview = errs.name
      const hasFrequency = errs.startDate || errs.interval || errs.endDate || errs.totalOccurrences
      if (hasOverview) setTab('Overview')
      else if (hasFrequency) setTab('Frequency')
      else setTab('Transaction')
      return
    }
    setSaving(true)
    try {
      const body = formToBody(form)
      const url  = editId ? `/api/finance/templates/${editId}` : '/api/finance/templates'
      const method = editId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Save failed')
        return
      }
      toast.success(editId ? 'Template updated' : 'Template created')
      saveTemplateDefaults(form)
      closeForm()
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleEnabled(t: TemplateRow) {
    const res = await fetch(`/api/finance/templates/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !t.enabled }),
    })
    if (res.ok) {
      toast.success(t.enabled ? 'Template disabled' : 'Template enabled')
      await load()
    } else {
      toast.error('Failed to update template')
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/finance/templates/${id}`, { method: 'DELETE' })
    if (res.ok) {
      const data = await res.json()
      toast.success(
        data.orphanedDrafts > 0
          ? `Template deleted. ${data.orphanedDrafts} draft(s) remain but are no longer linked.`
          : 'Template deleted',
      )
      setDeleteTarget(null)
      await load()
    } else {
      toast.error('Failed to delete template')
    }
  }

  return {
    templates, glAccounts, contacts, accounts, categories, entities, members, locations,
    form, setForm, errors, setErrors, tab, setTab,
    saving, showForm, editId, deleteTarget, setDeleteTarget,
    openCreate, openEdit, closeForm, handleSave, handleToggleEnabled, handleDelete,
  }
}

// ── GL account select helper ──────────────────────────────────────────────────

function GLAccountSelect({
  value, onChange, glAccounts, placeholder = 'Select account…', className,
}: {
  value: string
  onChange: (v: string) => void
  glAccounts: GLAccount[]
  placeholder?: string
  className?: string
}) {
  const grouped = useMemo(() => {
    const typeOrder = ['asset', 'liability', 'equity', 'income', 'expense']
    const result: GLAccount[] = []
    for (const type of typeOrder) {
      const roots = glAccounts.filter(a => a.type === type && !a.parentId).sort((a, b) => a.name.localeCompare(b.name))
      const children = glAccounts.filter(a => a.type === type && a.parentId).sort((a, b) => a.name.localeCompare(b.name))
      for (const root of roots) {
        result.push(root)
        result.push(...children.filter(c => c.parentId === root.id))
      }
    }
    return result
  }, [glAccounts])

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={cn('w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm', className)}
    >
      <option value="">{placeholder}</option>
      {(['asset', 'liability', 'equity', 'income', 'expense'] as const).map(type => {
        const group = grouped.filter(a => a.type === type)
        if (!group.length) return null
        return (
          <optgroup key={type} label={type.charAt(0).toUpperCase() + type.slice(1)}>
            {group.map(a => (
              <option key={a.id} value={a.id}>
                {a.parentId ? '— ' : ''}{a.glCode ? `[${a.glCode}] ` : ''}{a.name}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  form, setForm, errors, isEdit,
  contacts, accounts, categories, entities, members, locations,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  errors: Record<string, string>
  isEdit: boolean
  contacts: ContactRow[]
  accounts: AccountRow[]
  categories: CategoryRow[]
  entities: EntityRow[]
  members: MemberRow[]
  locations: LocationRow[]
}) {
  const set = (field: keyof FormState, value: unknown) =>
    setForm(p => ({ ...p, [field]: value }))

  const categoryOptions = useMemo(
    () => sortedCategoryList(
      categories.filter(c => form.kind === 'bill' ? c.type === 'expense' : c.type === 'income')
    ),
    [categories, form.kind],
  )

  return (
    <div className="space-y-2.5 p-4">
      {/* Kind toggle — locked on edit */}
      <div>
        <label className="block text-xs font-medium mb-1.5">Type</label>
        <div className="flex gap-3">
          {(['bill', 'income'] as const).map(k => (
            <label key={k} className={cn(
              'flex items-center gap-2 text-sm cursor-pointer',
              isEdit && 'opacity-50 pointer-events-none',
            )}>
              <input
                type="radio"
                name="kind"
                value={k}
                checked={form.kind === k}
                onChange={() => set('kind', k)}
                className="accent-primary"
                disabled={isEdit}
              />
              {k === 'bill'
                ? <><TrendingDown className="h-3.5 w-3.5 text-red-500" /> Bill</>
                : <><TrendingUp className="h-3.5 w-3.5 text-green-600" /> Income</>
              }
            </label>
          ))}
        </div>
        {isEdit && <p className="text-xs text-muted-foreground mt-1">Type cannot be changed after creation.</p>}
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs font-medium mb-1">Name <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="e.g. Monthly mortgage, Weekly groceries…"
          className={cn(
            'w-full rounded-md border bg-background px-2 py-1.5 text-sm',
            errors.name ? 'border-red-500' : 'border-input',
          )}
        />
        {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
      </div>

      {/* Settings row */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} className="accent-primary" />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.createAutomatically} onChange={e => set('createAutomatically', e.target.checked)} className="accent-primary" />
          Auto-create drafts
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.notifyOnCreate} onChange={e => set('notifyOnCreate', e.target.checked)} className="accent-primary" />
          Notify on create
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {/* Counterparty */}
        <div>
          <label className="block text-xs font-medium mb-1">
            {form.kind === 'bill' ? 'Vendor / Payee' : 'Payer / Source'}
          </label>
          <select
            value={form.counterpartyId}
            onChange={e => set('counterpartyId', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">None</option>
            {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Bank account */}
        <div>
          <label className="block text-xs font-medium mb-1">Bank Account</label>
          <select
            value={form.accountId}
            onChange={e => set('accountId', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">None</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs font-medium mb-1">
            {form.kind === 'bill' ? 'Expense Category' : 'Income Category'}
          </label>
          <select
            value={form.categoryId}
            onChange={e => set('categoryId', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">None</option>
            {categoryOptions.map(c => (
              <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{c.name}</option>
            ))}
          </select>
        </div>

        {/* Entity */}
        <div>
          <label className="block text-xs font-medium mb-1">Entity / Fund</label>
          <select
            value={form.entityId}
            onChange={e => set('entityId', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">None</option>
            {entities.map(en => <option key={en.id} value={en.id}>{en.name}</option>)}
          </select>
        </div>

        {/* Member */}
        <div>
          <label className="block text-xs font-medium mb-1">Assigned To</label>
          <select
            value={form.memberId}
            onChange={e => set('memberId', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">None</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        {/* Location */}
        <div>
          <label className="block text-xs font-medium mb-1">Location</label>
          <select
            value={form.locationId}
            onChange={e => set('locationId', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">None</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        {/* Create in advance */}
        <div>
          <label className="block text-xs font-medium mb-1">Create draft … days in advance</label>
          <input
            type="number"
            min="0"
            value={form.createInAdvanceDays}
            onChange={e => set('createInAdvanceDays', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>

        {/* Remind in advance */}
        <div>
          <label className="block text-xs font-medium mb-1">Remind … days in advance (optional)</label>
          <input
            type="number"
            min="0"
            value={form.remindInAdvanceDays}
            onChange={e => set('remindInAdvanceDays', e.target.value)}
            placeholder="No reminder"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>

        {/* Due offset (bills only) — computed from Frequency tab dates */}
        {form.kind === 'bill' && parseInt(form.defaultDueOffsetDays) > 0 && (
          <div>
            <p className="text-xs text-muted-foreground">
              Payment due <strong>{form.defaultDueOffsetDays} day{parseInt(form.defaultDueOffsetDays) !== 1 ? 's' : ''}</strong> after bill date — set via the <em>Frequency</em> tab.
            </p>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium mb-1">Notes</label>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          rows={2}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm resize-none"
        />
      </div>
    </div>
  )
}

// ── Frequency tab ─────────────────────────────────────────────────────────────

function FrequencyTab({
  form, setForm, errors,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  errors: Record<string, string>
}) {
  const set = (field: keyof FormState, value: unknown) =>
    setForm(p => ({ ...p, [field]: value }))

  const showInterval   = form.frequency === 'custom'
  const showDayOfMonth = ['monthly', 'bimonthly', 'quarterly', 'halfyearly', 'yearly'].includes(form.frequency)
  const showMonthOfYear = form.frequency === 'yearly'

  const preview = useMemo(() => {
    if (!form.startDate) return []
    try {
      return previewOccurrences(
        new Date(form.startDate + 'T00:00:00'),
        form.frequency,
        parseInt(form.interval) || 1,
        form.dayOfMonth ? parseInt(form.dayOfMonth) : null,
        form.monthOfYear ? parseInt(form.monthOfYear) : null,
        form.endMode,
        form.endDate ? new Date(form.endDate + 'T00:00:00') : null,
        form.totalOccurrences ? parseInt(form.totalOccurrences) : null,
        6,
      )
    } catch {
      return []
    }
  }, [form.startDate, form.frequency, form.interval, form.dayOfMonth, form.monthOfYear,
      form.endMode, form.endDate, form.totalOccurrences])

  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {/* Frequency */}
        <div>
          <label className="block text-xs font-medium mb-1">Frequency <span className="text-red-500">*</span></label>
          <select
            value={form.frequency}
            onChange={e => set('frequency', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {/* Interval (custom only) */}
        {showInterval && (
          <div>
            <label className="block text-xs font-medium mb-1">Every … days <span className="text-red-500">*</span></label>
            <input
              type="number"
              min="1"
              value={form.interval}
              onChange={e => set('interval', e.target.value)}
              className={cn(
                'w-full rounded-md border bg-background px-2 py-1.5 text-sm',
                errors.interval ? 'border-red-500' : 'border-input',
              )}
            />
            {errors.interval && <p className="text-xs text-red-500 mt-0.5">{errors.interval}</p>}
          </div>
        )}

        {/* Day of month */}
        {showDayOfMonth && (
          <div>
            <label className="block text-xs font-medium mb-1">Day of month</label>
            <input
              type="number"
              min="1"
              max="31"
              value={form.dayOfMonth}
              onChange={e => set('dayOfMonth', e.target.value)}
              placeholder="Same as start date"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            <p className="text-xs text-muted-foreground mt-0.5">1–31. Snaps to month-end if month is shorter.</p>
          </div>
        )}

        {/* Month of year (yearly) */}
        {showMonthOfYear && (
          <div>
            <label className="block text-xs font-medium mb-1">Month</label>
            <select
              value={form.monthOfYear}
              onChange={e => set('monthOfYear', e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Same month as start date</option>
              {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
        )}

        {/* Start date = first bill / invoice date */}
        <div>
          <label className="block text-xs font-medium mb-1">
            {form.kind === 'bill' ? 'First bill date' : 'Start date'} <span className="text-red-500">*</span>
          </label>
          {form.kind === 'bill' && (
            <p className="text-xs text-muted-foreground mb-1">The date the invoice is received — hits P&amp;L and AP from this date.</p>
          )}
          <input
            type="date"
            value={form.startDate}
            onChange={e => {
              const newStart = e.target.value
              set('startDate', newStart)
              // Keep the due date offset: if firstDueDate was in sync, advance it too
              if (form.startDate && form.firstDueDate && newStart) {
                const oldOffset = Math.max(0, Math.round(
                  (new Date(form.firstDueDate + 'T00:00:00').getTime() - new Date(form.startDate + 'T00:00:00').getTime()) / 86_400_000
                ))
                const newDue = new Date(new Date(newStart + 'T00:00:00').getTime() + oldOffset * 86_400_000)
                setForm(p => ({
                  ...p,
                  startDate: newStart,
                  firstDueDate: newDue.toISOString().slice(0, 10),
                }))
              }
            }}
            className={cn(
              'w-full rounded-md border bg-background px-2 py-1.5 text-sm',
              errors.startDate ? 'border-red-500' : 'border-input',
            )}
          />
          {errors.startDate && <p className="text-xs text-red-500 mt-0.5">{errors.startDate}</p>}
        </div>

        {/* First due date (bills only) — drives defaultDueOffsetDays */}
        {form.kind === 'bill' && (
          <div>
            <label className="block text-xs font-medium mb-1">First payment due date</label>
            <p className="text-xs text-muted-foreground mb-1">When the first payment is due. Sets the bill-to-due gap for all occurrences.</p>
            <input
              type="date"
              value={form.firstDueDate}
              min={form.startDate}
              onChange={e => {
                const dueVal = e.target.value
                const offsetDays = form.startDate && dueVal
                  ? Math.max(0, Math.round(
                      (new Date(dueVal + 'T00:00:00').getTime() - new Date(form.startDate + 'T00:00:00').getTime()) / 86_400_000
                    ))
                  : 0
                setForm(p => ({ ...p, firstDueDate: dueVal, defaultDueOffsetDays: String(offsetDays) }))
              }}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            {form.startDate && form.firstDueDate && form.firstDueDate > form.startDate && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {Math.round((new Date(form.firstDueDate + 'T00:00:00').getTime() - new Date(form.startDate + 'T00:00:00').getTime()) / 86_400_000)} days after bill date
              </p>
            )}
          </div>
        )}
      </div>

      {/* End mode */}
      <div>
        <label className="block text-xs font-medium mb-1.5">Ends</label>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {([['forever', 'Never'], ['until', 'On a date'], ['for_n_occurrences', 'After N occurrences']] as const).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="endMode"
                value={v}
                checked={form.endMode === v}
                onChange={() => set('endMode', v)}
                className="accent-primary"
              />
              {l}
            </label>
          ))}
        </div>
      </div>

      {form.endMode === 'until' && (
        <div className="max-w-xs">
          <label className="block text-xs font-medium mb-1">End date <span className="text-red-500">*</span></label>
          <input
            type="date"
            value={form.endDate}
            onChange={e => set('endDate', e.target.value)}
            className={cn(
              'w-full rounded-md border bg-background px-2 py-1.5 text-sm',
              errors.endDate ? 'border-red-500' : 'border-input',
            )}
          />
          {errors.endDate && <p className="text-xs text-red-500 mt-0.5">{errors.endDate}</p>}
        </div>
      )}

      {form.endMode === 'for_n_occurrences' && (
        <div className="max-w-xs">
          <label className="block text-xs font-medium mb-1">Number of occurrences <span className="text-red-500">*</span></label>
          <input
            type="number"
            min="1"
            value={form.totalOccurrences}
            onChange={e => set('totalOccurrences', e.target.value)}
            className={cn(
              'w-full rounded-md border bg-background px-2 py-1.5 text-sm',
              errors.totalOccurrences ? 'border-red-500' : 'border-input',
            )}
          />
          {errors.totalOccurrences && <p className="text-xs text-red-500 mt-0.5">{errors.totalOccurrences}</p>}
        </div>
      )}

      {/* Occurrence preview */}
      {preview.length > 0 && (
        <div className="rounded-md bg-muted/50 border border-border p-3 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" /> Schedule preview
          </p>
          <ol className="space-y-0.5">
            {preview.map((d, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}.</span>
                <span>{format(d, 'EEEE d MMMM yyyy')}</span>
              </li>
            ))}
          </ol>
          {form.endMode === 'forever' && (
            <p className="text-xs text-muted-foreground">…continues indefinitely</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Transaction tab ───────────────────────────────────────────────────────────

function TransactionTab({
  form, setForm, errors, setErrors, glAccounts,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  errors: Record<string, string>
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>
  glAccounts: GLAccount[]
}) {
  const set = (field: keyof FormState, value: unknown) =>
    setForm(p => ({ ...p, [field]: value }))

  function addPayslipLine(field: 'payslipComponents' | 'payslipDeductions') {
    setForm(p => ({ ...p, [field]: [...p[field], { label: '', amount: '', glAccountId: '' }] }))
  }

  function updatePayslipLine(
    field: 'payslipComponents' | 'payslipDeductions',
    idx: number,
    key: keyof PayslipLine,
    value: string,
  ) {
    setForm(p => ({
      ...p,
      [field]: (p[field] as PayslipLine[]).map((l, i) => i === idx ? { ...l, [key]: value } : l),
    }))
  }

  function removePayslipLine(field: 'payslipComponents' | 'payslipDeductions', idx: number) {
    setForm(p => ({ ...p, [field]: (p[field] as PayslipLine[]).filter((_, i) => i !== idx) }))
  }

  return (
    <div className="space-y-4 p-4">
      {/* Journal lines */}
      <JournalLinesEditor
        lines={form.lines}
        onChange={lines => set('lines', lines)}
        glAccounts={glAccounts}
        errors={errors}
        onErrorsClear={keys => setErrors(p => {
          const next = { ...p }
          keys.forEach(k => delete next[k])
          return next
        })}
      />
      {errors.lines && <p className="text-xs text-red-500">{errors.lines}</p>}

      {/* Tax tracking */}
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={form.isTaxTracked}
            onChange={e => set('isTaxTracked', e.target.checked)}
            className="accent-primary"
          />
          Track for tax
        </label>
        {form.isTaxTracked && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="block text-xs font-medium mb-1">Estimated tax rate (%)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.taxRate}
                onChange={e => set('taxRate', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Classification</label>
              <select
                value={form.taxClassification}
                onChange={e => set('taxClassification', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">Not classified</option>
                {form.kind === 'bill' ? (
                  <>
                    <option value="tax_deduction">Tax Deduction</option>
                    <option value="tax_payment">Tax Payment (PAYG)</option>
                  </>
                ) : (
                  <>
                    <option value="taxable_income">Taxable Income</option>
                    <option value="exempt_income">Exempt Income</option>
                  </>
                )}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Payslip mode (income only) */}
      {form.kind === 'income' && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={form.payslipEnabled}
              onChange={e => set('payslipEnabled', e.target.checked)}
              className="accent-primary"
            />
            Payslip mode
          </label>
          {form.payslipEnabled && (
            <div className="space-y-3 pt-1">
              <p className="text-xs text-muted-foreground">
                At approval, payslip fields override the journal lines above to produce the
                correct multi-leg entry (Gross Income / PAYG / SGC / Net to Bank).
              </p>

              {/* Gross */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Gross pay ($)</label>
                  <input type="number" step="0.01" min="0" value={form.grossPay}
                    onChange={e => set('grossPay', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Gross income GL <span className="text-red-500">*</span></label>
                  <GLAccountSelect
                    value={form.grossIncomeGlAccountId}
                    onChange={v => set('grossIncomeGlAccountId', v)}
                    glAccounts={glAccounts}
                  />
                  {errors.grossIncomeGlAccountId && <p className="text-xs text-red-500 mt-0.5">{errors.grossIncomeGlAccountId}</p>}
                </div>
              </div>

              {/* PAYG */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">PAYG withheld ($)</label>
                  <input type="number" step="0.01" min="0" value={form.paygWithheld}
                    onChange={e => set('paygWithheld', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">PAYG GL account</label>
                  <GLAccountSelect
                    value={form.paygGlAccountId}
                    onChange={v => set('paygGlAccountId', v)}
                    glAccounts={glAccounts}
                  />
                </div>
              </div>

              {/* SGC */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">SGC super ($)</label>
                  <input type="number" step="0.01" min="0" value={form.sgcAmount}
                    onChange={e => set('sgcAmount', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">SGC GL account</label>
                  <GLAccountSelect
                    value={form.sgcGlAccountId}
                    onChange={v => set('sgcGlAccountId', v)}
                    glAccounts={glAccounts}
                  />
                </div>
              </div>

              {/* Net */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Net take-home ($)</label>
                  <input type="number" step="0.01" min="0" value={form.netPay}
                    onChange={e => set('netPay', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Bank GL account <span className="text-red-500">*</span></label>
                  <GLAccountSelect
                    value={form.bankGlAccountId}
                    onChange={v => set('bankGlAccountId', v)}
                    glAccounts={glAccounts}
                  />
                  {errors.bankGlAccountId && <p className="text-xs text-red-500 mt-0.5">{errors.bankGlAccountId}</p>}
                </div>
              </div>

              {/* Pay components */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pay Components</p>
                  <button type="button" onClick={() => addPayslipLine('payslipComponents')}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
                {form.payslipComponents.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_100px_1fr_28px] gap-1.5 mb-1.5">
                    <input type="text" value={c.label} placeholder="Label"
                      onChange={e => updatePayslipLine('payslipComponents', i, 'label', e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                    <input type="number" step="0.01" value={c.amount} placeholder="0.00"
                      onChange={e => updatePayslipLine('payslipComponents', i, 'amount', e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right" />
                    <GLAccountSelect value={c.glAccountId}
                      onChange={v => updatePayslipLine('payslipComponents', i, 'glAccountId', v)}
                      glAccounts={glAccounts} />
                    <button type="button" onClick={() => removePayslipLine('payslipComponents', i)}
                      className="p-1 hover:bg-accent rounded text-red-500 mt-0.5">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Deductions */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deductions</p>
                  <button type="button" onClick={() => addPayslipLine('payslipDeductions')}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
                {form.payslipDeductions.map((d, i) => (
                  <div key={i} className="grid grid-cols-[1fr_100px_1fr_28px] gap-1.5 mb-1.5">
                    <input type="text" value={d.label} placeholder="Label"
                      onChange={e => updatePayslipLine('payslipDeductions', i, 'label', e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
                    <input type="number" step="0.01" value={d.amount} placeholder="0.00"
                      onChange={e => updatePayslipLine('payslipDeductions', i, 'amount', e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right" />
                    <GLAccountSelect value={d.glAccountId}
                      onChange={v => updatePayslipLine('payslipDeductions', i, 'glAccountId', v)}
                      glAccounts={glAccounts} />
                    <button type="button" onClick={() => removePayslipLine('payslipDeductions', i)}
                      className="p-1 hover:bg-accent rounded text-red-500 mt-0.5">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Template form dialog ───────────────────────────────────────────────────────

function TemplateFormDialog({
  open, onClose, form, setForm, errors, setErrors, tab, setTab,
  saving, isEdit, onSave,
  contacts, accounts, categories, entities, members, locations, glAccounts,
}: {
  open: boolean
  onClose: () => void
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  errors: Record<string, string>
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>
  tab: Tab
  setTab: (t: Tab) => void
  saving: boolean
  isEdit: boolean
  onSave: () => void
  contacts: ContactRow[]
  accounts: AccountRow[]
  categories: CategoryRow[]
  entities: EntityRow[]
  members: MemberRow[]
  locations: LocationRow[]
  glAccounts: GLAccount[]
}) {
  const errorKeys = Object.keys(errors)
  const topErrors = errorKeys.filter(k => !k.startsWith('line_') && k !== 'balance' && k !== 'lines')

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <ResizableDialogContent className="flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-0 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {form.kind === 'bill'
              ? <TrendingDown className="h-4 w-4 text-red-500" />
              : <TrendingUp className="h-4 w-4 text-green-600" />}
            {isEdit ? 'Edit Recurring Template' : 'New Recurring Template'}
          </DialogTitle>
          {topErrors.length > 0 && (
            <div className="mt-2 rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600 dark:text-red-400 space-y-0.5">
              {topErrors.slice(0, 4).map(k => <p key={k}>{errors[k]}</p>)}
            </div>
          )}
        </DialogHeader>

        {/* Tab strip */}
        <div className="flex border-b border-border shrink-0 px-4 mt-3">
          {(['Overview', 'Frequency', 'Transaction'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {tab === 'Overview' && (
            <OverviewTab
              form={form} setForm={setForm} errors={errors} isEdit={isEdit}
              contacts={contacts} accounts={accounts} categories={categories}
              entities={entities} members={members} locations={locations}
            />
          )}
          {tab === 'Frequency' && (
            <FrequencyTab form={form} setForm={setForm} errors={errors} />
          )}
          {tab === 'Transaction' && (
            <TransactionTab
              form={form} setForm={setForm}
              errors={errors} setErrors={setErrors}
              glAccounts={glAccounts}
            />
          )}
        </div>

        <DialogFooter className="px-4 py-3 border-t border-border shrink-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Update Template' : 'Create Template'}
          </Button>
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const {
    templates, glAccounts, contacts, accounts, categories, entities, members, locations,
    form, setForm, errors, setErrors, tab, setTab,
    saving, showForm, editId, deleteTarget, setDeleteTarget,
    openCreate, openEdit, closeForm, handleSave, handleToggleEnabled, handleDelete,
  } = useTemplatesCrud()

  const bills   = templates.filter(t => t.kind === 'bill')
  const incomes = templates.filter(t => t.kind === 'income')

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Recurring Templates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {templates.length} template{templates.length !== 1 ? 's' : ''} ·{' '}
            {templates.filter(t => t.enabled).length} active
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> New Template
        </Button>
      </div>

      {/* Bills section */}
      {bills.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" /> Bills ({bills.length})
          </h2>
          <div className="rounded-lg border border-border divide-y divide-border">
            {bills.map(t => <TemplateListRow key={t.id} template={t} onEdit={openEdit} onToggle={handleToggleEnabled} onDelete={setDeleteTarget} />)}
          </div>
        </section>
      )}

      {/* Income section */}
      {incomes.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-green-600" /> Income ({incomes.length})
          </h2>
          <div className="rounded-lg border border-border divide-y divide-border">
            {incomes.map(t => <TemplateListRow key={t.id} template={t} onEdit={openEdit} onToggle={handleToggleEnabled} onDelete={setDeleteTarget} />)}
          </div>
        </section>
      )}

      {templates.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <RefreshCw className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No recurring templates yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Create a template to auto-spawn drafts on a schedule.</p>
          <Button onClick={openCreate} size="sm" className="mt-4 gap-1.5">
            <Plus className="h-4 w-4" /> New Template
          </Button>
        </div>
      )}

      {/* Form dialog */}
      <TemplateFormDialog
        open={showForm}
        onClose={closeForm}
        form={form}
        setForm={setForm}
        errors={errors}
        setErrors={setErrors}
        tab={tab}
        setTab={setTab}
        saving={saving}
        isEdit={!!editId}
        onSave={handleSave}
        contacts={contacts}
        accounts={accounts}
        categories={categories}
        entities={entities}
        members={members}
        locations={locations}
        glAccounts={glAccounts}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null) }}>
        <ResizableDialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" /> Delete Template
            </DialogTitle>
          </DialogHeader>
          <div className="px-1 py-2 text-sm space-y-2">
            <p>Delete <span className="font-semibold">{deleteTarget?.name}</span>?</p>
            <p className="text-muted-foreground text-xs">
              Already-spawned drafts keep their own lifecycle. They will no longer link back
              to this template, but can still be approved or cancelled independently.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDelete(deleteTarget!.id)}>
              Delete
            </Button>
          </DialogFooter>
        </ResizableDialogContent>
      </Dialog>
    </div>
  )
}

// ── List row ──────────────────────────────────────────────────────────────────

function TemplateListRow({
  template, onEdit, onToggle, onDelete,
}: {
  template: TemplateRow
  onEdit: (t: TemplateRow) => void
  onToggle: (t: TemplateRow) => void
  onDelete: (t: TemplateRow) => void
}) {
  const nextDate = template.nextOccurrenceDate
    ? new Date(template.nextOccurrenceDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  return (
    <div
      className={cn('flex items-center gap-3 px-4 py-3 cursor-pointer', !template.enabled && 'opacity-50')}
      onDoubleClick={() => onEdit(template)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{template.name}</span>
          <span className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
            template.enabled
              ? 'bg-green-500/10 text-green-700 dark:text-green-400'
              : 'bg-muted text-muted-foreground',
          )}>
            {template.enabled ? 'Active' : 'Disabled'}
          </span>
          {template.createAutomatically && (
            <span className="inline-flex items-center rounded bg-blue-500/10 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 text-xs font-medium">
              AUTO
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {FREQ_LABELS[template.frequency] ?? template.frequency}
          {template.createInAdvanceDays > 0 && ` · ${template.createInAdvanceDays}d advance`}
          {' · '}<span className="text-foreground/70">Next: {nextDate}</span>
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onToggle(template)}
          title={template.enabled ? 'Disable' : 'Enable'}
          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          {template.enabled
            ? <ToggleRight className="h-4 w-4 text-green-600" />
            : <ToggleLeft className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => onEdit(template)}
          title="Edit"
          className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(template)}
          title="Delete"
          className="p-1.5 rounded hover:bg-accent text-red-500 hover:text-red-600 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
