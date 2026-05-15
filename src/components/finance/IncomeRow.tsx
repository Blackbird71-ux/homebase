'use client'

import { format } from 'date-fns'
import {
  Layers, RefreshCw, Receipt, ReceiptText, CheckCircle2, Paperclip, Pencil, Trash2, Ban,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/financeShared'
import { AttachmentSection } from '@/components/finance/AttachmentSection'
import { useAttachmentManager } from '@/hooks/finance/useAttachmentManager'
import type { IncomeEntry } from '@/hooks/finance/useIncomeCrud'

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
            {!entry.isActive && <span className="text-[10px] bg-muted px-1.5 rounded">INACTIVE</span>}
            {entry.autoPay && <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 rounded">DIRECT</span>}
            {hasRemittance && (
              <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 rounded flex items-center gap-0.5">
                <Receipt className="h-2.5 w-2.5" /> POSTED
              </span>
            )}
            {entry.isTaxTracked && (
              <span className="text-[10px] bg-orange-500/10 text-orange-600 px-1.5 rounded flex items-center gap-0.5">
                <ReceiptText className="h-2.5 w-2.5" /> TAX TRACKED
                {entry.taxRate != null && <span className="font-medium">{entry.taxRate}%</span>}
              </span>
            )}
            {entry.entity && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
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
            <span>Expected {format(nextExpected, 'd MMM yyyy')}</span>
            {entry.notes && <span className="italic truncate max-w-[120px]" title={entry.notes}>· {entry.notes}</span>}
          </div>
        </div>
        {colCats.map(c => {
          const amt = entryAmountForCat(entry, c.id)
          return <span key={c.id} className="text-sm text-right text-muted-foreground">{amt > 0 ? formatCurrency(amt) : '—'}</span>
        })}
        <p className="text-sm font-semibold text-right">{formatCurrency(entry.amount)}</p>
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
