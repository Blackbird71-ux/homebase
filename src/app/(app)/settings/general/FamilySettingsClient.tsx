'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { signOut } from 'next-auth/react'

interface FamilySettingsClientProps {
  family: { name: string; timezone: string }
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
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/settings/family', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, timezone }),
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
