'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Ban, Trash2, ShieldAlert, Lock, Calculator, Eye } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { FINANCE_NAV_KEYS, FINANCE_NAV_GROUPS } from '@/lib/financeNavKeys'

const MONTH_OPTIONS = [
  { value: 1,  label: 'January (calendar year)' },
  { value: 4,  label: 'April' },
  { value: 7,  label: 'July (Australian FY — default)' },
  { value: 10, label: 'October' },
]

export function FinanceTab() {
  const [hideDelete, setHideDelete] = useState(false)
  const [showBudgetPlanner, setShowBudgetPlanner] = useState(false)
  const [hideFinanceModule, setHideFinanceModule] = useState(false)
  const [savingHideFinanceModule, setSavingHideFinanceModule] = useState(false)
  const [financeNav, setFinanceNav] = useState<Record<string, boolean>>({})
  const [savingFinanceNav, setSavingFinanceNav] = useState(false)
  const [fyStartMonth, setFyStartMonth] = useState(7)
  const [periodLockedUntil, setPeriodLockedUntil] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingFy, setSavingFy] = useState(false)
  const [savingLock, setSavingLock] = useState(false)
  const [savingDelete, setSavingDelete] = useState(false)
  const [savingBudgetPlanner, setSavingBudgetPlanner] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/settings/family').then(r => r.json()),
    ]).then(([userSettings, familySettings]) => {
      setHideDelete(!!userSettings.uiPreferences?.hideDeleteBills)
      setShowBudgetPlanner(!!userSettings.uiPreferences?.showBudgetPlanner)
      setFinanceNav(userSettings.uiPreferences?.financeNav ?? {})
      setHideFinanceModule(!!familySettings.hideFinanceModule)
      setFyStartMonth(familySettings.financeYearStartMonth ?? 7)
      setPeriodLockedUntil(
        familySettings.periodLockedUntil
          ? new Date(familySettings.periodLockedUntil).toISOString().split('T')[0]
          : ''
      )
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function saveFinanceNav(updated: Record<string, boolean>) {
    setSavingFinanceNav(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiPreferences: { financeNav: updated } }),
      })
      if (res.ok) {
        setFinanceNav(updated)
      } else {
        toast.error('Failed to save menu visibility')
      }
    } finally {
      setSavingFinanceNav(false)
    }
  }

  function toggleNavKey(key: string, visible: boolean) {
    const updated = { ...financeNav, [key]: visible }
    saveFinanceNav(updated)
  }

  function setAllNavKeys(visible: boolean) {
    const updated = Object.fromEntries(FINANCE_NAV_KEYS.map(k => [k.key, visible]))
    saveFinanceNav(updated)
  }

  async function saveHideFinanceModule(newVal: boolean) {
    setSavingHideFinanceModule(true)
    try {
      const res = await fetch('/api/settings/family', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hideFinanceModule: newVal }),
      })
      if (res.ok) {
        setHideFinanceModule(newVal)
        toast.success(newVal ? 'Finance module hidden — Budget Planner shown instead' : 'Finance module restored')
      } else {
        toast.error('Failed to save — admin access required')
      }
    } finally {
      setSavingHideFinanceModule(false)
    }
  }

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

      {/* Hide Finance Module (admin family setting) */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              Hide Finance module
              <span className="text-xs font-normal px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">Admin · Family</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Hides the Finance section from the sidebar for all family members and shows a
              standalone Budget Planner link instead. Use for households that don&apos;t need
              the full accounting system.
            </p>
          </div>
          <Switch
            checked={hideFinanceModule}
            onCheckedChange={saveHideFinanceModule}
            disabled={savingHideFinanceModule}
          />
        </div>
      </div>

      {/* Finance Menu Visibility */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Eye className="h-4 w-4 text-blue-500" />
            Finance menu visibility
          </div>
          <p className="text-xs text-muted-foreground">
            Show or hide individual items in the Finance sidebar. Overview is always visible.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setAllNavKeys(true)}
            disabled={savingFinanceNav}
            className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Show all
          </button>
          <button
            onClick={() => setAllNavKeys(false)}
            disabled={savingFinanceNav}
            className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Hide all
          </button>
        </div>

        <div className="space-y-4">
          {FINANCE_NAV_GROUPS.map(group => (
            <div key={group}>
              <p className="text-xs font-semibold tracking-wider uppercase text-muted-foreground/60 mb-2">{group}</p>
              <div className="space-y-2">
                {FINANCE_NAV_KEYS.filter(k => k.group === group).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm">{label}</span>
                    <Switch
                      checked={financeNav[key] !== false}
                      onCheckedChange={visible => toggleNavKey(key, visible)}
                      disabled={savingFinanceNav}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Show Simple Budget Planner */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calculator className="h-4 w-4 text-blue-500" />
              Show Simple Budget Planner in menu
            </div>
            <p className="text-xs text-muted-foreground">
              Adds a Simple Budget Planner nav link under Finance in the sidebar.
              Completely standalone — no link to the Finance accounting system.
              Perfect for non-finance users who just want a simple budget.
            </p>
          </div>
          <Switch
            checked={showBudgetPlanner}
            onCheckedChange={async (checked) => {
              setSavingBudgetPlanner(true)
              try {
                const res = await fetch('/api/settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ uiPreferences: { showBudgetPlanner: checked } }),
                })
                if (res.ok) {
                  setShowBudgetPlanner(checked)
                  toast.success(checked ? 'Budget Planner shown in menu' : 'Budget Planner hidden')
                } else {
                  toast.error('Failed to save preference')
                }
              } finally {
                setSavingBudgetPlanner(false)
              }
            }}
            disabled={savingBudgetPlanner}
          />
        </div>
      </div>
    </div>
  )
}
