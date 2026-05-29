'use client'

import { format } from 'date-fns'
import {
  Layers, RefreshCw, Receipt, ReceiptText, CheckCircle2, Paperclip, Pencil, Trash2, Ban, FileText, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/financeShared'
import { formatInTz } from '@/lib/timezone'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'
import { AttachmentSection } from '@/components/finance/AttachmentSection'
import { useAttachmentManager } from '@/hooks/finance/useAttachmentManager'
import { useState } from 'react'
import type { IncomeEntry, StoredPayslip } from '@/hooks/finance/useIncomeCrud'
import { StatusChip } from '@/components/shared/StatusChip'

function PayslipBadge({ payslip }: { payslip: StoredPayslip }) {
  const [open, setOpen] = useState(false)
  const components: { label: string; amount: number }[] = (() => {
    try { return JSON.parse(payslip.components) } catch { return [] }
  })()
  const deductions: { label: string; amount: number; glAccountId?: string | null }[] = (() => {
    try { return JSON.parse(payslip.deductions) } catch { return [] }
  })()

  return (
    <div className="mt-1.5">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20 transition-colors">
        <FileText className="h-2.5 w-2.5" />
        Payslip
        {payslip.payPeriodStart && payslip.payPeriodEnd && (
          <span className="text-violet-400">
            {format(new Date(payslip.payPeriodStart), 'd MMM')} – {format(new Date(payslip.payPeriodEnd), 'd MMM yyyy')}
          </span>
        )}
        {open ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
      </button>

      {open && (
        <div className="mt-1.5 rounded-md border border-violet-500/20 bg-violet-500/5 p-2.5 text-xs space-y-1.5">
          <div className="flex justify-between font-medium">
            <span className="text-muted-foreground">Gross Pay</span>
            <span>{formatCurrency(payslip.grossPay)}</span>
          </div>
          {components.map((c, i) => (
            <div key={i} className="flex justify-between pl-3 text-muted-foreground">
              <span>{c.label || 'Component'}</span>
              <span>{formatCurrency(c.amount)}</span>
            </div>
          ))}
          {payslip.paygWithheld > 0 && (
            <div className="flex justify-between text-orange-600 dark:text-orange-400">
              <span>PAYG Withheld</span>
              <span>– {formatCurrency(payslip.paygWithheld)}</span>
            </div>
          )}
          {deductions.filter(d => d.amount > 0).map((d, i) => (
            <div key={i} className="flex justify-between text-muted-foreground">
              <span>{d.label || 'Deduction'}</span>
              <span>– {formatCurrency(d.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold border-t border-violet-500/20 pt-1.5 text-green-600 dark:text-green-400">
            <span>Net Pay (take-home)</span>
            <span>{formatCurrency(payslip.netPay)}</span>
          </div>
          {payslip.sgcAmount > 0 && (
            <div className="flex justify-between text-muted-foreground/70 text-xs">
              <span>SGC Super (informational)</span>
              <span>{formatCurrency(payslip.sgcAmount)}</span>
            </div>
          )}
          {payslip.notes && (
            <p className="text-muted-foreground/70 italic pt-0.5">{payslip.notes}</p>
          )}
        </div>
      )}
    </div>
  )
}

export function IncomeRow({
  entry, nextExpected, isOverdue, colCats, entryAmountForCat, gridTemplate,
  onEdit, onDelete, onVoid, hideDelete, onMarkReceived, onToggleInvoice,
  att,
}: {
  entry: IncomeEntry; nextExpected: Date; isOverdue: boolean
  colCats: { id: string; name: string }[]
  entryAmountForCat: (entry: IncomeEntry, catId: string) => number
  gridTemplate: string
  onEdit: (e: IncomeEntry) => void; onDelete: (id: string, name: string) => void
  onVoid: (id: string, name: string) => void; hideDelete: boolean
  onMarkReceived: (e: IncomeEntry) => void
  onToggleInvoice: (e: IncomeEntry) => void
  att: ReturnType<typeof useAttachmentManager>
}) {
  const tz               = useFamilyTimezone()
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
            {!entry.isActive && <StatusChip variant="neutral">INACTIVE</StatusChip>}
            {entry.autoPay && <StatusChip variant="info">DIRECT</StatusChip>}
            {hasRemittance && <StatusChip variant="ok" dot>POSTED</StatusChip>}
            {entry.isTaxTracked && (
              <StatusChip variant="soon">
                TAX TRACKED{entry.taxRate != null && ` ${entry.taxRate}%`}
              </StatusChip>
            )}
            {entry.entity && (
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium text-white"
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
            <span>Expected {formatInTz(nextExpected, tz, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            {entry.notes && <span className="italic truncate max-w-[120px]" title={entry.notes}>· {entry.notes}</span>}
          </div>
          {entry.payslip && <PayslipBadge payslip={entry.payslip} />}
        </div>
        {colCats.map(c => {
          const amt = entryAmountForCat(entry, c.id)
          return <span key={c.id} className="text-sm text-right text-muted-foreground">{amt > 0 ? formatCurrency(amt) : '—'}</span>
        })}
        <div className="text-right">
          <p className="text-sm font-semibold">{formatCurrency(entry.amount)}</p>
          {entry.actualAmountReceived != null && Math.abs(entry.actualAmountReceived - entry.amount) > 0.005 && (
            <p className="text-xs text-green-600 dark:text-green-400">Actual: {formatCurrency(entry.actualAmountReceived)}</p>
          )}
        </div>
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
          <button onClick={() => onVoid(entry.id, entry.name)} title="Void" className="p-1 hover:bg-accent rounded text-amber-500"><Ban className="h-3.5 w-3.5" /></button>
          {!hideDelete && <button onClick={() => onDelete(entry.id, entry.name)} className="p-1 hover:bg-accent rounded text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>}
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
