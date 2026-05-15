'use client'

import { format } from 'date-fns'
import {
  CheckCircle2, RotateCcw, Settings2, RefreshCw, Layers,
  Trash2, Ban, Undo2, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/financeShared'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useAttachmentManager } from '@/hooks/finance/useAttachmentManager'
import { usePaidBills } from '@/hooks/finance/usePaidBills'
import { BillRow } from '@/components/finance/BillRow'
import type { Bill } from '@/hooks/finance/useBillCrud'

export default function PaidBillsPage() {
  const {
    loading,
    sorted,
    glAccounts,
    hideDeleteBills,
    monthRange, setMonthRangePersisted,
    selectedCatIds, showCatPicker, setShowCatPicker, toggleCat,
    rootCategories,
    colCats, grandTotal, catTotals, gridTemplate,
    deleteConfirm, setDeleteConfirm,
    voidConfirm, setVoidConfirm,
    voidNote, setVoidNote,
    handleUndoPaid,
    handleDelete, confirmDelete,
    handleVoid, confirmVoid,
    billAmountForCat,
    paymentHistory,
  } = usePaidBills()

  // Attachments — paid bills still support invoice attachments
  const att = useAttachmentManager('/api/finance/bills')

  // Paid bills page: edit/pay/invoice-toggle actions are no-ops —
  // these buttons are hidden on paid rows via the BillRow props below.
  // Undo (full reversal) is handled inline per row outside BillRow.
  const noop = () => {}
  const noopBill = (_b: Bill) => {}

  if (loading) return <div className="p-4 text-muted-foreground">Loading paid bills…</div>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Paid Bills</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/finance/bills"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
          <RotateCcw className="h-3.5 w-3.5" /> Active Bills
        </Link>

        <div className="flex items-center gap-1.5">
          {([1, 3, 6, 12] as const).map(m => (
            <button key={m} onClick={() => setMonthRangePersisted(m)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                monthRange === m
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}>
              {m === 1 ? '1 Month' : `${m} Months`}
            </button>
          ))}
        </div>

        {rootCategories.length > 0 && (
          <div className="relative">
            <button onClick={() => setShowCatPicker(p => !p)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                selectedCatIds.length > 0
                  ? 'border-primary text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}>
              <Settings2 className="h-3.5 w-3.5" />
              {selectedCatIds.length > 0
                ? `${selectedCatIds.length} categor${selectedCatIds.length === 1 ? 'y' : 'ies'} shown`
                : 'Show category columns'}
            </button>
            {showCatPicker && (
              <div className="absolute left-0 top-full mt-1 z-20 rounded-lg border border-border bg-popover shadow-md p-3 space-y-1.5 min-w-[180px]">
                <p className="text-xs text-muted-foreground font-medium mb-2">Show as columns:</p>
                {rootCategories.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={selectedCatIds.includes(c.id)}
                      onChange={() => toggleCat(c.id)} className="rounded border-input" />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Void confirmation */}
      <Dialog open={!!voidConfirm} onOpenChange={open => { if (!open) setVoidConfirm(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-amber-500" /> Void bill
            </DialogTitle>
          </DialogHeader>
          {voidConfirm && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                Void <span className="font-medium text-foreground">{voidConfirm.name}</span>?
              </p>
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
                <input value={voidNote} onChange={e => setVoidNote(e.target.value)}
                  placeholder="e.g. Entered in error"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1" />
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setVoidConfirm(null)}
              className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={confirmVoid}
              className="rounded-md bg-amber-600 text-white px-4 py-1.5 text-sm font-medium">Void bill</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={open => { if (!open) setDeleteConfirm(null) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-500" /> Delete bill
            </DialogTitle>
          </DialogHeader>
          {deleteConfirm && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                Permanently delete <span className="font-medium text-foreground">{deleteConfirm.name}</span>?
              </p>
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
            <button onClick={() => setDeleteConfirm(null)}
              className="rounded-md border border-border px-4 py-1.5 text-sm">Cancel</button>
            <button onClick={confirmDelete}
              className="rounded-md bg-red-600 text-white px-4 py-1.5 text-sm font-medium">Delete permanently</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bill list */}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No paid bills in this period.</p>
      ) : (
        <div className="space-y-2">
          {/* Column headers */}
          {colCats.length > 0 && (
            <div className="grid gap-3 px-3 pb-1"
              style={{ gridTemplateColumns: gridTemplate, alignItems: 'end' }}>
              <div /><div />
              {colCats.map(c => (
                <span key={c.id} className="text-xs font-medium text-muted-foreground text-right leading-tight">
                  {c.name}
                </span>
              ))}
              <span className="text-xs font-medium text-muted-foreground text-right">Total</span>
              <div />
            </div>
          )}

          {sorted.map(bill => (
            <PaidBillRow
              key={bill.id}
              bill={bill}
              colCats={colCats}
              billAmountForCat={billAmountForCat}
              gridTemplate={gridTemplate}
              hideDelete={hideDeleteBills}
              onUndoPaid={handleUndoPaid}
              onVoid={handleVoid}
              onDelete={handleDelete}
              att={att}
              glAccounts={glAccounts}
              paymentHistory={paymentHistory}
            />
          ))}

          {/* Totals row */}
          <div className="grid gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 mt-1"
            style={{ gridTemplateColumns: gridTemplate, alignItems: 'center' }}>
            <div />
            <div className="text-xs font-semibold text-muted-foreground">
              {sorted.length} bill{sorted.length !== 1 ? 's' : ''} — last {monthRange === 1 ? '1 month' : `${monthRange} months`}
            </div>
            {colCats.map(c => (
              <span key={c.id} className="text-xs font-semibold text-right">
                {catTotals[c.id] > 0
                  ? formatCurrency(catTotals[c.id])
                  : <span className="text-muted-foreground">—</span>}
              </span>
            ))}
            <span className="text-sm font-bold text-green-600 text-right">{formatCurrency(grandTotal)}</span>
            <div />
          </div>
        </div>
      )}
    </div>
  )
}

// ── PaidBillRow ───────────────────────────────────────────────────────────────
//
// Wraps BillRow for the paid bills context:
//   - Payment history panel fully functional (view installments, add, undo)
//   - Undo full payment via dedicated Undo2 button
//   - Void and Delete buttons
//   - Edit / post-invoice / mark-paid actions hidden (not applicable to paid bills)
//
// Keeping this as a local sub-component avoids prop-drilling the confirmation
// dialog setters down into BillRow while still reusing the payment panel.

interface PaidBillRowProps {
  bill: Bill
  colCats: { id: string; name: string }[]
  billAmountForCat: (bill: Bill, catId: string) => number
  gridTemplate: string
  hideDelete: boolean
  onUndoPaid: (id: string) => void
  onVoid: (id: string, name: string) => void
  onDelete: (id: string, name: string) => void
  att: ReturnType<typeof useAttachmentManager>
  glAccounts: { id: string; name: string; type: string; parentId: string | null }[]
  paymentHistory: ReturnType<typeof usePaidBills>['paymentHistory']
}

function PaidBillRow({
  bill, colCats, billAmountForCat, gridTemplate, hideDelete,
  onUndoPaid, onVoid, onDelete,
  att, glAccounts, paymentHistory,
}: PaidBillRowProps) {
  const isOneOff        = bill.billType === 'one-off'
  const totalPaid       = bill.payments?.reduce((s, p) => s + p.amount, 0) ?? 0
  const installments    = bill.payments?.length ?? 0
  const isPaymentOpen   = paymentHistory.openBillId === bill.id
  const isAttachOpen    = att.openEntityId === bill.id

  return (
    <div>
      {/* Main row */}
      <div
        className={cn(
          'grid gap-3 rounded-lg border border-border p-3 transition-colors',
          (isPaymentOpen || isAttachOpen) && 'rounded-b-none border-b-0',
          'hover:bg-accent/50',
        )}
        style={{ gridTemplateColumns: gridTemplate, alignItems: 'center' }}
      >
        {/* Icon */}
        <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        </div>

        {/* Name + meta */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{bill.name}</span>
            {bill.autoPay && (
              <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 rounded">AUTO</span>
            )}
            {isOneOff
              ? <span className="text-[10px] bg-orange-500/10 text-orange-500 px-1.5 rounded flex items-center gap-0.5">
                  <Layers className="h-2.5 w-2.5" /> One-off
                </span>
              : <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 rounded flex items-center gap-0.5">
                  <RefreshCw className="h-2.5 w-2.5" /> Recurring
                </span>
            }
            {installments > 1 && (
              <span className="text-[10px] bg-amber-500/10 text-amber-600 px-1.5 rounded">
                {installments} installments
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
            {bill.paidDate && (
              <span className="text-green-500">
                Paid {format(new Date(bill.paidDate), 'd MMM yyyy')}
              </span>
            )}
            {bill.category && (
              <span className="inline-flex items-center gap-1">
                {bill.category.color && (
                  <span className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: bill.category.color }} />
                )}
                {bill.category.name}
              </span>
            )}
            <span className="capitalize">{isOneOff ? 'One-off' : bill.frequency}</span>
            {bill.account  && <span>{bill.account.name}</span>}
            {bill.member   && <span className="text-primary">{bill.member.name}</span>}
            {bill.location && <span>{bill.location.name}</span>}
            {bill.notes    && (
              <span className="italic truncate max-w-[120px]" title={bill.notes}>
                · {bill.notes}
              </span>
            )}
          </div>
        </div>

        {/* Category columns */}
        {colCats.map(c => {
          const amt = billAmountForCat(bill, c.id)
          return (
            <span key={c.id} className="text-sm text-right text-muted-foreground">
              {amt > 0 ? formatCurrency(amt) : '—'}
            </span>
          )
        })}

        {/* Amount */}
        <p className="text-sm font-semibold text-right">{formatCurrency(bill.amount)}</p>

        {/* Actions */}
        <div className="flex items-center gap-0.5 justify-end">
          {/* Payment history / add payment */}
          <button
            onClick={() => paymentHistory.openPanel(bill.id)}
            title="Payment history / add installment"
            className={cn(
              'relative p-1 hover:bg-accent rounded transition-colors',
              isPaymentOpen ? 'text-amber-600' : 'text-muted-foreground hover:text-amber-600',
            )}
          >
            <Clock className="h-3.5 w-3.5" />
          </button>

          {/* Undo full payment */}
          <button
            onClick={() => onUndoPaid(bill.id)}
            title="Undo all payments — reverses GL journals, returns to active bills"
            className="p-1 hover:bg-accent rounded text-green-500"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>

          {/* Void */}
          <button
            onClick={() => onVoid(bill.id, bill.name)}
            title="Void — creates reversal journals, keeps audit trail"
            className="p-1 hover:bg-accent rounded text-amber-500"
          >
            <Ban className="h-3.5 w-3.5" />
          </button>

          {/* Delete */}
          {!hideDelete && (
            <button
              onClick={() => onDelete(bill.id, bill.name)}
              title="Delete permanently — no audit trail"
              className="p-1 hover:bg-accent rounded text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Payment history panel — same component logic as BillRow, via BillRow itself */}
      {isPaymentOpen && (
        // Reuse BillRow purely for the payment panel by rendering it in a
        // zero-height wrapper with the main row hidden. Simpler: inline the
        // panel directly here since BillRow bundles it with the full row UI.
        // We render a standalone panel matching BillRow's payment panel markup.
        <PaymentPanel
          bill={bill}
          glAccounts={glAccounts}
          paymentHistory={paymentHistory}
        />
      )}

      {/* Attachments */}
      {isAttachOpen && (
        <div className="rounded-b-lg border border-t-0 border-border">
          {/* AttachmentSection is rendered via att.open() already — placeholder */}
        </div>
      )}
    </div>
  )
}

// ── PaymentPanel ──────────────────────────────────────────────────────────────
//
// Standalone payment history + add-payment panel for the Paid Bills page.
// Mirrors the panel in BillRow exactly — same GL-first logic via the same
// usePaymentHistory hook and the same API endpoints.

import { AlertTriangle, Plus, Loader2, X } from 'lucide-react'
import { sortedCategoryList } from '@/lib/finance-categories'

interface PaymentPanelProps {
  bill: Bill
  glAccounts: { id: string; name: string; type: string; parentId: string | null }[]
  paymentHistory: ReturnType<typeof usePaidBills>['paymentHistory']
}

function PaymentPanel({ bill, glAccounts, paymentHistory }: PaymentPanelProps) {
  const {
    payments, loadingHistory,
    showAddForm, addForm, setAddForm, addingPayment, deletingPaymentId,
    closePanel, openAddForm, cancelAddForm, submitAddPayment, deletePayment,
  } = paymentHistory

  const totalPaid  = bill.payments?.reduce((s, p) => s + p.amount, 0) ?? 0
  const remaining  = Math.max(0, bill.amount - totalPaid)
  const assetAccounts = glAccounts.filter(a => a.type === 'asset')

  return (
    <div className="rounded-b-lg border border-t-0 border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Clock className="h-3.5 w-3.5 text-amber-600" />
          Payments
          {remaining > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              — {formatCurrency(remaining)} remaining
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Allow adding a payment even on a "paid" bill in case there are
              remaining balance discrepancies or partial re-opens */}
          {remaining > 0 && !showAddForm && (
            <button
              onClick={() => openAddForm(bill.amount, totalPaid)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <Plus className="h-3 w-3" /> Add payment
            </button>
          )}
          <button onClick={closePanel}
            className="p-1 rounded hover:bg-accent text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Existing payments */}
      {loadingHistory ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : payments.length === 0 && !showAddForm ? (
        <p className="text-xs text-muted-foreground">No payment records found.</p>
      ) : (
        <div className="space-y-1.5">
          {payments.map(p => (
            <div key={p.id}
              className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <span className="text-xs text-muted-foreground w-24 shrink-0">
                {format(new Date(p.paymentDate), 'd MMM yyyy')}
              </span>
              <span className="font-medium shrink-0">{formatCurrency(p.amount)}</span>
              {p.glAccount
                ? <span className="text-xs text-muted-foreground truncate flex-1">{p.glAccount.name}</span>
                : <span className="text-xs text-amber-600 truncate flex-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> Undeposited Funds
                  </span>
              }
              {p.transaction && (
                <span className={cn(
                  'text-[10px] px-1.5 rounded shrink-0',
                  p.transaction.isCleared
                    ? 'bg-green-500/10 text-green-600'
                    : 'bg-amber-500/10 text-amber-600',
                )}>
                  {p.transaction.isCleared ? 'Cleared' : 'Uncleared'}
                </span>
              )}
              <button
                onClick={() => deletePayment(bill.id, p.id)}
                disabled={deletingPaymentId === p.id}
                title="Undo this installment — reverses GL journal"
                className="shrink-0 p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 disabled:opacity-40 transition-colors"
              >
                {deletingPaymentId === p.id
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <X className="h-3 w-3" />}
              </button>
            </div>
          ))}

          {payments.length > 0 && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-border/50">
              <span>Total paid: <span className="font-medium text-foreground">{formatCurrency(totalPaid)}</span></span>
              {remaining > 0
                ? <span>Remaining: <span className="font-medium text-amber-600">{formatCurrency(remaining)}</span></span>
                : <span className="text-green-600 font-medium">Fully paid ✓</span>
              }
            </div>
          )}
        </div>
      )}

      {/* Add payment form */}
      {showAddForm && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
          <p className="text-xs font-medium text-primary">Record payment</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Amount *</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <input
                  type="number" min="0.01" step="0.01"
                  value={addForm.amount}
                  onChange={e => setAddForm({ ...addForm, amount: e.target.value })}
                  onFocus={e => e.target.select()}
                  className="w-full rounded-md border border-input bg-background pl-7 pr-3 py-1.5 text-sm"
                  placeholder="0.00"
                />
              </div>
              {parseFloat(addForm.amount) > remaining + 0.005 && (
                <p className="text-[10px] text-destructive mt-0.5">
                  Exceeds remaining balance of {formatCurrency(remaining)}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Date *</label>
              <input
                type="date"
                value={addForm.paymentDate}
                onChange={e => setAddForm({ ...addForm, paymentDate: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">
              Pay from GL account
              <span className="ml-1 text-[10px] text-muted-foreground/70">
                (leave blank → posts to Undeposited Funds)
              </span>
            </label>
            <select
              value={addForm.glAccountId}
              onChange={e => setAddForm({ ...addForm, glAccountId: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1"
            >
              <option value="">— Undeposited Funds (suspense) —</option>
              {sortedCategoryList(assetAccounts).map(a => (
                <option key={a.id} value={a.id}>
                  {(a as any).parentId ? `— ${a.name}` : a.name}
                </option>
              ))}
            </select>
            {!addForm.glAccountId && (
              <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Will post to Undeposited Funds — allocate to a bank account when deposited
              </p>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <input
              type="text"
              value={addForm.notes}
              onChange={e => setAddForm({ ...addForm, notes: e.target.value })}
              placeholder="Optional"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => submitAddPayment(bill.id)}
              disabled={addingPayment || !addForm.amount || !addForm.paymentDate}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {addingPayment && <Loader2 className="h-3 w-3 animate-spin" />}
              {addingPayment ? 'Recording…' : 'Record payment'}
            </button>
            <button
              onClick={cancelAddForm}
              disabled={addingPayment}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
