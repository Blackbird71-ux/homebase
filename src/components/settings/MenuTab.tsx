'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Eye, CookingPot } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { MAIN_NAV_KEYS, MAIN_NAV_GROUPS } from '@/lib/mainNavKeys'

export function MenuTab() {
  const [mainNav, setMainNav] = useState<Record<string, boolean>>({})
  const [savingMainNav, setSavingMainNav] = useState(false)
  const [hidePantryPrompts, setHidePantryPrompts] = useState(false)
  const [savingPantryPrompts, setSavingPantryPrompts] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(settings => {
        setMainNav(settings.uiPreferences?.mainNav ?? {})
        setHidePantryPrompts(!!settings.uiPreferences?.hidePantryPrompts)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function saveMainNav(updated: Record<string, boolean>) {
    setSavingMainNav(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiPreferences: { mainNav: updated } }),
      })
      if (res.ok) {
        setMainNav(updated)
      } else {
        toast.error('Failed to save menu visibility')
      }
    } finally {
      setSavingMainNav(false)
    }
  }

  function toggleNavHref(href: string, visible: boolean) {
    saveMainNav({ ...mainNav, [href]: visible })
  }

  function setAllNavHrefs(visible: boolean) {
    saveMainNav(Object.fromEntries(MAIN_NAV_KEYS.map(k => [k.href, visible])))
  }

  async function savePantryPrompts(hide: boolean) {
    setSavingPantryPrompts(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiPreferences: { hidePantryPrompts: hide } }),
      })
      if (res.ok) {
        setHidePantryPrompts(hide)
        toast.success(hide ? 'Pantry prompts hidden' : 'Pantry prompts shown')
      } else {
        toast.error('Failed to save preference')
      }
    } finally {
      setSavingPantryPrompts(false)
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold">Menu &amp; Features</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose which features appear for you. These settings only affect your account —
          other family members set their own.
        </p>
      </div>

      {/* Main menu visibility */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Eye className="h-4 w-4 text-blue-500" />
            Menu visibility
          </div>
          <p className="text-xs text-muted-foreground">
            Show or hide items in the left menu (and the mobile menu and search palette).
            Home and Settings are always visible. Pages you hide stay accessible by direct link.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setAllNavHrefs(true)}
            disabled={savingMainNav}
            className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Show all
          </button>
          <button
            onClick={() => setAllNavHrefs(false)}
            disabled={savingMainNav}
            className="text-xs px-2.5 py-1 rounded-md border border-border hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Hide all
          </button>
        </div>

        <div className="space-y-4">
          {MAIN_NAV_GROUPS.map(group => (
            <div key={group}>
              <p className="text-xs font-semibold tracking-wider uppercase text-muted-foreground/60 mb-2">{group}</p>
              <div className="space-y-2">
                {MAIN_NAV_KEYS.filter(k => k.group === group).map(({ href, label }) => (
                  <div key={href} className="flex items-center justify-between">
                    <span className="text-sm">{label}</span>
                    <Switch
                      checked={mainNav[href] !== false}
                      onCheckedChange={visible => toggleNavHref(href, visible)}
                      disabled={savingMainNav}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pantry prompts */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CookingPot className="h-4 w-4 text-blue-500" />
              Pantry prompts
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, the meal plan shows a &ldquo;Cooked it&rdquo; button that suggests pantry
              items to mark low or out, and clearing checked-off shopping items offers to restock
              the pantry. Turn off if you don&apos;t track pantry stock.
            </p>
          </div>
          <Switch
            checked={!hidePantryPrompts}
            onCheckedChange={enabled => savePantryPrompts(!enabled)}
            disabled={savingPantryPrompts}
          />
        </div>
      </div>
    </div>
  )
}
