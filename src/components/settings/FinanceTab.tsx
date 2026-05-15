'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Ban, Trash2, ShieldAlert } from 'lucide-react'

export function FinanceTab() {
  const [hideDelete, setHideDelete] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setHideDelete(!!data.uiPreferences?.hideDeleteBills)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function save(newVal: boolean) {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiPreferences: { hideDeleteBills: newVal } }),
      })
      if (res.ok) {
        setHideDelete(newVal)
        toast.success(newVal ? 'Delete buttons hidden in Finance' : 'Delete buttons visible in Finance')
      } else {
        toast.error('Failed to save Finance settings')
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold">Finance Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure behaviour for the Bills and Income modules.
        </p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Ban className="h-4 w-4 text-amber-500" />
              Hide delete buttons
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, hard-delete buttons are hidden across all Finance pages (Bills, Paid Bills, Income, Received Income).
              Use <span className="font-medium">Void</span> instead to keep an audit trail.
            </p>
          </div>
          <button
            onClick={() => save(!hideDelete)}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${
              hideDelete ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
            role="switch"
            aria-checked={hideDelete}>
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform ${
              hideDelete ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {!hideDelete && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <ShieldAlert className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Delete buttons are currently <span className="font-medium">visible</span>. Hard deletes permanently remove records and all associated journal entries with no audit trail.
              Consider enabling this toggle in production to enforce the Void workflow.
            </p>
          </div>
        )}

        {hideDelete && (
          <div className="flex items-start gap-2 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2">
            <Trash2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
            <p className="text-xs text-green-700 dark:text-green-400">
              Delete buttons are <span className="font-medium">hidden</span>. All Finance records must be Voided rather than deleted, preserving your audit trail.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
