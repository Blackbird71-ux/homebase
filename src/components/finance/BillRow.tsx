'use client'

import {
  Layers, RefreshCw, Receipt, CheckCircle2, CreditCard, Paperclip, Pencil, Trash2,
  Ban, Clock, X, BookmarkCheck, Plus, Loader2, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/financeShared'
import { formatInTz } from '@/lib/timezone'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'
import { AttachmentSection } from '@/components/finance/AttachmentSection'
import { useAttachmentManager } from '@/hooks/finance/useAttachmentManager'
import type { Bill, QuickFilter } from '@/hooks/finance/useBillCrud'
import type { BillPayment, AddPaymentForm } from '@/hooks/finance/usePaymentHistory'
import { StatusChip } from '@/components/shared/StatusChip'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PayFromAccount {
  id: string
  name: string
}

export interface BillRowProps {
  bill:              Bill
  nextDue:           Date
  isOverdue:         boolean
  colCats:           { id: string; name: string }[]
  billAmountForCat:  (bill: Bill, catId: string) => number
  gridTemplate:      string
  inBudget:          boolean
  hideDelete:        boolean
  // Parent actions
  onEdit:            (b: Bill) => void
  onDelete:          (id: string, name: string) => void
  onVoid:            (id: string, name: string) => void
  onMarkPaid:        (b: Bill) => void
  onUnmarkPaid:      (b: Bill) => void
  onToggleInvoice:   (b: Bill) => void
  onQuickFilter:     (f: QuickFilter) => void
  // Attachments
  att: ReturnType<typeof useAttachmentManager>
  // Payment history — from usePaymentHistory hook
  openBillId:          string | null
  payments:            BillPayment[]
  loadingHistory:      boolean
  showAddForm:         boolean
  addForm:             AddPaymentForm
  setAddForm:          (f: AddPaymentForm) => void
  addingPayment:       boolean
  deletingPaymentId:   string | null
  onOpenPanel:         (billId: string) => void
  onClosePanel:        () => void
  onOpenAddForm:       (billAmount: number, totalPaid: number, defaultAccountId?: string) => void
  onCancelAddForm:     () => void
  onSubmitAddPayment:  (billId: string) => void
  onDeletePayment:     (billId: string, paymentId: string) => void
  // FinanceAccounts for the "pay from" selector (Xero 1:1 model — the cash side
  // posts to the selected account's bound GL category).
  accounts:            PayFromAccount[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BillRow({
  bill, nextDue, isOverdue, colCats, billAmountForCat, gridTemplate,
  inBudget, hideDelete,
  onEdit, onDelete, onVoid, onMarkPaid, onUnmarkPaid, onToggleInvoice, onQuickFilter,
  att,
  openBillId, payments, loadingHistory,
  showAddForm, addForm, setAddForm, addingPayment, deletingPaymentId,
  onOpenPanel, onClosePanel, onOpenAddForm, onCancelAddForm, onSubmitAddPayment, onDeletePayment,
  accounts,
}: BillRowProps) {

  const tz                   = useFamilyTimezone()
  const isOneOff             = bill.billType === 'one-off'
  const hasInvoice           = bill.isGlPosted === true
  const isAttachmentOpen     = att.openEntityId === bill.id
  const isPaymentPanelOpen   = openBillId === bill.id
  const totalPaid            = bill.payments?.reduce((s, p) => s + p.amount, 0) ?? 0
  const isPartiallyPaid      = totalPaid > 0 && !bill.paid
  const remaining            = Math.max(0, bill.amount - totalPaid)


  return (
    <div>
      {/* ── Main row ──────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'flex flex-col gap-2 sm:grid sm:gap-3 rounded-lg border p-3 cursor-default select-none transition-colors',
          isOverdue          ? 'border-red-500/30 bg-red-500/5'
          : isPartiallyPaid  ? 'border-amber-500/30 bg-amber-500/5'
          : hasInvoice       ? 'border-green-500/30 bg-green-500/5'
          :                    'border-border hover:bg-accent/50',
          (isAttachmentOpen || isPaymentPanelOpen) && 'rounded-b-none',
        )}
        style={{ gridTemplateColumns: gridTemplate, alignItems: 'center' }}
        onDoubleClick={() => onEdit(bill)}
      >
        {/* Icon */}
        <div className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center',
          isOverdue ? 'bg-red-500/10' : isPartiallyPaid ? 'bg-amber-500/10'
          : hasInvoice ? 'bg-green-500/10' : isOneOff ? 'bg-orange-500/10' : 'bg-muted',
        )}>
          {isOneOff
            ? <Layers   className={cn('h-4 w-4', isOverdue ? 'text-red-500' : 'text-orange-500')} />
            : <RefreshCw className={cn('h-4 w-4',
                isOverdue ? 'text-red-500' : isPartiallyPaid ? 'text-amber-500'
                : hasInvoice ? 'text-green-600' : 'text-muted-foreground')} />}
        </div>

        {/* Name + meta */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{bill.name}</span>
            {!bill.isActive && <StatusChip variant="neutral">INACTIVE</StatusChip>}
            {bill.autoPay   && <StatusChip variant="info">AUTO</StatusChip>}
            {hasInvoice && <StatusChip variant="ok" dot>POSTED</StatusChip>}
            {bill.invoiceReceived && !hasInvoice && <StatusChip variant="soon" dot>POSTED (no GL)</StatusChip>}
            {!bill.invoiceReceived && !bill.paid && <StatusChip variant="soon" dot>DRAFT</StatusChip>}
            {inBudget && <StatusChip variant="accent">BUDGET</StatusChip>}
            {isPartiallyPaid && <StatusChip variant="soon">PARTIAL</StatusChip>}
            {bill.entity && (
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium text-white whitespace-nowrap"
                style={{ backgroundColor: bill.entity.color ?? '#6B7280' }}>
                {bill.entity.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
            <span className="capitalize">{isOneOff ? 'One-off' : bill.frequency}</span>
            {bill.vendor && (
              <button className="text-purple-500 hover:underline"
                onClick={e => { e.stopPropagation(); onQuickFilter({ type: 'vendor', id: bill.vendor!.id, label: bill.vendor!.name }) }}>
                {bill.vendor.name}
              </button>
            )}
            {bill.account  && <span>{bill.account.name}</span>}
            {bill.member   && (
              <button className="text-primary hover:underline"
                onClick={e => { e.stopPropagation(); onQuickFilter({ type: 'member', id: bill.member!.id, label: bill.member!.name }) }}>
                {bill.member.name}
              </button>
            )}
            {bill.location && (
              <button className="hover:underline"
                onClick={e => { e.stopPropagation(); onQuickFilter({ type: 'location', id: bill.location!.id, label: bill.location!.name }) }}>
                {bill.location.name}
              </button>
            )}
            {bill.billDate && (
              <span>Invoice {formatInTz(new Date(bill.billDate), tz, { day: 'numeric', month: 'short', year: 'numeric' })} · <span className="font-bold">Due {formatInTz(nextDue, tz, { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
            )}
            {!bill.billDate && <span><span className="font-bold">Due {formatInTz(nextDue, tz, { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>}
            {bill.notes && <span className="italic truncate max-w-[120px]" title={bill.notes}>· {bill.notes}</span>}
          </div>
        </div>

        {/* Category columns */}
        {colCats.map(c => {
          const amt = billAmountForCat(bill, c.id)
          return <span key={c.id} className="text-sm text-right text-muted-foreground">{amt > 0 ? formatCurrency(amt) : '—'}</span>
        })}

        {/* Amount + actions: single row on mobile, separate grid cells on desktop */}
        <div className="flex items-center justify-between sm:contents">

        {/* Amount */}
        <div className="sm:text-right">
          <p className="text-sm font-semibold">{formatCurrency(bill.amount)}</p>
          {isPartiallyPaid && (
            <p className="text-xs text-amber-600 font-medium mt-0.5">
              {formatCurrency(totalPaid)} paid · {formatCurrency(remaining)} left
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 justify-end">
          {/* Payment history / add payment */}
          <button
            onClick={() => onOpenPanel(bill.id)}
            title={isPartiallyPaid ? 'Payments & add payment' : 'Payment history / add payment'}
            className={cn(
              'relative group p-1 hover:bg-accent rounded transition-colors',
              isPaymentPanelOpen ? 'text-amber-600' : 'text-muted-foreground hover:text-amber-600',
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            {isPartiallyPaid && !isPaymentPanelOpen && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500" />
            )}
          </button>

          {/* Attachments */}
          <button onClick={() => att.open(bill.id)}
            className={cn('relative group p-1 hover:bg-accent rounded',
              (isAttachmentOpen || (bill.attachments && bill.attachments.length > 0))
                ? 'text-green-600' : 'text-muted-foreground')}>
            <Paperclip className="h-3.5 w-3.5" />
            {!isAttachmentOpen && bill.attachments && bill.attachments.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-green-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                {bill.attachments.length}
              </span>
            )}
          </button>

          {/* Post / unpost invoice */}
          <button onClick={() => onToggleInvoice(bill)}
            title={bill.invoiceReceived ? 'Unpost — reverse accrual journal' : 'Post bill — DR Expense / CR AP'}
            className={cn('p-1 hover:bg-accent rounded', bill.invoiceReceived ? 'text-green-500' : 'text-muted-foreground hover:text-green-500')}>
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>

          {/* Pay / unpay */}
          {bill.paid
            ? <button onClick={() => onUnmarkPaid(bill)} title="Reverse all payments"
                className="p-1 hover:bg-accent rounded text-blue-500">
                <CreditCard className="h-3.5 w-3.5" />
              </button>
            : <button onClick={() => onMarkPaid(bill)} title="Record full payment"
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-blue-500">
                <CreditCard className="h-3.5 w-3.5" />
              </button>
          }

          <button onClick={() => onEdit(bill)} title="Edit bill"
            className="p-1 hover:bg-accent rounded text-muted-foreground">
            <Pencil className="h-3.5 w-3.5" />
          </button>

          <button onClick={() => onVoid(bill.id, bill.name)} title="Void — keeps audit trail"
            className="p-1 hover:bg-accent rounded text-amber-500">
            <Ban className="h-3.5 w-3.5" />
          </button>

          {!hideDelete && (
            <button onClick={() => onDelete(bill.id, bill.name)} title="Delete permanently"
              className="p-1 hover:bg-accent rounded text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        </div>{/* end mobile amount+actions wrapper */}
      </div>

      {/* ── Payment history + add-payment panel ──────────────────────────── */}
      {isPaymentPanelOpen && (
        <div className="rounded-b-lg border border-t-0 border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-3">

          {/* Panel header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              Payments
              {!bill.paid && remaining > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  — {formatCurrency(remaining)} remaining
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {/* Add payment — only when bill is not fully paid and form not already open */}
              {!bill.paid && !showAddForm && (
                <button
                  onClick={() => onOpenAddForm(bill.amount, totalPaid, bill.account?.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  <Plus className="h-3 w-3" /> Add payment
                </button>
              )}
              <button onClick={onClosePanel}
                className="p-1 rounded hover:bg-accent text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Existing payments list */}
          {loadingHistory ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading&hellip;
            </div>
          ) : payments.length === 0 && !showAddForm ? (
            <p className="text-xs text-muted-foreground">
              No payments recorded yet.
              {!bill.paid && ' Use "Add payment" to record a part or full payment.'}
            </p>
          ) : (
            <div className="space-y-1.5">
              {payments.map(p => (
                <div key={p.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">
                    {formatInTz(new Date(p.paymentDate), 'UTC', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <span className="font-medium shrink-0">{formatCurrency(p.amount)}</span>
                  {p.glAccount
                    ? <span className="text-xs text-muted-foreground truncate flex-1">{p.glAccount.name}</span>
                    : <span className="text-xs text-amber-600 truncate flex-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> Undeposited Funds
                      </span>
                  }
                  {p.transaction && (
                    <StatusChip variant={p.transaction.isCleared ? 'ok' : 'soon'} dot className="shrink-0">
                      {p.transaction.isCleared ? 'Cleared' : 'Uncleared'}
                    </StatusChip>
                  )}
                  {/* Undo this payment */}
                  <button
                    onClick={() => onDeletePayment(bill.id, p.id)}
                    disabled={deletingPaymentId === p.id}
                    title="Undo — reverses GL journal entry"
                    className="shrink-0 p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 disabled:opacity-40 transition-colors"
                  >
                    {deletingPaymentId === p.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <X className="h-3 w-3" />}
                  </button>
                </div>
              ))}

              {/* Totals */}
              {payments.length > 0 && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-border/50">
                  <span>Total paid: <span className="font-medium text-foreground">{formatCurrency(totalPaid)}</span></span>
                  {!bill.paid && <span>Remaining: <span className="font-medium text-amber-600">{formatCurrency(remaining)}</span></span>}
                  {bill.paid  && <span className="text-green-600 font-medium">Fully paid ✓</span>}
                </div>
              )}
            </div>
          )}

          {/* ── Inline add-payment form ─────────────────────────────────── */}
          {showAddForm && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
              <p className="text-xs font-medium text-primary">Record payment</p>

              <div className="grid grid-cols-2 gap-3">
                {/* Amount */}
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
                    <p className="text-xs text-destructive mt-0.5">
                      Exceeds remaining balance of {formatCurrency(remaining)}
                    </p>
                  )}
                </div>

                {/* Date */}
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

              {/* Pay from account (Xero 1:1 — cash posts to its bound GL category) */}
              <div>
                <label className="text-xs text-muted-foreground">
                  Pay from account
                  <span className="ml-1 text-xs text-muted-foreground/70">(leave blank → posts to Undeposited Funds)</span>
                </label>
                <select
                  value={addForm.accountId}
                  onChange={e => setAddForm({ ...addForm, accountId: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1"
                >
                  <option value="">— Undeposited Funds (suspense) —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                {!addForm.accountId && (
                  <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Will post to Undeposited Funds — allocate to a bank account when deposited
                  </p>
                )}
              </div>

              {/* Notes */}
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

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => onSubmitAddPayment(bill.id)}
                  disabled={addingPayment || !addForm.amount || !addForm.paymentDate}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
                >
                  {addingPayment && <Loader2 className="h-3 w-3 animate-spin" />}
                  {addingPayment ? 'Recording…' : 'Record payment'}
                </button>
                <button
                  onClick={onCancelAddForm}
                  disabled={addingPayment}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Attachments panel ────────────────────────────────────────────── */}
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
