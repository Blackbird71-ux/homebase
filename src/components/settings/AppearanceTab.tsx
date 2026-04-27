// src/components/settings/AppearanceTab.tsx
'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle, AlertCircle, Sun, Moon, Monitor, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppearanceTabProps {
  initialTheme: string
  initialFontSize: string
  initialWeekStartsOn: number
  initialDoneItemColor: string
}

type Status = { type: 'success' | 'error'; message: string } | null

const themeOptions = [
  { value: 'light', label: 'Light', icon: Sun, swatch: 'bg-white border border-zinc-200' },
  { value: 'dark', label: 'Dark', icon: Moon, swatch: 'bg-zinc-900' },
  { value: 'system', label: 'System', icon: Monitor, swatch: 'bg-gradient-to-br from-white to-zinc-900' },
  { value: 'modern', label: 'Modern', icon: Sun, swatch: 'bg-[#f5f5f7]' },
  { value: 'midnight', label: 'Midnight', icon: Moon, swatch: 'bg-[#0b0e14]' },
  { value: 'apple-grey', label: 'Apple', icon: Sun, swatch: 'bg-[#f2f2f7]' },
  { value: 'glass-dark', label: 'Glass', icon: Moon, swatch: 'bg-black' },
  { value: 'sunset', label: 'Sunset', icon: Sun, swatch: 'bg-gradient-to-br from-orange-100 to-pink-100' },
  { value: 'ocean', label: 'Ocean', icon: Sun, swatch: 'bg-gradient-to-br from-blue-50 to-cyan-50' },
  { value: 'forest', label: 'Forest', icon: Sun, swatch: 'bg-gradient-to-br from-green-50 to-emerald-50' },
] as const

const fontSizeOptions = [
  { value: 'sm', label: 'Small', previewClass: 'text-sm' },
  { value: 'base', label: 'Base', previewClass: 'text-base' },
  { value: 'lg', label: 'Large', previewClass: 'text-lg' },
] as const

const weekStartOptions = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
] as const

const colorOptions = [
  { value: 'RED', label: 'Red', swatch: 'bg-red-500' },
  { value: 'GREEN', label: 'Green', swatch: 'bg-green-500' },
  { value: 'BLUE', label: 'Blue', swatch: 'bg-blue-500' },
  { value: 'YELLOW', label: 'Yellow', swatch: 'bg-yellow-500' },
  { value: 'PURPLE', label: 'Purple', swatch: 'bg-purple-500' },
  { value: 'PINK', label: 'Pink', swatch: 'bg-pink-500' },
  { value: 'ORANGE', label: 'Orange', swatch: 'bg-orange-500' },
  { value: 'GRAY', label: 'Gray', swatch: 'bg-gray-500' },
] as const

interface ShoppingListOption {
  id: string
  name: string
}

export function AppearanceTab({ initialTheme, initialFontSize, initialWeekStartsOn, initialDoneItemColor }: AppearanceTabProps) {
  const { setTheme } = useTheme()
  const [theme, setLocalTheme] = useState(initialTheme)
  const [fontSize, setFontSize] = useState(initialFontSize)
  const [weekStartsOn, setWeekStartsOn] = useState(initialWeekStartsOn)
  const [doneItemColor, setDoneItemColor] = useState(initialDoneItemColor)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  // Dashboard shopping list preference
  const [shoppingLists, setShoppingLists] = useState<ShoppingListOption[]>([])
  const [dashboardShoppingListId, setDashboardShoppingListId] = useState<string>('')
  const [loadingLists, setLoadingLists] = useState(true)

  // Load shopping lists and current preference
  useEffect(() => {
    async function load() {
      try {
        const [listsRes, settingsRes] = await Promise.all([
          fetch('/api/lists?type=SHOPPING'),
          fetch('/api/settings'),
        ])
        if (listsRes.ok) {
          const lists = await listsRes.json()
          setShoppingLists(lists)
        }
        if (settingsRes.ok) {
          const settings = await settingsRes.json()
          const prefs = settings.uiPreferences
          if (prefs?.dashboardShoppingListId) {
            setDashboardShoppingListId(prefs.dashboardShoppingListId)
          }
        }
      } catch {
        // ignore
      } finally {
        setLoadingLists(false)
      }
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      const body: Record<string, unknown> = { theme, fontSize, weekStartsOn, doneItemColor }

      // Include dashboard shopping list preference in uiPreferences
      if (dashboardShoppingListId) {
        body.uiPreferences = { dashboardShoppingListId }
      } else {
        body.uiPreferences = { dashboardShoppingListId: null }
      }

      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        // Apply theme immediately via next-themes
        setTheme(theme)
        setStatus({ type: 'success', message: 'Appearance settings saved. Reload the page to apply font size changes.' })
      } else {
        const data = await res.json()
        setStatus({ type: 'error', message: data.error ?? 'Failed to save.' })
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Choose how Homebase looks to you.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {themeOptions.map(({ value, label, icon: Icon, swatch }) => (
              <button
                key={value}
                type="button"
                aria-pressed={theme === value}
                onClick={() => setLocalTheme(value)}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors',
                  theme === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <div className={`w-6 h-6 rounded-full ${swatch} shrink-0`} />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Font Size */}
      <Card>
        <CardHeader>
          <CardTitle>Font Size</CardTitle>
          <CardDescription>Adjust the base text size across the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {fontSizeOptions.map(({ value, label, previewClass }) => (
              <button
                key={value}
                type="button"
                aria-pressed={fontSize === value}
                onClick={() => setFontSize(value)}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors flex-1',
                  fontSize === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <span className={cn('font-medium', previewClass)}>Aa</span>
                <span className="text-xs">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Week Start */}
      <Card>
        <CardHeader>
          <CardTitle>Week Starts On</CardTitle>
          <CardDescription>Sets the first day of the week in Calendar and Meal Plan.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {weekStartOptions.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={weekStartsOn === value}
                onClick={() => setWeekStartsOn(value)}
                className={cn(
                  'flex items-center justify-center p-3 rounded-lg border-2 transition-colors flex-1',
                  weekStartsOn === value
                    ? 'border-primary bg-primary/5 font-medium'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <span className="text-sm">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Done Item Color */}
      <Card>
        <CardHeader>
          <CardTitle>Done Item Color</CardTitle>
          <CardDescription>Choose the color for completed items in shopping and todo lists.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2">
            {colorOptions.map(({ value, label, swatch }) => (
              <button
                key={value}
                type="button"
                aria-pressed={doneItemColor === value}
                onClick={() => setDoneItemColor(value)}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors',
                  doneItemColor === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <div className={`w-6 h-6 rounded-full ${swatch} shrink-0`} />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dashboard Shopping List */}
      <Card>
        <CardHeader>
          <CardTitle>Dashboard Shopping List</CardTitle>
          <CardDescription>
            Choose which shopping list to display on the Home dashboard. By default, the most recently created active list is shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingLists ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading shopping lists...
            </div>
          ) : (
            <div className="space-y-2">
              <Select value={dashboardShoppingListId} onValueChange={(v: string | null) => setDashboardShoppingListId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Auto (most recent active list)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Auto (most recent active list)</SelectItem>
                  {shoppingLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select a specific shopping list to always show on the dashboard, or leave as "Auto" to use the most recent active list.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? 'Saving...' : 'Save Appearance'}
      </Button>

      {status && (
        <div
          role="alert"
          className={`flex items-start gap-2 text-sm p-3 rounded-md ${status.type === 'success' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}
        >
          {status.type === 'success'
            ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
            : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>{status.message}</span>
        </div>
      )}
    </div>
  )
}
