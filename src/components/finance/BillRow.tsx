'use client'

import { format } from 'date-fns'
import {
  Layers, RefreshCw, Receipt, CheckCircle2, CreditCard, Paperclip, Pencil, Trash2,
  Ban, Clock, X, BookmarkCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/financeShared'
import { AttachmentSection } from '@/components/finance/AttachmentSection'
import { useAttachmentManager } from '@/hooks/finance/useAttachmentManager'
import type { Bill, QuickFilter } from '@/hooks/finance/useBillCrud'

export function BillRow({
  bill, nextDue, isOverdue, colCats, billAmountForCat, gridTemplate,
  inBudget, onEdit, onDelete, onVoid, hideDelete, onMarkPaid, onUnmarkPaid, onToggleInvoice, onQuickFilter,
  att,
  paymentHistoryBillId, paymentHistory, paymentHistoryLoading,
  onOpenPaymentHistory, onClosePaymentHistory,
}: {
  bill: Bill; nextDue: Date; isOverdue: boolean
  colCats: { id: string; name: string }[]
  billAmountForCat: (bill: Bill, catId: string) => number
  gridTemplate: string; inBudget: boolean
  onEdit: (b: Bill) => void; onDelete: (id: string, name: string) => void
  onVoid: (id: string, name: string) => void; hideDelete: boolean
  onMarkPaid: (b: Bill) => void; onUnmarkPaid: (b: Bill) => void; onToggleInvoice: (b: Bill) => void
  onQuickFilter: (f: QuickFilter) => void
  att: ReturnType<typeof useAttachmentManager>
  paymentHistoryBillId: string | null
  paymentHistory: any[]; paymentHistoryLoading: boolean
  onOpenPaymentHistory: (b: Bill) => void; onClosePaymentHistory: () => void
}) {
  const isOneOff            = bill.billType === 'one-off'
  const hasInvoice = bill.isGlPosted === true   // TRUE only when GL journal is actually posted
  const isAttachmentOpen    = att.openEntityId === bill.id
  const isPaymentHistoryOpen = paymentHistoryBillId === bill.id
  const totalPaid           = bill.payments?.reduce((s, p) => s + p.amount, 0) ?? 0
  const isPartiallyPaid     = totalPaid > 0 && totalPaid < bill.amount

  return (
    <div>
      <div
        className={cn(
          'grid gap-3 rounded-lg border p-3 cursor-default select-none transition-colors',
          isOverdue    ? 'border-red-500/30 bg-red-500/5'
          : isPartiallyPaid ? 'border-amber-500/30 bg-amber-500/5'
          : hasInvoice ? 'border-green-500/30 bg-green-500/5'
          :              'border-border hover:bg-accent/50',
          isAttachmentOpen && 'ring-1 ring-green-500/40 rounded-b-none',
        )}
        style={{ gridTemplateColumns: gridTemplate, alignItems: 'center' }}
        onDoubleClick={() => onEdit(bill)}
      >
        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center',
          isOverdue ? 'bg-red-500/10' : isPartiallyPaid ? 'bg-amber-500/10' : hasInvoice ? 'bg-green-500/10' : isOneOff ? 'bg-orange-500/10' : 'bg-muted')}>
          {isOneOff
            ? <Layers className={cn('h-4 w-4', isOverdue ? 'text-red-500' : 'text-orange-500')} />
            : <RefreshCw className={cn('h-4 w-4', isOverdue ? 'text-red-500' : isPartiallyPaid ? 'text-amber-500' : hasInvoice ? 'text-green-600' : 'text-muted-foreground')} />}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{bill.name}</span>
            {!bill.isActive && <span className="text-[10px] bg-muted px-1.5 rounded">INACTIVE</span>}
            {bill.autoPay && <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 rounded">AUTO</span>}
            {hasInvoice && (
              <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 rounded flex items-center gap-0.5">
                <Receipt className="h-2.5 w-2.5" /> POSTED
              </span>
            )}
            {bill.invoiceReceived && !hasInvoice && (
              <span className="text-[10px] bg-amber-500/10 text-amber-600 px-1.5 rounded flex items-center gap-0.5" title="invoiceReceived=true but no posted GL journal — data integrity warning">
                <Receipt className="h-2.5 w-2.5" /> POSTED (no GL)
              </span>
            )}
            {inBudget && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 rounded flex items-center gap-0.5">
                <BookmarkCheck className="h-2.5 w-2.5" /> BUDGET
              </span>
            )}
            {isPartiallyPaid && (
              <span className="text-[10px] bg-amber-500/10 text-amber-600 px-1.5 rounded flex items-center gap-0.5">
                PARTIAL
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
            <span className="capitalize">{isOneOff ? 'One-off' : bill.frequency}</span>
            {bill.vendor && (
              <button className="text-purple-500 hover:underline"
                onClick={e => { e.stopPropagation(); onQuickFilter({ type: 'vendor', id: bill.vendor!.id, label: bill.vendor!.name }) }}
                title={`Filter by vendor: ${bill.vendor.name}`}>
                {bill.vendor.name}
              </button>
            )}
            {bill.account && <span>{bill.account.name}</span>}
            {bill.member && (
              <button className="text-primary hover:underline"
                onClick={e => { e.stopPropagation(); onQuickFilter({ type: 'member', id: bill.member!.id, label: bill.member!.name }) }}
                title={`Filter by member: ${bill.member.name}`}>
                {bill.member.name}
              </button>
            )}
            {bill.location && (
              <button className="hover:underline"
                onClick={e => { e.stopPropagation(); onQuickFilter({ type: 'location', id: bill.location!.id, label: bill.location!.name }) }}
                title={`Filter by location: ${bill.location.name}`}>
                {bill.location.name}
              </button>
            )}
            <span>Due {format(nextDue, 'd MMM yyyy')}</span>
            {bill.notes && <span className="italic truncate max-w-[120px]" title={bill.notes}>· {bill.notes}</span>}
          </div>
        </div>

        {colCats.map(c => {
          const amt = billAmountForCat(bill, c.id)
          return <span key={c.id} className="text-sm text-right text-muted-foreground">{amt > 0 ? formatCurrency(amt) : '—'}</span>
        })}

        <div className="text-right">
          <p className="text-sm font-semibold">{formatCurrency(bill.amount)}</p>
          {isPartiallyPaid && (
            <p className="text-[10px] text-amber-600 font-medium mt-0.5">
              {formatCurrency(totalPaid)} paid
            </p>
          )}
        </div>

        <div className="flex items-center gap-0.5 justify-end">
          <button onClick={() => onOpenPaymentHistory(bill)}
            className={cn('relative group p-1 hover:bg-accent rounded', isPaymentHistoryOpen ? 'text-amber-600' : 'text-muted-foreground')}>
            <Clock className="h-3.5 w-3.5" />
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-zinc-900 px-2 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 z-50 transition-opacity">Payment history</span>
          </button>
          <button onClick={() => att.open(bill.id)}
            className={cn('relative group p-1 hover:bg-accent rounded',
              isAttachmentOpen || (bill.attachments && bill.attachments.length > 0) ? 'text-green-600' : 'text-muted-foreground')}>
            <Paperclip className="h-3.5 w-3.5" />
            {!isAttachmentOpen && bill.attachments && bill.attachments.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-green-500 text-white text-[9px] font-bold flex items-center justify-center leading-none px-0.5">
                {bill.attachments.length}
              </span>
            )}
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-zinc-900 px-2 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 z-50 transition-opacity">
              {bill.attachments && bill.attachments.length > 0 ? `${bill.attachments.length} attachment${bill.attachments.length !== 1 ? 's' : ''}` : 'Attachments'}
            </span>
          </button>
          {/* POST — creates accrual journal (Debit Expense / Credit AP) */}
          <button onClick={() => onToggleInvoice(bill)}
            className={cn('relative group p-1 hover:bg-accent rounded', bill.invoiceReceived ? 'text-green-500' : 'text-muted-foreground hover:text-green-500')}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-zinc-900 px-2 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 z-50 transition-opacity">
              {bill.invoiceReceived ? 'Unpost — reverse accrual journal' : 'Post bill — Debit Expense / Credit AP'}
            </span>
          </button>
          {/* PAY — record payment, clears AP balance */}
          {bill.paid
            ? <button onClick={() => onUnmarkPaid(bill)} className="relative group p-1 hover:bg-accent rounded text-blue-500">
                <CreditCard className="h-3.5 w-3.5" />
                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-zinc-900 px-2 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 z-50 transition-opacity">Reverse payment</span>
              </button>
            : <button onClick={() => onMarkPaid(bill)} className="relative group p-1 hover:bg-accent rounded text-muted-foreground hover:text-blue-500">
                <CreditCard className="h-3.5 w-3.5" />
                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-zinc-900 px-2 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 z-50 transition-opacity">Record payment — Debit AP / Credit bank</span>
              </button>
          }
          <button onClick={() => onEdit(bill)} className="relative group p-1 hover:bg-accent rounded text-muted-foreground">
            <Pencil className="h-3.5 w-3.5" />
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-zinc-900 px-2 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 z-50 transition-opacity">Edit bill</span>
          </button>
          <button onClick={() => onVoid(bill.id, bill.name)} className="relative group p-1 hover:bg-accent rounded text-amber-500">
            <Ban className="h-3.5 w-3.5" />
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-zinc-900 px-2 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 z-50 transition-opacity">Void — accountant-safe, keeps audit trail</span>
          </button>
          {!hideDelete && (
            <button onClick={() => onDelete(bill.id, bill.name)} className="relative group p-1 hover:bg-accent rounded text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
              <span className="pointer-events-none absolute bottom-full right-0 mb-1 whitespace-nowrap rounded bg-zinc-900 px-2 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 z-50 transition-opacity">Delete permanently</span>
            </button>
          )}
        </div>
      </div>

      {/* Payment History panel */}
      {isPaymentHistoryOpen && (
        <div className="rounded-b-lg border border-t-0 border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-3.5 w-3.5 text-amber-600" /> Payment History
            </div>
            <button onClick={onClosePaymentHistory} className="p-1 rounded hover:bg-accent text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          {paymentHistoryLoading ? (
            <p className="text-xs text-muted-foreground">Loading&hellip;</p>
          ) : paymentHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">No payments yet.</p>
          ) : (
            <div className="space-y-1.5">
              {paymentHistory.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">{format(new Date(p.paymentDate), 'd MMM yyyy')}</span>
                  <span className="font-medium shrink-0">{formatCurrency(p.amount)}</span>
                  {p.glAccount && <span className="text-xs text-muted-foreground truncate">{p.glAccount.name}</span>}
                  {p.transaction && (
                    <span className={cn('text-[10px] px-1.5 rounded ml-auto', p.transaction.isCleared ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600')}>
                      {p.transaction.isCleared ? 'Cleared' : 'Uncleared'}
                    </span>
                  )}
                </div>
              ))}
              <div className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                Total paid: <span className="font-medium text-foreground">{formatCurrency(totalPaid)}</span>
                {totalPaid < bill.amount && (
                  <> &middot; Remaining: <span className="font-medium text-amber-600">{formatCurrency(bill.amount - totalPaid)}</span></>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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
