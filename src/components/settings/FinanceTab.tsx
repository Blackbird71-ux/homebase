'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Ban, Trash2, ShieldAlert, Lock } from 'lucide-react'

const MONTH_OPTIONS = [
  { value: 1,  label: 'January (calendar year)' },
  { value: 4,  label: 'April' },
  { value: 7,  label: 'July (Australian FY — default)' },
  { value: 10, label: 'October' },
]

export function FinanceTab() {
  const [hideDelete, setHideDelete] = useState(false)
  const [fyStartMonth, setFyStartMonth] = useState(7)
  const [periodLockedUntil, setPeriodLockedUntil] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingFy, setSavingFy] = useState(false)
  const [savingLock, setSavingLock] = useState(false)
  const [savingDelete, setSavingDelete] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/settings/family').then(r => r.json()),
    ]).then(([userSettings, familySettings]) => {
      setHideDelete(!!userSettings.uiPreferences?.hideDeleteBills)
      setFyStartMonth(familySettings.financeYearStartMonth ?? 7)
      setPeriodLockedUntil(
        familySettings.periodLockedUntil
          ? new Date(familySettings.periodLockedUntil).toISOString().split('T')[0]
          : ''
      )
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function saveDelete(newVal: boolean) {
    setSavingDelete(true)
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
      setSavingDelete(false)
    }
  }

  async function saveFyStartMonth() {
    setSavingFy(true)
    try {
      const res = await fetch('/api/settings/family', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ financeYearStartMonth: fyStartMonth }),
      })
      if (res.ok) {
        toast.success('Financial year start month updated')
      } else {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to save')
      }
    } finally {
      setSavingFy(false)
    }
  }

  async function savePeriodLock() {
    setSavingLock(true)
    try {
      const res = await fetch('/api/settings/family', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodLockedUntil: periodLockedUntil || null }),
      })
      if (res.ok) {
        toast.success(periodLockedUntil ? `Period locked until ${periodLockedUntil}` : 'Period lock cleared')
      } else {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to save')
      }
    } finally {
      setSavingLock(false)
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold">Finance Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure behaviour for the Finance module.
        </p>
      </div>

      {/* Financial Year Start Month */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Financial Year Start Month</p>
          <p className="text-xs text-muted-foreground">
            Sets the start of the financial year used by P&amp;L, Tax Report, Annual P&amp;L, and Snapshots.
            Australian default is 1 July.
          </p>
        </div>
        <select
          value={fyStartMonth}
          onChange={e => setFyStartMonth(parseInt(e.target.value, 10))}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          {MONTH_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={saveFyStartMonth}
          disabled={savingFy}
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {savingFy ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Period Lock */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-start gap-2 space-y-1">
          <Lock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Finance period locked until</p>
            <p className="text-xs text-muted-foreground">
              Posting a journal entry, bill, or income dated before this date will show a warning.
              Leave blank to disable. Useful after filing a BAS or tax return.
            </p>
          </div>
        </div>
        <input
          type="date"
          value={periodLockedUntil}
          onChange={e => setPeriodLockedUntil(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
        />
        <button
          onClick={savePeriodLock}
          disabled={savingLock}
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {savingLock ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Hide Delete Buttons */}
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
            onClick={() => saveDelete(!hideDelete)}
            disabled={savingDelete}
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
