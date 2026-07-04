'use client'

import { useEffect, useState } from 'react'
import { Ban, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { formatInTz } from '@/lib/timezone'
import { todayAU } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { type JournalEntry } from './journal-types'

interface Props {
  entry: JournalEntry | null
  onClose: () => void
  onSaved: () => void
}

export function VoidDialog({ entry, onClose, onSaved }: Props) {
  const [voidDate, setVoidDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (entry) setVoidDate(todayAU())
  }, [entry?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (!entry) return
    setSaving(true)
    try {
      const res = await fetch('/api/finance/journals', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: entry.id, action: 'void', voidDate }),
      })
      if (res.ok) {
        toast.success(`${entry.reference ?? 'Entry'} voided — a reversing entry has been posted`)
        onClose()
        onSaved()
      } else {
        const err = await res.json().catch(() => null)
        toast.error(err?.error ?? 'Failed to void entry')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!entry} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={true}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-amber-500" />
            Void Journal Entry
          </DialogTitle>
        </DialogHeader>

        {entry && (
          <>
            <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-sm">
              <p className="text-xs text-muted-foreground mb-0.5">Voiding:</p>
              <p className="font-medium">{entry.reference} — {entry.description}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatInTz(new Date(entry.date), 'UTC', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>

            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 flex gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                A reversing entry will be posted to zero out this entry&apos;s GL effect.
                The original will be marked <strong>VOIDED</strong>. You can then delete
                both entries permanently if needed.
              </span>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Void date</label>
              <input
                type="date"
                value={voidDate}
                onChange={e => setVoidDate(e.target.value)}
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                disabled={saving}
              />
            </div>
          </>
        )}

        <DialogFooter>
          <button onClick={onClose} disabled={saving} className="rounded-md border border-border px-4 py-1.5 text-sm">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="rounded-md bg-amber-600 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
            <Ban className="h-3.5 w-3.5" />
            {saving ? 'Voiding…' : 'Void Entry'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
