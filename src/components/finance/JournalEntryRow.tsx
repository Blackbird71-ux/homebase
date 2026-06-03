'use client'

import {
  Clock, CheckCircle2, BookOpen, RotateCcw,
  Send, Pencil, Trash2, Ban, ChevronDown, ChevronRight, FilePenLine,
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { type JournalEntry, TYPE_LABELS, fmt } from './journal-types'
import { StatusChip } from '@/components/shared/StatusChip'

interface Props {
  entry: JournalEntry
  isExpanded: boolean
  posting: string | null
  onToggle: () => void
  onPost: (entry: JournalEntry) => void
  onEdit: (entry: JournalEntry) => void
  onDelete: (entry: JournalEntry) => void
  onVoid: (entry: JournalEntry) => void
  onReverse: (entry: JournalEntry) => void
  onAmend: (entry: JournalEntry) => void
}

export function JournalEntryRow({ entry, isExpanded, posting, onToggle, onPost, onEdit, onDelete, onVoid, onReverse, onAmend }: Props) {
  const isDraft    = !entry.isPosted
  const isReversal = entry.type === 'reversal'
  const isAmendment = !!entry.amendmentOfId
  const isReversed = entry.isReversed
  // An entry is "amended" when it has been reversed AND has an amendment child
  const amendedBy  = isReversed && entry.amendments.length > 0 ? entry.amendments[0] : null
  // Amendable: posted, not reversed, not a reversal, not an auto-generated entry
  const canAmend   = entry.isPosted && !isReversed && !isReversal && ['manual', 'adjustment'].includes(entry.type)

  const iconBg    = isDraft      ? 'bg-amber-500/10'
                  : isReversal   ? 'bg-red-500/10'
                  : isAmendment  ? 'bg-blue-500/10'
                  : isReversed   ? 'bg-muted'
                                 : 'bg-green-500/10'
  const iconColor = isDraft      ? 'text-amber-600'
                  : isReversal   ? 'text-red-600'
                  : isAmendment  ? 'text-blue-600'
                  : isReversed   ? 'text-muted-foreground'
                                 : 'text-green-600'

  return (
    <div className={cn(
      'rounded-lg border transition-colors',
      isDraft    ? 'border-amber-500/30 border-dashed' :
      isReversed ? 'border-border opacity-60'          :
                   'border-border',
      isExpanded && 'ring-1 ring-primary/20',
    )}>
      {/* Main row */}
      <div
        className="flex items-start gap-3 p-3 cursor-pointer hover:bg-accent/30 transition-colors rounded-lg select-none"
        onClick={onToggle}
      >
        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5', iconBg)}>
        {isDraft      ? <Clock      className={cn('h-4 w-4', iconColor)} />
         : isAmendment ? <FilePenLine className={cn('h-4 w-4', iconColor)} />
         : isReversal  ? <RotateCcw  className={cn('h-4 w-4', iconColor)} />
                       : <BookOpen   className={cn('h-4 w-4', iconColor)} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            {entry.reference && (
              <span className="text-xs font-mono font-medium text-muted-foreground">{entry.reference}</span>
            )}
            <span className="text-xs text-muted-foreground">{format(new Date(entry.date), 'd MMM yyyy')}</span>
            {entry.entity && (
              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium text-white"
                style={{ backgroundColor: entry.entity.color ?? '#6B7280' }}>
                {entry.entity.name}
              </span>
            )}
            <StatusChip variant="neutral">{TYPE_LABELS[entry.type] ?? entry.type}</StatusChip>
            {isReversed && !amendedBy && <StatusChip variant="late">REVERSED</StatusChip>}
            {amendedBy && <StatusChip variant="soon">AMENDED → {amendedBy.reference ?? amendedBy.id}</StatusChip>}
            {isAmendment && <StatusChip variant="info">CORRECTION</StatusChip>}
          </div>

          <p className="text-sm font-medium truncate">{entry.description}</p>

          {!isExpanded && entry.lines.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {entry.lines.slice(0, 3)
                .map(l => `${l.side === 'debit' ? 'DR' : 'CR'} ${l.glAccount?.name ?? '—'} ${fmt(l.amount)}`)
                .join(' · ')}
              {entry.lines.length > 3 && ` · +${entry.lines.length - 3} more`}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {isDraft
            ? <StatusChip variant="soon" dot>Draft</StatusChip>
            : <StatusChip variant="ok" dot>Posted</StatusChip>
          }

          <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
            {isDraft && (
              <>
                <button onClick={() => onPost(entry)} disabled={posting === entry.id} title="Post to ledger"
                  className="inline-flex items-center gap-1 rounded-md bg-green-600 text-white text-xs px-2 py-1 disabled:opacity-50 hover:bg-green-700 transition-colors">
                  <Send className="h-3 w-3" />
                  {posting === entry.id ? 'Posting…' : 'Post'}
                </button>
                <button onClick={() => onEdit(entry)} title="Edit draft" className="p-1 hover:bg-accent rounded">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => onDelete(entry)} title="Delete draft" className="p-1 hover:bg-accent rounded text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}

            {!isDraft && (
              <button onClick={() => onEdit(entry)}
                title="Edit this posted entry in place — change date, description, entity, and lines"
                className="inline-flex items-center gap-1 rounded-md border border-border text-muted-foreground text-xs px-2 py-1 hover:border-primary hover:text-foreground transition-colors">
                <Pencil className="h-3 w-3" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}

            {!isDraft && !isReversed && !isReversal && (
              <>
                {entry.type === 'auto_transaction' ? (
                  <button onClick={() => onDelete(entry)} title="Delete this auto-created journal entry"
                    className="p-1 hover:bg-accent rounded text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <>
                    {canAmend && (
                      <button onClick={() => onAmend(entry)}
                        title="Correct this posted entry — posts a reversal then a new corrective entry"
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 text-white text-xs px-2 py-1 hover:bg-blue-700 transition-colors">
                        <FilePenLine className="h-3 w-3" />
                        <span className="hidden sm:inline">Amend</span>
                      </button>
                    )}
                    <button onClick={() => onVoid(entry)} title="Void this entry"
                      className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 text-amber-600 text-xs px-2 py-1 hover:bg-amber-500/10 transition-colors">
                      <Ban className="h-3 w-3" />
                      <span className="hidden sm:inline">Void</span>
                    </button>
                    <button onClick={() => onReverse(entry)} title="Reverse this entry (keeps both entries on ledger)"
                      className="inline-flex items-center gap-1 rounded-md border border-border text-muted-foreground text-xs px-2 py-1 hover:border-red-400 hover:text-red-500 transition-colors">
                      <RotateCcw className="h-3 w-3" />
                      <span className="hidden sm:inline">Reverse</span>
                    </button>
                  </>
                )}
              </>
            )}

            {!isDraft && isReversed && (
              <button onClick={() => onDelete(entry)} title="Permanently delete this voided entry and its reversal"
                className="p-1 hover:bg-accent rounded text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}

            {!isDraft && isReversal && !isReversed && (
              <button onClick={() => onDelete(entry)} title="Delete this reversal entry (restores the original to un-voided)"
                className="p-1 hover:bg-accent rounded text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}

            {isExpanded
              ? <ChevronDown  className="h-4 w-4 text-muted-foreground ml-0.5" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground ml-0.5" />}
          </div>
        </div>
      </div>

      {/* Expanded lines view */}
      {isExpanded && (
        <div className="border-t border-border px-4 py-3 bg-muted/20 rounded-b-lg">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Journal Lines</p>
          <div className="grid gap-2 mb-1" style={{ gridTemplateColumns: '1fr 60px 120px' }}>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Account</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider text-center">Side</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider text-right">Amount</span>
          </div>
          {entry.lines.map(line => (
            <div key={line.id} className="grid gap-2 py-1 border-t border-border/50 first:border-t-0"
              style={{ gridTemplateColumns: '1fr 60px 120px' }}>
              <div>
                <p className="text-sm">{line.glAccount?.name ?? line.glAccountId}</p>
                {line.glAccount?.glCode && (
                  <p className="text-xs font-mono text-muted-foreground">{line.glAccount.glCode}</p>
                )}
                {line.description && (
                  <p className="text-xs text-muted-foreground italic">{line.description}</p>
                )}
              </div>
              <div className="text-center">
                <span className={cn(
                  'text-xs font-bold px-2 py-0.5 rounded',
                  line.side === 'debit' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400',
                )}>
                  {line.side === 'debit' ? 'DR' : 'CR'}
                </span>
              </div>
              <div className="text-right">
                <p className={cn('text-sm font-semibold tabular-nums',
                  line.side === 'debit' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                  {fmt(line.amount)}
                </p>
              </div>
            </div>
          ))}
          {(() => {
            const dr = entry.lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
            const cr = entry.lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
            return (
              <div className="grid gap-2 mt-2 pt-2 border-t border-border" style={{ gridTemplateColumns: '1fr 60px 120px' }}>
                <span className="text-xs font-semibold text-muted-foreground">Totals</span>
                <span />
                <div className="text-right space-y-0.5">
                  <p className="text-xs text-green-600 tabular-nums">DR {fmt(dr)}</p>
                  <p className="text-xs text-red-600 tabular-nums">CR {fmt(cr)}</p>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
