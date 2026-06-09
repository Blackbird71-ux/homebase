'use client'

import {
  Plus, Pencil, Trash2, Bell, Settings2, CheckCircle2,
  RefreshCw, Layers, Briefcase,
  Building2, Receipt, ReceiptText, Ban,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHero } from '@/components/shared/PageHero'
import { sortedCategoryList } from '@/lib/finance-categories'
import { formatCurrency } from '@/lib/financeShared'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter,
} from '@/components/ui/sheet'
import { JournalLinesEditor } from '@/components/finance/JournalLinesEditor'
import { EditorDisclosure } from '@/components/finance/EditorDisclosure'
import { useAttachmentManager } from '@/hooks/finance/useAttachmentManager'
import { useIncomeCrud, type IncomeEntry, type PayslipFormData } from '@/hooks/finance/useIncomeCrud'
import { IncomeRow } from '@/components/finance/IncomeRow'
import { StatusChip } from '@/components/shared/StatusChip'
import { formatInTz } from '@/lib/timezone'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'

export type { IncomeEntry } from '@/hooks/finance/useIncomeCrud'

export default function IncomePage() {
  const {
    entries, loading, showForm, editing,
    journalLines, setJournalLines,
    journalErrors, setJournalErrors,
    form, setForm, errors,
    accounts, categories, glAccounts, members, locations, vendors, entities,
    deleteConfirm, setDeleteConfirm,
    voidConfirm, setVoidConfirm,
    voidNote, setVoidNote,
    receivedConfirm, setReceivedConfirm,
    receivedConfirmDate, setReceivedConfirmDate,
    receivedConfirmGlAccountId, setReceivedConfirmGlAccountId,
    receivedConfirmActualAmount, setReceivedConfirmActualAmount,
    payslipForm, setPayslipForm,
    dateRange, setDateRangePersisted,
    selectedCatIds, showCatPicker, setShowCatPicker, toggleCat,
    hideDeleteBills,
    rootCategories, overdue, overdueOneOff, upcoming, futureScheduled, visibleEntries,
    colCats, grandTotal, catTotals, gridTemplate,
    openNew, openEdit, closeForm,
    handleSave, handleDelete, confirmDelete,
    handleVoid, confirmVoid,
    handleMarkReceived, confirmMarkReceived,
    handleToggleInvoice,
    handleCategoryChange, handleVendorChange,
    getNextExpected, entryAmountForCat,
  } = useIncomeCrud()
  const att = useAttachmentManager('/api/finance/income')
  const tz = useFamilyTimezone()

  if (loading) return <div className="p-4 text-muted-foreground">Loading income?</div>

  return (
    <div className="space-y-6">
      <PageHero title="Income" />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {(['14', '30', 'quarter', '12months'] as const).map(r => (
            <button key={r} onClick={() => setDateRangePersisted(r)}
              className={cn('px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                dateRange === r ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
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
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
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
                  <button onClick={() => handleVoid(e.id, e.name)} title="Void" className="p-1 hover:bg-amber-500/10 rounded text-amber-500"><Ban className="h-3.5 w-3.5" /></button>
                  {!hideDeleteBills && <button onClick={() => handleDelete(e.id, e.name)} title="Delete" className="p-1 hover:bg-amber-500/10 rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>}
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
                  <span className="text-xs text-muted-foreground ml-2">Expected {formatInTz(new Date(e.nextExpectedDate), tz, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                <span className="font-medium shrink-0">{formatCurrency(e.amount)}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => handleMarkReceived(e)} title="Mark as received" className="p-1 hover:bg-orange-500/10 rounded text-green-500"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => openEdit(e)} title="Edit" className="p-1 hover:bg-orange-500/10 rounded text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleVoid(e.id, e.name)} title="Void" className="p-1 hover:bg-orange-500/10 rounded text-amber-500"><Ban className="h-3.5 w-3.5" /></button>
                  {!hideDeleteBills && <button onClick={() => handleDelete(e.id, e.name)} title="Delete" className="p-1 hover:bg-orange-500/10 rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!voidConfirm} onOpenChange={open => { if (!open) setVoidConfirm(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={true}>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Ban className="h-4 w-4 text-amber-500" /> Void Income Entry</DialogTitle></DialogHeader>
          {voidConfirm && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                Void <span className="font-medium text-foreground">{voidConfirm.name}</span>? This will create reversal journal entries and mark the income as voided. The record is kept for audit purposes.
              </p>
              <div>
                <label className="text-xs text-muted-foreground">Void reason (optional)</label>
                <input value={voidNote} onChange={e => setVoidNote(e.target.value)}
                  placeholder="e.g. Cancelled, entered in error?"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1" />
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setVoidConfirm(null)} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={confirmVoid} className="rounded-md bg-amber-500 text-white px-4 py-1.5 text-sm font-medium">Void Entry</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={open => { if (!open) setDeleteConfirm(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={true}>
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-600"><Trash2 className="h-4 w-4" /> Delete Income Entry</DialogTitle></DialogHeader>
          {deleteConfirm && (
            <div className="space-y-2 py-1">
              <p className="text-sm text-muted-foreground">
                Permanently delete <span className="font-medium text-foreground">{deleteConfirm.name}</span>? All related journal entries and transactions will be removed. This cannot be undone.
              </p>
              <p className="text-xs text-amber-600 font-medium">Consider using Void instead to preserve the audit trail.</p>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setDeleteConfirm(null)} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={confirmDelete} className="rounded-md bg-red-600 text-white px-4 py-1.5 text-sm font-medium">Delete Permanently</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Drawer open={showForm} onOpenChange={open => { if (!open) closeForm() }}>
        <DrawerContent className="sm:max-w-[900px]" showCloseButton={true}>

          {/* Fixed header — title, errors, income type toggle */}
          <div className="px-4 pt-4 pb-0 shrink-0">
            <DrawerHeader className="p-0">
              <DrawerTitle>{editing ? 'Edit Income' : 'New Income'}</DrawerTitle>
            </DrawerHeader>

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
              <div className="md:w-[38%] px-4 pb-4 space-y-2.5 md:border-r md:border-border">
                {/* Name — full width */}
                <div>
                  <label className="text-xs text-muted-foreground">Name *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className={cn('w-full rounded-md border bg-background px-3 py-1.5 text-sm', errors.name ? 'border-red-500' : 'border-input')} />
                  {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
                </div>

                {/* Amount + Frequency on one row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Amount *</label>
                    <input type="number" step="0.01" value={form.amount || ''}
                      onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                      onFocus={e => e.target.select()}
                      className={cn('w-full rounded-md border bg-background px-3 py-1.5 text-sm', errors.amount ? 'border-red-500' : 'border-input')} />
                    {errors.amount && <p className="text-xs text-red-500 mt-0.5">{errors.amount}</p>}
                  </div>
                  {form.incomeType === 'recurring' ? (
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
                  ) : <div />}
                </div>

                {/* Payer / Source — full width */}
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

                {/* Dates row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">{form.incomeType === 'one-off' ? 'Expected Date *' : 'Next Expected Date *'}</label>
                    <input type="date" value={form.nextExpectedDate} onChange={e => setForm(p => ({ ...p, nextExpectedDate: e.target.value }))}
                      className={cn('w-full rounded-md border bg-background px-3 py-1.5 text-sm', errors.nextExpectedDate ? 'border-red-500' : 'border-input')} />
                    {errors.nextExpectedDate && <p className="text-xs text-red-500 mt-0.5">{errors.nextExpectedDate}</p>}
                  </div>
                  {form.incomeType === 'recurring' ? (
                    <div>
                      <label className="text-xs text-muted-foreground">End Date (optional)</label>
                      <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
                    </div>
                  ) : null}
                </div>

                {/* Day of Month + Month of Year (recurring only) */}
                {form.incomeType === 'recurring' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Day of Month</label>
                      <input type="number" min={1} max={31} value={form.dayOfMonth}
                        onChange={e => setForm(p => ({ ...p, dayOfMonth: e.target.value }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                        placeholder="e.g. 15" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Month (annual)</label>
                      <select value={form.monthOfYear} onChange={e => setForm(p => ({ ...p, monthOfYear: e.target.value }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                        <option value="">None</option>
                        {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                          <option key={i+1} value={i+1}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Entity / Fund */}
                <div>
                  <label className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="h-3 w-3" /> Entity / Fund</label>
                  <select value={form.entityId} onChange={e => setForm(p => ({ ...p, entityId: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                    <option value="">Select entity…</option>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.name}{e.isDefault ? ' (default)' : ''}</option>)}
                  </select>
                </div>

                {/* Notes — left column, full width */}
                <div>
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <textarea value={form.notes} rows={2} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none" />
                </div>

                {/* Optional details — Assigned To + Location (defaulted; off the primary column) */}
                <EditorDisclosure label="Optional details" hasData={!!form.memberId || !!form.locationId}>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Assigned To</label>
                      <select value={form.memberId} onChange={e => setForm(p => ({ ...p, memberId: e.target.value }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                        <option value="">Shared</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
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
                </EditorDisclosure>

                {/* Advanced — Income Category (GL) (derived from the income journal line) */}
                <EditorDisclosure label="Advanced" hasData={!!form.categoryId}>
                  <div>
                    <label className="text-xs text-muted-foreground">Income Category (GL)</label>
                    <select value={form.categoryId} onChange={e => handleCategoryChange(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                      <option value="">No category</option>
                      {sortedCategoryList(categories.filter(c => c.type === 'income')).map(c => (
                        <option key={c.id} value={c.id}>{c.parentId ? '→ ' + c.name : c.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">Derived from the income line. Override here if needed.</p>
                  </div>
                </EditorDisclosure>
              </div>

              {/* Right panel — journal lines + options + tax + notes */}
              <div className="md:w-[62%] px-4 pb-4 space-y-2.5">
              {/* Journal Lines */}
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <div className="mb-2">
                  <p className="text-xs font-medium text-foreground">Journal Lines</p>
                  <p className="text-xs text-muted-foreground/70">Authoritative GL entries. When balanced, these are posted as-is — the Income Category (under Advanced) is derived from the income line.</p>
                </div>
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
                  <input type="checkbox" checked={form.showOnCalendar} onChange={e => setForm(p => ({ ...p, showOnCalendar: e.target.checked }))} className="rounded border-input" />
                  Show on calendar
                </label>
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
                {/* Posting status — replaces the raw "Posted to journals" checkbox.
                    Flips the SAME form.invoiceReceived the checkbox drove; handleSave
                    and GL posting are unchanged — only the widget differs. */}
                <div className="flex items-center gap-2">
                  {form.invoiceReceived
                    ? <StatusChip variant="ok" dot>Posted to journals</StatusChip>
                    : <StatusChip variant="soon" dot>Draft — not posted</StatusChip>}
                  <button type="button"
                    onClick={() => setForm(p => ({ ...p, invoiceReceived: !p.invoiceReceived }))}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                    <Receipt className="h-3.5 w-3.5" />
                    {form.invoiceReceived ? 'Mark as draft (unpost)' : 'Mark remittance received'}
                  </button>
                </div>
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
                      <p className="text-xs text-muted-foreground max-w-[200px]">
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

            </div>
          </div>
          </div>

          <DrawerFooter className="px-4 py-3 border-t border-border shrink-0">
            <button onClick={closeForm} className="w-full sm:w-auto rounded-md border border-border px-4 py-2.5 sm:py-1.5 text-sm">Cancel</button>
            <button onClick={handleSave} className="w-full sm:w-auto rounded-md bg-primary text-primary-foreground px-4 py-2.5 sm:py-1.5 text-sm font-medium">
              {editing ? 'Update' : 'Create'}
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={!!receivedConfirm} onOpenChange={open => { if (!open) setReceivedConfirm(null) }}>
        <DrawerContent className="sm:max-w-[900px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>Confirm Income Received</DrawerTitle>
          </DrawerHeader>

          {receivedConfirm && (
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-4 pt-3">
              <p className="text-sm text-muted-foreground">
                Recording <span className="font-medium text-foreground">{receivedConfirm.entry.name}</span> as received.
              </p>

              {/* Date + mode toggle */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Date received *</label>
                  <input type="date" value={receivedConfirmDate} onChange={e => setReceivedConfirmDate(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Entry mode</label>
                  <div className="flex mt-1 rounded-md border border-input overflow-hidden">
                    <button
                      onClick={() => setPayslipForm((p: PayslipFormData) => ({ ...p, enabled: false }))}
                      className={cn('flex-1 py-1.5 text-xs font-medium transition-colors',
                        !payslipForm.enabled ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground')}>
                      Simple
                    </button>
                    <button
                      onClick={() => setPayslipForm((p: PayslipFormData) => ({ ...p, enabled: true }))}
                      className={cn('flex-1 py-1.5 text-xs font-medium transition-colors',
                        payslipForm.enabled ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground')}>
                      Payslip
                    </button>
                  </div>
                </div>
              </div>

              {/* -- SIMPLE MODE ------------------------------------------- */}
              {!payslipForm.enabled && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Actual amount received</label>
                    <p className="text-xs text-muted-foreground/60 mb-1">Defaults to the expected amount — edit if your pay varied this period.</p>
                    <input type="number" step="0.01" value={receivedConfirmActualAmount}
                      onChange={e => setReceivedConfirmActualAmount(e.target.value)}
                      onFocus={e => e.currentTarget.select()}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Receive into GL account (bank)</label>
                    <select value={receivedConfirmGlAccountId} onChange={e => setReceivedConfirmGlAccountId(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1">
                      <option value="">Select GL account…</option>
                      {glAccounts.filter(a => a.type === 'asset').map(a => (
                        <option key={a.id} value={a.id}>{a.parentId ? ` → ${a.name}` : a.name}</option>
                      ))}
                    </select>
                    {!receivedConfirmGlAccountId && (
                      <p className="text-xs text-amber-500 mt-1">⚠ No GL account selected — balance sheet won&apos;t update</p>
                    )}
                  </div>
                </div>
              )}

              {/* -- PAYSLIP MODE ---------------------------------------- */}
              {payslipForm.enabled && (
                <div className="space-y-4">
                  <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                    Payslip mode builds a multi-line GL journal: DR Bank + PAYG + Deductions = CR Gross Income. Net Pay + PAYG + Deductions must equal Gross Pay.
                  </div>

                  {/* Pay period */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Pay period start</label>
                      <input type="date" value={payslipForm.payPeriodStart}
                        onChange={e => setPayslipForm((p: PayslipFormData) => ({ ...p, payPeriodStart: e.target.value }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Pay period end</label>
                      <input type="date" value={payslipForm.payPeriodEnd}
                        onChange={e => setPayslipForm((p: PayslipFormData) => ({ ...p, payPeriodEnd: e.target.value }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1" />
                    </div>
                  </div>

                  {/* Gross + GL */}
                  <div className="rounded-md border border-border p-3 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gross Income</p>
                    <div>
                      <label className="text-xs text-muted-foreground">Gross Pay *</label>
                      <input type="number" step="0.01" value={payslipForm.grossPay}
                        onChange={e => setPayslipForm((p: PayslipFormData) => ({ ...p, grossPay: e.target.value }))}
                        onFocus={e => e.currentTarget.select()}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1" />
                    </div>

                    {/* Pay components */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs text-muted-foreground">Pay components (breakdown of gross)</label>
                        <button onClick={() => setPayslipForm((p: PayslipFormData) => ({ ...p, components: [...p.components, { label: '', amount: 0 }] }))}
                          className="text-xs text-primary hover:underline">+ Add</button>
                      </div>
                      {payslipForm.components.map((c, i) => (
                        <div key={i} className="flex gap-2 mb-1.5">
                          <input placeholder="e.g. Base Pay" value={c.label}
                            onChange={e => setPayslipForm((p: PayslipFormData) => { const cs = [...p.components]; cs[i] = { ...cs[i], label: e.target.value }; return { ...p, components: cs } })}
                            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm" />
                          <input type="number" step="0.01" value={c.amount || ''} placeholder="0.00"
                            onChange={e => setPayslipForm((p: PayslipFormData) => { const cs = [...p.components]; cs[i] = { ...cs[i], amount: parseFloat(e.target.value) || 0 }; return { ...p, components: cs } })}
                            onFocus={e => e.currentTarget.select()}
                            className="w-28 rounded-md border border-input bg-background px-2 py-1 text-sm text-right" />
                          <button onClick={() => setPayslipForm((p: PayslipFormData) => ({ ...p, components: p.components.filter((_, j) => j !== i) }))}
                            className="text-red-500 hover:text-red-600 px-1">×</button>
                        </div>
                      ))}
                      {payslipForm.components.length > 0 && (
                        <p className="text-xs text-muted-foreground/60">Components total: {formatCurrency(payslipForm.components.reduce((s, c) => s + (c.amount || 0), 0))} — informational only, must sum to Gross Pay.</p>
                      )}
                    </div>
                  </div>

                  {/* PAYG withheld */}
                  <div className="rounded-md border border-border p-3 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">PAYG Withheld</p>
                    <div>
                      <label className="text-xs text-muted-foreground">PAYG withheld amount</label>
                      <input type="number" step="0.01" value={payslipForm.paygWithheld}
                        onChange={e => setPayslipForm((p: PayslipFormData) => ({ ...p, paygWithheld: e.target.value }))}
                        onFocus={e => e.currentTarget.select()}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1" />
                    </div>
                  </div>

                  {/* Deductions */}
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deductions</p>
                      <button onClick={() => setPayslipForm((p: PayslipFormData) => ({ ...p, deductions: [...p.deductions, { label: '', amount: 0, glAccountId: null }] }))}
                        className="text-xs text-primary hover:underline">+ Add deduction</button>
                    </div>
                    {payslipForm.deductions.map((d, i) => (
                      <div key={i} className="grid gap-2" style={{ gridTemplateColumns: '1fr 90px 24px' }}>
                        <input placeholder="e.g. Salary Sacrifice" value={d.label}
                          onChange={e => setPayslipForm((p: PayslipFormData) => { const ds = [...p.deductions]; ds[i] = { ...ds[i], label: e.target.value }; return { ...p, deductions: ds } })}
                          className="rounded-md border border-input bg-background px-2 py-1 text-sm" />
                        <input type="number" step="0.01" value={d.amount || ''} placeholder="0.00"
                          onChange={e => setPayslipForm((p: PayslipFormData) => { const ds = [...p.deductions]; ds[i] = { ...ds[i], amount: parseFloat(e.target.value) || 0 }; return { ...p, deductions: ds } })}
                          onFocus={e => e.currentTarget.select()}
                          className="rounded-md border border-input bg-background px-2 py-1 text-sm text-right" />
                        <button onClick={() => setPayslipForm((p: PayslipFormData) => ({ ...p, deductions: p.deductions.filter((_, j) => j !== i) }))}
                          className="text-red-500 hover:text-red-600">×</button>
                      </div>
                    ))}
                  </div>

                  {/* SGC super */}
                  <div className="rounded-md border border-border p-3 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SGC Super (Informational)</p>
                    <p className="text-xs text-muted-foreground/60">Employer SGC is recorded for tax reporting. It doesn&apos;t affect your net pay or the journal balance.</p>
                    <div>
                      <label className="text-xs text-muted-foreground">SGC amount</label>
                      <input type="number" step="0.01" value={payslipForm.sgcAmount}
                        onChange={e => setPayslipForm((p: PayslipFormData) => ({ ...p, sgcAmount: e.target.value }))}
                        onFocus={e => e.currentTarget.select()}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1" />
                    </div>
                  </div>

                  {/* Net pay + bank GL */}
                  <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Take-Home</p>
                    <div>
                      <label className="text-xs text-muted-foreground">Net Pay (take-home) *</label>
                      <input type="number" step="0.01" value={payslipForm.netPay}
                        onChange={e => setPayslipForm((p: PayslipFormData) => ({ ...p, netPay: e.target.value }))}
                        onFocus={e => e.currentTarget.select()}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1" />
                    </div>
                    {/* Balance indicator */}
                    {(() => {
                      const gross = parseFloat(payslipForm.grossPay) || 0
                      const net   = parseFloat(payslipForm.netPay)   || 0
                      const payg  = parseFloat(payslipForm.paygWithheld) || 0
                      const deds  = payslipForm.deductions.reduce((s, d) => s + (d.amount || 0), 0)
                      const diff  = Math.abs(gross - net - payg - deds)
                      const balanced = diff < 0.005
                      return (
                        <div className={cn('rounded-md px-3 py-2 text-xs font-medium flex items-center justify-between',
                          balanced ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-red-500/10 text-red-600')}>
                          <span>{balanced ? '✓ Balanced — journal will post correctly' : `⚠ Out of balance by ${formatCurrency(diff)}`}</span>
                          <span>{balanced ? '' : `Net + PAYG + Deductions = ${formatCurrency(net + payg + deds)} vs Gross ${formatCurrency(gross)}`}</span>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Advanced — GL account mapping. Auto-mapped from the payslip on open
                      (handleMarkReceived); expand to override. Bindings are unchanged —
                      the journal posts identically: DR Bank + PAYG + Deductions = CR Gross Income. */}
                  <EditorDisclosure
                    label="Advanced — GL account mapping"
                    defaultOpen={!payslipForm.grossIncomeGlAccountId || !payslipForm.bankGlAccountId}
                    hasData={!!payslipForm.grossIncomeGlAccountId || !!payslipForm.bankGlAccountId || !!payslipForm.paygGlAccountId || !!payslipForm.sgcGlAccountId || payslipForm.deductions.some(d => !!d.glAccountId)}
                  >
                    <div className="space-y-3 rounded-md border border-border p-3">
                      <p className="text-xs text-muted-foreground/60">Auto-mapped from the payslip. The journal posts DR Bank + PAYG + Deductions = CR Gross Income — override only if an account is wrong.</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground">Gross Income GL account *</label>
                          <select value={payslipForm.grossIncomeGlAccountId}
                            onChange={e => setPayslipForm((p: PayslipFormData) => ({ ...p, grossIncomeGlAccountId: e.target.value }))}
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1">
                            <option value="">Select GL account…</option>
                            {glAccounts.filter(a => a.type === 'income').map(a => (
                              <option key={a.id} value={a.id}>{a.parentId ? ` → ${a.name}` : a.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Bank / Take-home GL account *</label>
                          <select value={payslipForm.bankGlAccountId}
                            onChange={e => setPayslipForm((p: PayslipFormData) => ({ ...p, bankGlAccountId: e.target.value }))}
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1">
                            <option value="">Select GL account…</option>
                            {glAccounts.filter(a => a.type === 'asset').map(a => (
                              <option key={a.id} value={a.id}>{a.parentId ? ` → ${a.name}` : a.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">PAYG GL account (liability / expense)</label>
                          <select value={payslipForm.paygGlAccountId}
                            onChange={e => setPayslipForm((p: PayslipFormData) => ({ ...p, paygGlAccountId: e.target.value }))}
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1">
                            <option value="">Select GL account…</option>
                            {glAccounts.filter(a => a.type === 'liability' || a.type === 'expense').map(a => (
                              <option key={a.id} value={a.id}>{a.parentId ? ` → ${a.name}` : a.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">SGC GL account (optional)</label>
                          <select value={payslipForm.sgcGlAccountId}
                            onChange={e => setPayslipForm((p: PayslipFormData) => ({ ...p, sgcGlAccountId: e.target.value }))}
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1">
                            <option value="">Select GL account…</option>
                            {glAccounts.filter(a => a.type === 'asset' || a.type === 'liability').map(a => (
                              <option key={a.id} value={a.id}>{a.parentId ? ` → ${a.name}` : a.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {payslipForm.deductions.length > 0 && (
                        <div className="space-y-1.5">
                          <label className="text-xs text-muted-foreground">Per-deduction GL accounts</label>
                          {payslipForm.deductions.map((d, i) => (
                            <div key={i} className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 1fr' }}>
                              <span className="text-sm truncate text-muted-foreground">{d.label || `Deduction ${i + 1}`}</span>
                              <select value={d.glAccountId ?? ''}
                                onChange={e => setPayslipForm((p: PayslipFormData) => { const ds = [...p.deductions]; ds[i] = { ...ds[i], glAccountId: e.target.value || null }; return { ...p, deductions: ds } })}
                                className="rounded-md border border-input bg-background px-2 py-1 text-sm">
                                <option value="">No GL account</option>
                                {glAccounts.filter(a => a.type === 'expense' || a.type === 'asset' || a.type === 'liability').map(a => (
                                  <option key={a.id} value={a.id}>{a.parentId ? ` → ${a.name}` : a.name}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </EditorDisclosure>

                  {/* Notes */}
                  <div>
                    <label className="text-xs text-muted-foreground">Notes (optional)</label>
                    <textarea value={payslipForm.notes} rows={2}
                      onChange={e => setPayslipForm((p: PayslipFormData) => ({ ...p, notes: e.target.value }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none mt-1" />
                  </div>
                </div>
              )}
            </div>
          )}

          <DrawerFooter className="border-t border-border">
            <button onClick={() => setReceivedConfirm(null)} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button
              onClick={confirmMarkReceived}
              disabled={payslipForm.enabled
                ? !payslipForm.grossIncomeGlAccountId || !payslipForm.bankGlAccountId
                : !receivedConfirmGlAccountId
              }
              className="rounded-md bg-green-600 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              Mark as received
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

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
              onEdit={openEdit} onDelete={handleDelete} onVoid={handleVoid} hideDelete={hideDeleteBills}
              onMarkReceived={handleMarkReceived} onToggleInvoice={handleToggleInvoice}
              att={att} />
          ))}
          {upcoming.map(e => (
            <IncomeRow key={e.id} entry={e} nextExpected={getNextExpected(e)} isOverdue={false}
              colCats={colCats} entryAmountForCat={entryAmountForCat} gridTemplate={gridTemplate}
              onEdit={openEdit} onDelete={handleDelete} onVoid={handleVoid} hideDelete={hideDeleteBills}
              onMarkReceived={handleMarkReceived} onToggleInvoice={handleToggleInvoice}
              att={att} />
          ))}
          {futureScheduled.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground px-1 flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3" />
                Scheduled beyond {dateRange === '14' ? '14 days' : dateRange === '30' ? '30 days' : dateRange === 'quarter' ? 'this quarter' : '12 months'}
              </p>
              {futureScheduled.map(e => (
                <IncomeRow key={e.id} entry={e} nextExpected={getNextExpected(e)} isOverdue={false}
                  colCats={colCats} entryAmountForCat={entryAmountForCat} gridTemplate={gridTemplate}
                  onEdit={openEdit} onDelete={handleDelete} onVoid={handleVoid} hideDelete={hideDeleteBills}
                  onMarkReceived={handleMarkReceived} onToggleInvoice={handleToggleInvoice}
                  att={att} />
              ))}
            </div>
          )}
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
