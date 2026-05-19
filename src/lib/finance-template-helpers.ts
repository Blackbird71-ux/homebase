// ── Server-safe helpers for the recurring templates module ──────────────────
// Pure functions and types shared between the hooks and page component.
// No 'use client' — safe to import from server code.

import type { JournalFormLine } from '@/components/finance/JournalLinesEditor'

// ── Types ─────────────────────────────────────────────────────────────────────

export type Tab = 'Overview' | 'Frequency' | 'Transaction'

export interface ContactRow   { id: string; name: string }
export interface AccountRow   { id: string; name: string }
export interface CategoryRow  { id: string; name: string; type: string; parentId: string | null }
export interface EntityRow    { id: string; name: string; color: string | null }
export interface MemberRow    { id: string; name: string }
export interface LocationRow  { id: string; name: string }

export interface PayslipLine  { label: string; amount: string; glAccountId: string }

export interface FormState {
  // Overview
  kind: 'bill' | 'income'
  name: string
  enabled: boolean
  createAutomatically: boolean
  notifyOnCreate: boolean
  includeInBudget: boolean
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
  nextSpawnDate: string       // override input — blank means "don't override, compute from schedule"
  currentNextSpawnDate: string // display only — current DB value, never sent to API
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
export type TemplateRow = Record<string, any>

// ── Constants ─────────────────────────────────────────────────────────────────

export const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly',
  bimonthly: 'Every 2 months', quarterly: 'Quarterly',
  halfyearly: 'Half-yearly', yearly: 'Yearly', custom: 'Custom',
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const emptyForm: FormState = {
  kind: 'bill',
  name: '',
  enabled: true,
  createAutomatically: true,
  notifyOnCreate: false,
  includeInBudget: true,
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
  startDate: '',
  firstDueDate: '',
  nextSpawnDate: '',
  currentNextSpawnDate: '',
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

export const TEMPLATE_DEFAULTS_KEY = 'finance_template_defaults'

export type TemplateDefaults = Pick<FormState,
  'accountId' | 'entityId' | 'memberId' | 'locationId' |
  'createInAdvanceDays' | 'remindInAdvanceDays' | 'defaultDueOffsetDays' |
  'createAutomatically' | 'notifyOnCreate'
>

export function loadTemplateDefaults(): TemplateDefaults | null {
  try {
    const raw = localStorage.getItem(TEMPLATE_DEFAULTS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveTemplateDefaults(form: FormState) {
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

// ── Data helpers ──────────────────────────────────────────────────────────────

export function templateToForm(t: TemplateRow): FormState {
  return {
    kind: t.kind as 'bill' | 'income',
    name: t.name,
    enabled: t.enabled,
    createAutomatically: t.createAutomatically,
    notifyOnCreate: t.notifyOnCreate,
    includeInBudget: t.includeInBudget ?? true,
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
    nextSpawnDate: '',
    currentNextSpawnDate: t.nextOccurrenceDate ? (t.nextOccurrenceDate as string).slice(0, 10) : '',
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

export function formToBody(form: FormState) {
  return {
    kind: form.kind,
    name: form.name,
    enabled: form.enabled,
    createAutomatically: form.createAutomatically,
    notifyOnCreate: form.notifyOnCreate,
    includeInBudget: form.includeInBudget,
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
    // Only include nextSpawnDate when the user explicitly set it — blank means let the schedule compute
    ...(form.nextSpawnDate ? { nextSpawnDate: form.nextSpawnDate } : {}),
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

export function validate(form: FormState): Record<string, string> {
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
