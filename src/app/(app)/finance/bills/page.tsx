'use client'

import {
  Plus, Pencil, Trash2, Bell, Settings2, CheckCircle2, Receipt, CreditCard,
  RefreshCw, Layers, X, Building2,
  BookmarkCheck, Briefcase, Ban,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
import { JournalLinesEditor } from '@/components/finance/JournalLinesEditor'
import { useAttachmentManager } from '@/hooks/finance/useAttachmentManager'
import { useBillCrud, type Bill } from '@/hooks/finance/useBillCrud'
import { BillRow } from '@/components/finance/BillRow'

export type { Bill } from '@/hooks/finance/useBillCrud'

export default function BillsPage() {
  const {
    bills, loading, showForm, editing,
    journalLines, setJournalLines,
    journalErrors, setJournalErrors,
    form, setForm, errors,
    categories, glAccounts, members, locations, vendors, entities,
    budgetBillIds,
    paidConfirm, setPaidConfirm,
    paidConfirmDate, setPaidConfirmDate,
    paidConfirmGlAccountId, setPaidConfirmGlAccountId,
    paidConfirmAmount, setPaidConfirmAmount,
    deleteConfirm, setDeleteConfirm,
    voidConfirm, setVoidConfirm,
    voidNote, setVoidNote,
    dateRange, setDateRangePersisted,
    selectedCatIds, showCatPicker, setShowCatPicker, toggleCat,
    quickFilter,
    hideDeleteBills,
    rootCategories, overdue, overdueOneOff, upcoming, visibleBills,
    colCats, grandTotal, catTotals, gridTemplate,
    paymentHistory,
    openNew, openEdit, closeForm,
    handleSave, handleDelete, confirmDelete,
    handleVoid, confirmVoid,
    handleMarkPaid, confirmMarkPaid,
    handleToggleInvoice, handleUnmarkPaid,
    handleCategoryChange, handleVendorChange,
    handleQuickFilter,
    getNextDue, billAmountForCat,
  } = useBillCrud()

  const att = useAttachmentManager('/api/finance/bills')

  if (loading) return <div className="p-4 text-muted-foreground">Loading bills&hellip;</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Bills &amp; Recurring</h1>

      {/* Filters */}
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

        <Link href="/finance/paid-bills"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
          <CheckCircle2 className="h-3.5 w-3.5" /> Paid Bills
        </Link>

        <button onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Bill
        </button>

        {quickFilter && (
          <button
            onClick={() => handleQuickFilter(quickFilter)}
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
                  <button onClick={() => handleToggleInvoice(b)} title={b.invoiceReceived ? 'Unpost' : 'Post bill — Debit Expense / Credit AP'} className={`p-1 hover:bg-red-500/10 rounded ${b.invoiceReceived ? 'text-green-500' : 'text-muted-foreground hover:text-green-500'}`}><CheckCircle2 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleMarkPaid(b)} title="Record payment — Debit AP / Credit bank" className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-blue-500"><CreditCard className="h-3.5 w-3.5" /></button>
                  <button onClick={() => openEdit(b)} title="Edit bill" className="p-1 hover:bg-red-500/10 rounded text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleVoid(b.id, b.name)} title="Void — keeps audit trail" className="p-1 hover:bg-red-500/10 rounded text-amber-500"><Ban className="h-3.5 w-3.5" /></button>
                  {!hideDeleteBills && <button onClick={() => handleDelete(b.id, b.name)} title="Delete permanently" className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>}
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
                </div>
                <span className="font-medium shrink-0">{formatCurrency(b.amount)}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => handleToggleInvoice(b)} title={b.invoiceReceived ? 'Unpost' : 'Post bill — Debit Expense / Credit AP'} className={`p-1 hover:bg-orange-500/10 rounded ${b.invoiceReceived ? 'text-green-500' : 'text-muted-foreground hover:text-green-500'}`}><CheckCircle2 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleMarkPaid(b)} title="Record payment — Debit AP / Credit bank" className="p-1 hover:bg-orange-500/10 rounded text-muted-foreground hover:text-blue-500"><CreditCard className="h-3.5 w-3.5" /></button>
                  <button onClick={() => openEdit(b)} title="Edit bill" className="p-1 hover:bg-orange-500/10 rounded text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleVoid(b.id, b.name)} title="Void — keeps audit trail" className="p-1 hover:bg-orange-500/10 rounded text-amber-500"><Ban className="h-3.5 w-3.5" /></button>
                  {!hideDeleteBills && <button onClick={() => handleDelete(b.id, b.name)} title="Delete permanently" className="p-1 hover:bg-orange-500/10 rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bill form dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { closeForm(); } }}>
        <ResizableDialogContent className="flex flex-col overflow-hidden p-0" showCloseButton={true} minWidth={600} minHeight={400} fitViewport storageKey="dialog-size-v2:bill-form">

          {/* Fixed header */}
          <div className="px-4 pt-4 pb-0 shrink-0">
            <DialogHeader><DialogTitle>{editing ? 'Edit Bill' : 'New Bill'}</DialogTitle></DialogHeader>
            {Object.keys(errors).length > 0 && (
              <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 mt-3">
                <p className="text-xs text-red-500 font-medium">Please fix the following errors:</p>
                <ul className="list-disc list-inside text-xs text-red-500/80 mt-1">
                  {Object.values(errors).map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}
            <div className="flex gap-4 py-3">
              {(['recurring', 'one-off'] as const).map(bt => (
                <label key={bt} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="billType" value={bt} checked={form.billType === bt}
                    onChange={() => setForm(p => ({ ...p, billType: bt }))} className="accent-primary" />
                  {bt === 'recurring' ? <><RefreshCw className="h-3.5 w-3.5 text-blue-500" /> Recurring</> : <><Layers className="h-3.5 w-3.5 text-orange-500" /> One-off</>}
                </label>
              ))}
            </div>
          </div>

          {/* Two-column body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="flex flex-col md:flex-row">
              {/* Left panel */}
              <div className="md:w-1/2 px-4 pb-4 space-y-2.5 md:border-r md:border-border">
              <div className="grid grid-cols-2 gap-2">
                {/* Name — full width */}
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Name *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    className={cn('w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm', errors.name && 'border-red-500')} />
                  {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
                </div>
                {/* Amount + Frequency (or Assigned To for one-off) */}
                <div>
                  <label className="text-xs text-muted-foreground">Amount *</label>
                  <input type="number" step="0.01" value={form.amount || ''}
                    onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                    onFocus={e => e.target.select()}
                    className={cn('w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm', errors.amount && 'border-red-500')} />
                  {errors.amount && <p className="text-xs text-red-500 mt-0.5">{errors.amount}</p>}
                </div>
                {form.billType === 'recurring' ? (
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
                ) : (
                  <div>
                    <label className="text-xs text-muted-foreground">Assigned To</label>
                    <select value={form.memberId} onChange={e => setForm(p => ({ ...p, memberId: e.target.value }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                      <option value="">Shared</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                )}
                {/* Financial Contact — full width (needs link button) */}
                <div className="col-span-2">
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
                {/* Due Date + End Date */}
                <div>
                  <label className="text-xs text-muted-foreground">{form.billType === 'one-off' ? 'Due Date *' : 'Next Due Date *'}</label>
                  <input type="date" value={form.nextDueDate} onChange={e => setForm(p => ({ ...p, nextDueDate: e.target.value }))}
                    className={cn('w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm', errors.nextDueDate && 'border-red-500')} />
                  {errors.nextDueDate && <p className="text-xs text-red-500 mt-0.5">{errors.nextDueDate}</p>}
                </div>
                {form.billType === 'recurring' ? (
                  <div>
                    <label className="text-xs text-muted-foreground">End Date (optional)</label>
                    <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
                  </div>
                ) : <div />}
                {/* Assigned To + Entity (recurring only — one-off has Assigned To above) */}
                {form.billType === 'recurring' && (
                  <div>
                    <label className="text-xs text-muted-foreground">Assigned To</label>
                    <select value={form.memberId} onChange={e => setForm(p => ({ ...p, memberId: e.target.value }))}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                      <option value="">Shared</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="h-3 w-3" /> Entity / Fund</label>
                  <select value={form.entityId} onChange={e => setForm(p => ({ ...p, entityId: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                    <option value="">Select entity&hellip;</option>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.name}{e.isDefault ? ' (default)' : ''}</option>)}
                  </select>
                </div>
                {/* Tax Classification + Expense Category */}
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
                  <label className="text-xs text-muted-foreground">Expense Category (GL)</label>
                  <select value={form.categoryId} onChange={e => handleCategoryChange(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm">
                    <option value="">No category</option>
                    {sortedCategoryList(categories.filter(c => c.type === 'expense')).map(c => (
                      <option key={c.id} value={c.id}>{c.parentId ? '— ' + c.name : c.name}</option>
                    ))}
                  </select>
                </div>
                {/* Notes — left column, full width */}
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <textarea value={form.notes} rows={2} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm resize-none" />
                </div>
              </div>
              </div>

              {/* Right panel */}
              <div className="md:w-1/2 px-4 pb-4 space-y-2.5">
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
              <div className="flex flex-wrap gap-4 pt-1">
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
                    <option key={c.id} value={c.id}>{c.parentId ? `— ${c.name}` : c.name}</option>
                  ))}
                </select>
                {!paidConfirmGlAccountId && (
                  <p className="text-xs text-amber-500 mt-1">⚠ No GL account selected — balance sheet won't update</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setPaidConfirm(null)} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={confirmMarkPaid} className="rounded-md bg-green-600 text-white px-4 py-1.5 text-sm font-medium">Record payment</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void confirmation */}
      <Dialog open={!!voidConfirm} onOpenChange={open => { if (!open) setVoidConfirm(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={true}>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Ban className="h-4 w-4 text-amber-500" /> Void bill</DialogTitle></DialogHeader>
          {voidConfirm && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">Void <span className="font-medium text-foreground">{voidConfirm.name}</span>?</p>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 space-y-1">
                <p className="font-medium">What void does:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Creates reversal journal entries in the GL</li>
                  <li>Bill and journals kept for audit trail</li>
                  <li>Bill removed from active lists and reports</li>
                </ul>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Reason (optional)</label>
                <input value={voidNote} onChange={e => setVoidNote(e.target.value)} placeholder="e.g. Entered in error"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1" />
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setVoidConfirm(null)} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={confirmVoid} className="rounded-md bg-amber-600 text-white px-4 py-1.5 text-sm font-medium">Void bill</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={open => { if (!open) setDeleteConfirm(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={true}>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Trash2 className="h-4 w-4 text-red-500" /> Delete bill</DialogTitle></DialogHeader>
          {deleteConfirm && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">Permanently delete <span className="font-medium text-foreground">{deleteConfirm.name}</span>?</p>
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700 space-y-1">
                <p className="font-medium">Warning — cannot be undone:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>GL journal entries will be reversed</li>
                  <li>Associated transactions permanently deleted</li>
                  <li>No audit trail kept — consider Void instead</li>
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setDeleteConfirm(null)} className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={confirmDelete} className="rounded-md bg-red-600 text-white px-4 py-1.5 text-sm font-medium">Delete permanently</button>
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
            <BillRow
              key={b.id}
              bill={b}
              nextDue={getNextDue(b)}
              isOverdue={overdue.includes(b)}
              colCats={colCats}
              billAmountForCat={billAmountForCat}
              gridTemplate={gridTemplate}
              inBudget={budgetBillIds.has(b.id)}
              hideDelete={hideDeleteBills}
              onEdit={openEdit}
              onDelete={handleDelete}
              onVoid={handleVoid}
              onMarkPaid={handleMarkPaid}
              onUnmarkPaid={handleUnmarkPaid}
              onToggleInvoice={handleToggleInvoice}
              onQuickFilter={handleQuickFilter}
              att={att}
              glAccounts={glAccounts}
              // Payment history — from usePaymentHistory via useBillCrud
              openBillId={paymentHistory.openBillId}
              payments={paymentHistory.payments}
              loadingHistory={paymentHistory.loadingHistory}
              showAddForm={paymentHistory.showAddForm}
              addForm={paymentHistory.addForm}
              setAddForm={paymentHistory.setAddForm}
              addingPayment={paymentHistory.addingPayment}
              deletingPaymentId={paymentHistory.deletingPaymentId}
              onOpenPanel={paymentHistory.openPanel}
              onClosePanel={paymentHistory.closePanel}
              onOpenAddForm={paymentHistory.openAddForm}
              onCancelAddForm={paymentHistory.cancelAddForm}
              onSubmitAddPayment={paymentHistory.submitAddPayment}
              onDeletePayment={paymentHistory.deletePayment}
            />
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
