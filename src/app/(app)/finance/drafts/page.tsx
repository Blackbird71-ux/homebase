'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHero } from '@/components/shared/PageHero'
import { StatusChip } from '@/components/shared/StatusChip'
import {
  CheckCircle2, XCircle, Pencil, Inbox, AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp,
  Receipt, BookmarkCheck, Briefcase, Building2, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, toMonthlyAmount } from '@/lib/financeShared'
import { sortedCategoryList } from '@/lib/finance-categories'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/sheet'
import { JournalLinesEditor, type JournalFormLine, type GLAccount } from '@/components/finance/JournalLinesEditor'
import { EditorDisclosure } from '@/components/finance/EditorDisclosure'
import { formatInTz } from '@/lib/timezone'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DraftBill {
  id: string
  name: string
  amount: number
  nextDueDate: string
  billDate: string | null
  status: string | null
  spawnedSnapshotHash: string | null
  templateId: string | null
  categoryId: string | null
  vendorId: string | null
  memberId: string | null
  entityId: string | null
  taxClassification: string | null
  frequency: string | null
  notes: string | null
  journalEntryId: string | null
  template: { id: string; name: string } | null
  vendor: { id: string; name: string } | null
  category: { id: string; name: string; type: string } | null
  journalEntry: {
    id: string
    lines: { glAccountId: string; side: string; amount: number; description: string | null }[]
  } | null
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
  memberId: string | null
  entityId: string | null
  taxClassification: string | null
  frequency: string | null
  notes: string | null
  journalEntryId: string | null
  template: { id: string; name: string } | null
  vendor: { id: string; name: string } | null
  category: { id: string; name: string; type: string } | null
  payslip: { id: string; grossPay: number; netPay: number } | null
  journalEntry: {
    id: string
    lines: { glAccountId: string; side: string; amount: number; description: string | null }[]
  } | null
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

interface Member {
  id: string
  name: string
}

interface Entity {
  id: string
  name: string
  isDefault: boolean
}

interface EditFormState {
  kind: 'bill' | 'income'
  id: string
  name: string
  amount: string
  date: string
  billDate: string
  endDate: string
  categoryId: string
  vendorId: string
  memberId: string
  entityId: string
  notes: string
  billType: string
  frequency: string
  autoPay: boolean
  emailReminder: boolean
  reminderDays: number
  invoiceReceived: boolean
  invoiceReceivedDate: string
  taxClassification: string
  addToBudget: boolean
  journalEntryId: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Finance day-precision dates are stored as UTC midnight; render in the family
// timezone so a value stored at T00:00:00.000Z shows the correct local calendar day.
function fmtDate(iso: string, tz: string) {
  return formatInTz(new Date(iso), tz, { day: '2-digit', month: 'short', year: 'numeric' })
}

function emptyEditForm(kind: 'bill' | 'income', id: string): EditFormState {
  return {
    kind, id,
    name: '', amount: '', date: '', billDate: '', endDate: '',
    categoryId: '', vendorId: '', memberId: '', entityId: '',
    notes: '', billType: 'recurring', frequency: 'monthly',
    autoPay: false, emailReminder: false, reminderDays: 3,
    invoiceReceived: false, invoiceReceivedDate: '',
    taxClassification: '', addToBudget: true,
    journalEntryId: null,
  }
}

// ── Edit Dialog (full bills-style form) ───────────────────────────────────────

function EditDialog({
  state,
  initialJournalLines,
  categories,
  vendors,
  members,
  entities,
  glAccounts,
  onClose,
  onSave,
}: {
  state: EditFormState
  initialJournalLines: JournalFormLine[]
  categories: Category[]
  vendors: Vendor[]
  members: Member[]
  entities: Entity[]
  glAccounts: GLAccount[]
  onClose: () => void
  onSave: (s: EditFormState, journalLines: JournalFormLine[]) => Promise<void>
}) {
  const [form, setForm] = useState(state)
  const [journalLines, setJournalLines] = useState<JournalFormLine[]>(initialJournalLines)
  const [journalErrors, setJournalErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = <K extends keyof EditFormState>(field: K, value: EditFormState[K]) =>
    setForm(prev => ({ ...prev, [field]: value }))

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    const amt = parseFloat(form.amount)
    if (isNaN(amt) || amt <= 0) errs.amount = 'Amount must be a positive number'
    if (!form.date) errs.date = 'Date is required'
    return errs
  }

  async function handleSave() {
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setSaving(true)
    try {
      await onSave(form, journalLines)
    } catch (err) {
      setErrors({ save: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  const targetType = form.kind === 'bill' ? 'expense' : 'income'
  const filteredCats = sortedCategoryList(
    categories
      .filter(c => c.type === targetType)
      .map(c => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId ?? null })),
  )

  const dateLabel = form.kind === 'bill' ? 'Next Due Date *' : 'Next Expected Date *'

  return (
    <Drawer open onOpenChange={onClose}>
      <DrawerContent className="sm:max-w-[900px]" showCloseButton={true}>
        <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
          <DrawerTitle>Edit Draft {form.kind === 'bill' ? 'Bill' : 'Income'}</DrawerTitle>
          {Object.keys(errors).length > 0 && (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 mt-2">
              <p className="text-xs text-red-500 font-medium">Please fix the following errors:</p>
              <ul className="list-disc list-inside text-xs text-red-500/80 mt-1">
                {Object.values(errors).map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
          {form.kind === 'bill' && (
            <div className="flex gap-4 pt-2">
              {(['recurring', 'one-off'] as const).map(bt => (
                <label key={bt} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="billType" value={bt} checked={form.billType === bt}
                    onChange={() => set('billType', bt)} className="accent-primary" />
                  {bt === 'recurring' ? <><RefreshCw className="h-3.5 w-3.5 text-blue-500" /> Recurring</> : <><Layers className="h-3.5 w-3.5 text-orange-500" /> One-off</>}
                </label>
              ))}
            </div>
          )}
          {form.kind === 'income' && (
            <div className="flex gap-4 pt-2">
              {(['recurring', 'one-off'] as const).map(bt => (
                <label key={bt} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="incomeType" value={bt} checked={form.billType === bt}
                    onChange={() => set('billType', bt)} className="accent-primary" />
                  {bt === 'recurring' ? <><RefreshCw className="h-3.5 w-3.5 text-blue-500" /> Recurring</> : <><Layers className="h-3.5 w-3.5 text-orange-500" /> One-off</>}
                </label>
              ))}
            </div>
          )}
        </DrawerHeader>

        {/* Two-column body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col md:flex-row">
            {/* Left panel */}
            <div className="md:w-[38%] px-4 pb-4 space-y-2.5 md:border-r md:border-border">
              <div className="grid grid-cols-2 gap-2">
                {/* Name — full width */}
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Name *</label>
                  <input value={form.name} onChange={e => set('name', e.target.value)}
                    className={cn('w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm', errors.name && 'border-red-500')} />
                  {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
                </div>
                {/* Amount + Frequency (or Assigned To for one-off) */}
                <div>
                  <label className="text-xs text-muted-foreground">Amount *</label>
                  <input type="number" step="0.01" value={form.amount || ''}
                    onChange={e => set('amount', e.target.value)}
                    onFocus={e => e.target.select()}
                    className={cn('w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm', errors.amount && 'border-red-500')} />
                  {errors.amount && <p className="text-xs text-red-500 mt-0.5">{errors.amount}</p>}
                </div>
                {form.billType === 'recurring' ? (
                  <div>
                    <label className="text-xs text-muted-foreground">Frequency *</label>
                    <select value={form.frequency} onChange={e => set('frequency', e.target.value)}
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
                ) : (
                  <div>
                    <label className="text-xs text-muted-foreground">Assigned To</label>
                    <select value={form.memberId} onChange={e => set('memberId', e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                      <option value="">Shared</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                )}
                {/* Financial Contact — full width */}
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Financial Contact</label>
                  <div className="flex gap-1">
                    <select value={form.vendorId} onChange={e => set('vendorId', e.target.value)}
                      className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                      <option value="">No contact</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <Link href="/finance/contacts"
                      className="shrink-0 inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-1.5 text-muted-foreground hover:text-foreground"
                      title="Manage contacts"><Building2 className="h-3.5 w-3.5" /></Link>
                  </div>
                </div>
                {/* Due Date + Invoice Date (bills) or End Date */}
                <div>
                  <label className="text-xs text-muted-foreground">{dateLabel}</label>
                  <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                    className={cn('w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm', errors.date && 'border-red-500')} />
                  {errors.date && <p className="text-xs text-red-500 mt-0.5">{errors.date}</p>}
                </div>
                {form.kind === 'bill' ? (
                  <div>
                    <label className="text-xs text-muted-foreground">Invoice Date</label>
                    <input type="date" value={form.billDate} onChange={e => set('billDate', e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
                  </div>
                ) : form.billType === 'recurring' ? (
                  <div>
                    <label className="text-xs text-muted-foreground">End Date (optional)</label>
                    <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
                  </div>
                ) : <div />}
                {/* Assigned To + Entity (recurring only) */}
                {form.billType === 'recurring' && (
                  <div>
                    <label className="text-xs text-muted-foreground">Assigned To</label>
                    <select value={form.memberId} onChange={e => set('memberId', e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                      <option value="">Shared</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="h-3 w-3" /> Entity / Fund</label>
                  <select value={form.entityId} onChange={e => set('entityId', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                    <option value="">Select entity…</option>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.name}{e.isDefault ? ' (default)' : ''}</option>)}
                  </select>
                </div>
                {/* Advanced — GL category + tax classification (derived from the journal lines) */}
                <div className="col-span-2">
                  <EditorDisclosure label="Advanced" hasData={!!form.categoryId || !!form.taxClassification}>
                    <div className="space-y-2.5">
                      <div>
                        <label className="text-xs text-muted-foreground">{form.kind === 'bill' ? 'Expense Category (GL)' : 'Income Category (GL)'}</label>
                        <select value={form.categoryId} onChange={e => set('categoryId', e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                          <option value="">No category</option>
                          {filteredCats.map(c => (
                            <option key={c.id} value={c.id}>{c.parentId ? '— ' + c.name : c.name}</option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">Derived from the first {form.kind === 'bill' ? 'debit' : 'credit'} line. Override here if needed.</p>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground flex items-center gap-1"><Receipt className="h-3 w-3 text-amber-500" /> Tax Classification</label>
                        <select value={form.taxClassification} onChange={e => set('taxClassification', e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
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
                  </EditorDisclosure>
                </div>
                {/* Notes — full width */}
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <textarea value={form.notes} rows={2} onChange={e => set('notes', e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none" />
                </div>
              </div>
            </div>

            {/* Right panel */}
            <div className="md:w-[62%] px-4 pb-4 space-y-2.5">
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <JournalLinesEditor
                  lines={journalLines}
                  onChange={lines => {
                    setJournalLines(lines)
                    // Derive categoryId from the primary GL line (mirrors the bill/income
                    // editors and TemplateFormDialog): bill = first debit on an expense
                    // account; income = first credit on an income account. categoryId
                    // follows the lines; the Advanced dropdown remains an override.
                    const primary = form.kind === 'bill'
                      ? lines.find(l => l.side === 'debit' && glAccounts.some(a => a.id === l.glAccountId && a.type === 'expense'))
                      : lines.find(l => l.side === 'credit' && glAccounts.some(a => a.id === l.glAccountId && a.type === 'income'))
                    if (primary?.glAccountId) set('categoryId', primary.glAccountId)
                  }}
                  glAccounts={glAccounts}
                  expectedTotal={parseFloat(form.amount) || 0}
                  errors={journalErrors}
                  onErrorsClear={keys => setJournalErrors(p => { const n = { ...p }; keys.forEach(k => delete n[k]); return n })}
                  lineHints={form.kind === 'bill'
                    ? ['Expense account (what you\'re paying for)', 'Accounts Payable — liability (what you owe)']
                    : ['Accounts Receivable — asset (what you\'re owed)', 'Income account (what you\'re earning)']}
                />
              </div>
              <div className="flex flex-wrap gap-4 pt-1">
                {form.billType === 'recurring' && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.autoPay} onChange={e => set('autoPay', e.target.checked)} className="rounded border-input" />
                    Auto-pay
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.emailReminder} onChange={e => set('emailReminder', e.target.checked)} className="rounded border-input" />
                  Email reminder
                </label>
                {form.emailReminder && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Remind</label>
                    <input type="number" min={0} max={30} value={form.reminderDays}
                      onChange={e => set('reminderDays', parseInt(e.target.value) || 0)}
                      className="w-16 rounded-md border border-input bg-background px-2 py-1 text-sm text-center" />
                    <span className="text-xs text-muted-foreground">days before</span>
                  </div>
                )}
                {/* Posting status — read-only. A draft is unposted by definition;
                    the GL accrual is posted by the Approve action, after which the
                    item leaves the inbox. invoiceReceived is not editable here (the
                    drafts PATCH route does not persist it). */}
                <div className="w-full flex items-center gap-2">
                  <StatusChip variant="soon" dot>Draft — not posted</StatusChip>
                  <span className="text-xs text-muted-foreground">Approving this draft posts it to the journals.</span>
                </div>
              </div>
              <div className={cn('rounded-md border px-3 py-2.5 flex items-start gap-3', form.addToBudget ? 'border-primary/40 bg-primary/5' : 'border-border')}>
                <input type="checkbox" id="draftAddToBudget" checked={form.addToBudget}
                  onChange={e => set('addToBudget', e.target.checked)} className="rounded border-input mt-0.5" />
                <label htmlFor="draftAddToBudget" className="cursor-pointer flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <BookmarkCheck className="h-3.5 w-3.5 text-primary" /> Include in budget planner
                  </div>
                  {form.addToBudget && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Creates a budget rule for <strong>{formatCurrency(toMonthlyAmount(parseFloat(form.amount) || 0, form.frequency))}</strong>/month
                      {form.frequency !== 'monthly' ? ` (${form.frequency} normalised to monthly)` : ''}.
                    </p>
                  )}
                </label>
              </div>
            </div>
          </div>
        </div>

        <DrawerFooter className="border-t border-border">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
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
  const tz = useFamilyTimezone()

  async function handle(action: 'approve' | 'cancel', fn: () => void) {
    setBusy(action)
    try { await fn() } finally { setBusy(null) }
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm">{name}</span>
          {isChanged && <StatusChip variant="soon" dot>Changed</StatusChip>}
          {isPayslip && <StatusChip variant="info">Payslip</StatusChip>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{fmtDate(date, tz)}</span>
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
          title={kind === 'bill' ? 'Approve & post — DR Expense / CR Payable' : 'Approve & post — DR AR/Bank / CR Income'}
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
  const [members, setMembers] = useState<Member[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [glAccounts, setGLAccounts] = useState<GLAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [editState, setEditState] = useState<EditFormState | null>(null)
  const [editJournalLines, setEditJournalLines] = useState<JournalFormLine[]>([])
  const [bulkBusyBills, setBulkBusyBills] = useState(false)
  const [bulkBusyIncome, setBulkBusyIncome] = useState(false)
  const [toastMsg, setToastMsg] = useState('')

  function toast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3500)
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadRefs = useCallback(async () => {
    const [cRes, mRes, eRes, glRes] = await Promise.all([
      fetch('/api/finance/categories'),
      fetch('/api/finance/members'),
      fetch('/api/finance/entities'),
      fetch('/api/finance/categories?forPicker=true'),
    ])
    if (cRes.ok) {
      const catsData = await cRes.json()
      setCategories(Array.isArray(catsData) ? catsData : (catsData.categories ?? []))
    }
    if (mRes.ok) setMembers(await mRes.json())
    if (eRes.ok) setEntities(await eRes.json())
    if (glRes.ok) {
      const glCats = await glRes.json()
      setGLAccounts(glCats.filter((c: any) => c.type !== 'transfer'))
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [draftsRes, vendorsRes] = await Promise.all([
        fetch('/api/finance/drafts'),
        fetch('/api/finance/contacts'),
      ])
      if (!draftsRes.ok) throw new Error('Failed to load drafts')
      const draftsData = await draftsRes.json()
      const vendorsData = vendorsRes.ok ? await vendorsRes.json() : []
      setBills(draftsData.bills ?? [])
      setIncome(draftsData.income ?? [])
      setVendors(Array.isArray(vendorsData) ? vendorsData : [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRefs() }, [loadRefs])
  useEffect(() => { load() }, [load])

  // ── Actions ───────────────────────────────────────────────────────────────

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
    const isBill = 'nextDueDate' in d
    const date = isBill
      ? new Date((d as DraftBill).nextDueDate).toISOString().slice(0, 10)
      : new Date((d as DraftIncome).nextExpectedDate).toISOString().slice(0, 10)
    const form = emptyEditForm(kind, d.id)
    form.name = d.name
    form.amount = String(d.amount)
    form.date = date
    form.categoryId = d.categoryId ?? ''
    form.vendorId = d.vendorId ?? ''
    form.memberId = d.memberId ?? ''
    form.entityId = d.entityId ?? ''
    form.taxClassification = d.taxClassification ?? ''
    form.frequency = d.frequency ?? 'monthly'
    form.notes = d.notes ?? ''
    if (isBill && (d as DraftBill).billDate) {
      form.billDate = new Date((d as DraftBill).billDate!).toISOString().slice(0, 10)
    }
    // Build initial journal lines from the spawn-created linked journal entry.
    // Both bill and income drafts now have an unposted FinanceJournalEntry with
    // template lines created at spawn time. Fall back to sensible per-kind defaults
    // for old drafts spawned before this fix was applied.
    form.journalEntryId = isBill
      ? (d as DraftBill).journalEntryId ?? null
      : (d as DraftIncome).journalEntryId ?? null

    let initialLines: JournalFormLine[] = []
    const amtStr = d.amount > 0 ? d.amount.toFixed(2) : ''
    const linkedJournal = isBill
      ? (d as DraftBill).journalEntry
      : (d as DraftIncome).journalEntry

    if (linkedJournal && linkedJournal.lines.length >= 2) {
      initialLines = linkedJournal.lines.map(l => ({
        glAccountId: l.glAccountId,
        side: l.side as 'debit' | 'credit',
        amount: String(l.amount),
        description: l.description ?? '',
      }))
    } else if (!isBill) {
      // Fallback for old income drafts without a linked journal entry
      const ar = glAccounts.find(a => a.name.toLowerCase().includes('accounts receivable'))
      initialLines = [
        { glAccountId: ar?.id ?? '', side: 'debit' as const, amount: amtStr, description: '' },
        { glAccountId: d.categoryId ?? '', side: 'credit' as const, amount: amtStr, description: '' },
      ]
    } else {
      // Fallback for old bill drafts without a linked journal entry
      const ap = glAccounts.find(a => a.name.toLowerCase().includes('accounts payable'))
      initialLines = [
        { glAccountId: d.categoryId ?? '', side: 'debit' as const, amount: amtStr, description: '' },
        { glAccountId: ap?.id ?? '', side: 'credit' as const, amount: amtStr, description: '' },
      ]
    }

    setEditJournalLines(initialLines)
    setEditState(form)
  }

  async function handleEditSave(s: EditFormState, journalLines: JournalFormLine[]) {
    const body: Record<string, unknown> = {
      kind: s.kind,
      name: s.name,
      amount: s.amount,
      [s.kind === 'bill' ? 'nextDueDate' : 'nextExpectedDate']: s.date,
      categoryId: s.categoryId || null,
      vendorId: s.vendorId || null,
      memberId: s.memberId || null,
      entityId: s.entityId || null,
      taxClassification: s.taxClassification || null,
      frequency: s.frequency || null,
      notes: s.notes || null,
      ...(s.kind === 'bill' && s.billDate ? { billDate: s.billDate } : {}),
      // Send journal lines for both bills and income so the linked unposted journal
      // entry is updated. The API creates one if it doesn't yet exist (old drafts).
      ...(journalLines.length >= 2 ? { lines: journalLines } : {}),
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

  // ── Render ────────────────────────────────────────────────────────────────

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
      <PageHero
        title="Drafts Inbox"
        subtitle="Recurring transaction drafts awaiting review."
        actions={
          <button
            onClick={load}
            className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        }
      />

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
          initialJournalLines={editJournalLines}
          categories={categories}
          vendors={vendors}
          members={members}
          entities={entities}
          glAccounts={glAccounts}
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
