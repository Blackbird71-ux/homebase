'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface LoginPageTabProps {
  initialTagline: string
  initialVersion: string
}

export function LoginPageTab({ initialTagline, initialVersion }: LoginPageTabProps) {
  const [tagline, setTagline] = useState(initialTagline)
  const [version, setVersion] = useState(initialVersion)
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/settings/family', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginTagline: tagline, appVersion: version }),
      })
      if (res.ok) {
        toast.success('Login page updated.')
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error ?? 'Failed to save')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Login page</h2>
        <p className="text-sm text-muted-foreground mt-1">Customise what visitors see on the sign-in screen.</p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-tagline">Tagline</Label>
          <textarea
            id="login-tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            rows={2}
            maxLength={200}
            className="flex min-h-[60px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
            placeholder="The calm command centre for the people who share your roof."
          />
          <p className="text-xs text-muted-foreground">Shown below the &ldquo;Welcome home.&rdquo; heading. Max 200 characters.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="app-version">Version label</Label>
          <Input
            id="app-version"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            maxLength={20}
            placeholder="3.2"
          />
          <p className="text-xs text-muted-foreground">Shown at the bottom of the login page as &ldquo;v{version || '3.2'} · Made for households, not teams.&rdquo;</p>
        </div>

        <div>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  )
}
