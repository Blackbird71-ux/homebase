'use client'

import { useEffect, useState } from 'react'
import { RotateCcw, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { formatInTz } from '@/lib/timezone'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { type ReversalState } from './journal-types'

interface Props {
  reversal: ReversalState | null
  onClose: () => void
  onSaved: () => void
}

export function ReversalDialog({ reversal, onClose, onSaved }: Props) {
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (reversal) { setDate(reversal.date); setDescription(reversal.description) }
  }, [reversal?.entry.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (!reversal) return
    setSaving(true)
    try {
      const res = await fetch('/api/finance/journals', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          id:                  reversal.entry.id,
          action:              'reverse',
          reversalDate:        date,
          reversalDescription: description,
        }),
      })
      if (res.ok) {
        toast.success('Reversal entry created and posted')
        onClose()
        onSaved()
      } else {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to create reversal')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!reversal} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={true}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-red-500" />
            Reverse Journal Entry
          </DialogTitle>
        </DialogHeader>

        {reversal && (
          <>
            <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-sm">
              <p className="text-xs text-muted-foreground mb-0.5">Reversing:</p>
              <p className="font-medium">{reversal.entry.reference} — {reversal.entry.description}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatInTz(new Date(reversal.entry.date), 'UTC', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>

            <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600 dark:text-red-400 flex gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                A new posted entry will be created with all debits and credits swapped.
                The original entry will be marked as reversed. This cannot be undone.
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Reversal date</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Reversal description</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  disabled={saving}
                />
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <button onClick={onClose} disabled={saving} className="rounded-md border border-border px-4 py-1.5 text-sm">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="rounded-md bg-red-600 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            {saving ? 'Creating…' : 'Create Reversal'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
