'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { signOut } from 'next-auth/react'

interface FamilySettingsClientProps {
  family: { name: string; timezone: string; loginTagline: string; financeYearStartMonth: number; periodLockedUntil: string | null }
  isAdmin: boolean
  supportedTimezones: string[]
}

export function FamilySettingsClient({
  family,
  isAdmin,
  supportedTimezones,
}: FamilySettingsClientProps) {
  const [name, setName] = useState(family.name)
  const [timezone, setTimezone] = useState(family.timezone)
  const [loginTagline, setLoginTagline] = useState(family.loginTagline)
  const [financeYearStartMonth, setFinanceYearStartMonth] = useState(family.financeYearStartMonth)
  const [periodLockedUntil, setPeriodLockedUntil] = useState(family.periodLockedUntil ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/settings/family', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, timezone, loginTagline, financeYearStartMonth, periodLockedUntil: periodLockedUntil || null }),
      })
      if (res.ok) {
        toast.success('Settings saved. Sign out and back in to apply timezone changes.')
      } else {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to save')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-4 text-sm">
        <div>
          <p className="text-muted-foreground text-xs mb-1">Family name</p>
          <p>{family.name}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs mb-1">Timezone</p>
          <p>{family.timezone}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs mb-1">Login tagline</p>
          <p>{family.loginTagline || <span className="italic text-muted-foreground">(default)</span>}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs mb-1">Financial Year Start Month</p>
          <p>{family.financeYearStartMonth === 1 ? 'January (calendar year)' :
              family.financeYearStartMonth === 7 ? 'July (Australian FY)' :
              `Month ${family.financeYearStartMonth}`}</p>
        </div>
        {family.periodLockedUntil && (
          <div>
            <p className="text-muted-foreground text-xs mb-1">Finance period locked until</p>
            <p>{family.periodLockedUntil}</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Only admins can change family settings.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="family-name">Family name</Label>
        <Input
          id="family-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timezone">Timezone</Label>
        <select
          id="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          {supportedTimezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          After saving, sign out and back in to update date/time display.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-tagline">Login page tagline</Label>
        <textarea
          id="login-tagline"
          value={loginTagline}
          onChange={(e) => setLoginTagline(e.target.value)}
          rows={2}
          maxLength={200}
          className="flex min-h-[60px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
          placeholder="The calm command centre for the people who share your roof."
        />
        <p className="text-xs text-muted-foreground">Shown on the login page. Max 200 characters.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="finance-year-start-month">Financial Year Start Month</Label>
        <select
          id="finance-year-start-month"
          value={financeYearStartMonth}
          onChange={(e) => setFinanceYearStartMonth(parseInt(e.target.value))}
          className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          {[
            { value: 1,  label: 'January (calendar year)' },
            { value: 4,  label: 'April' },
            { value: 7,  label: 'July (Australian FY — default)' },
            { value: 10, label: 'October' },
          ].map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Sets the start of the financial year for P&L, tax reports, budgets, and annual reporting.
          Australian default is 1 July.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="period-locked-until">Finance period locked until</Label>
        <input
          id="period-locked-until"
          type="date"
          value={periodLockedUntil}
          onChange={(e) => setPeriodLockedUntil(e.target.value)}
          className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Posting a journal entry, bill, or income dated before this date will show a warning.
          Leave blank to disable. Useful when a period has been filed (BAS, tax return).
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save settings'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          Sign out & apply
        </Button>
      </div>
    </form>
  )
}
