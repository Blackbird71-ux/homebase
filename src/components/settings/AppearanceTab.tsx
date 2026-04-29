// src/components/settings/AppearanceTab.tsx
'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle, AlertCircle, Sun, Moon, Monitor, Eye, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppearanceTabProps {
  initialTheme: string
  initialFontSize: string
  initialLineHeight: string
  initialFontWeight: string
  initialWeekStartsOn: number
  initialDoneItemColor: string
}

type Status = { type: 'success' | 'error'; message: string } | null

const themeOptions = [
  { value: 'light',              label: 'Light',           icon: Sun,     swatch: 'bg-white border border-zinc-200' },
  { value: 'dark',               label: 'Dark',            icon: Moon,    swatch: 'bg-zinc-900' },
  { value: 'system',             label: 'System',          icon: Monitor, swatch: 'bg-gradient-to-br from-white to-zinc-900' },
  { value: 'modern',             label: 'Modern',          icon: Sun,     swatch: 'bg-[#f5f5f7]' },
  { value: 'midnight',           label: 'Midnight',        icon: Moon,    swatch: 'bg-[#0b0e14]' },
  { value: 'apple-grey',         label: 'Apple',           icon: Sun,     swatch: 'bg-[#f2f2f7]' },
  { value: 'glass-dark',         label: 'Glass',           icon: Moon,    swatch: 'bg-black' },
  { value: 'sunset',             label: 'Sunset',          icon: Sun,     swatch: 'bg-gradient-to-br from-orange-100 to-pink-100' },
  { value: 'ocean',              label: 'Ocean',           icon: Sun,     swatch: 'bg-gradient-to-br from-blue-50 to-cyan-50' },
  { value: 'forest',             label: 'Forest',          icon: Sun,     swatch: 'bg-gradient-to-br from-green-50 to-emerald-50' },
  { value: 'high-contrast',      label: 'Hi-Contrast',     icon: Eye,     swatch: 'bg-white border-2 border-black' },
  { value: 'high-contrast-dark', label: 'Hi-Contrast Dark',icon: Eye,     swatch: 'bg-black border border-white/60' },
] as const

const fontSizeOptions = [
  { value: 'sm',   label: 'Small',       previewClass: 'text-sm',  description: '14px' },
  { value: 'base', label: 'Normal',      previewClass: 'text-base', description: '16px' },
  { value: 'lg',   label: 'Large',       previewClass: 'text-lg',  description: '18px' },
  { value: 'xl',   label: 'Extra Large', previewClass: 'text-xl',  description: '20px' },
] as const

const lineHeightOptions = [
  { value: 'normal',   label: 'Normal',   description: 'Default spacing' },
  { value: 'relaxed',  label: 'Relaxed',  description: 'More breathing room' },
  { value: 'spacious', label: 'Spacious', description: 'Maximum line spacing' },
] as const

const fontWeightOptions = [
  { value: 'normal', label: 'Normal', description: 'Standard text weight' },
  { value: 'medium', label: 'Medium', description: 'Slightly bolder — easier to read at small sizes' },
] as const

const weekStartOptions = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
] as const

const colorOptions = [
  { value: 'RED',    label: 'Red',    swatch: 'bg-red-500' },
  { value: 'GREEN',  label: 'Green',  swatch: 'bg-green-500' },
  { value: 'BLUE',   label: 'Blue',   swatch: 'bg-blue-500' },
  { value: 'YELLOW', label: 'Yellow', swatch: 'bg-yellow-500' },
  { value: 'PURPLE', label: 'Purple', swatch: 'bg-purple-500' },
  { value: 'PINK',   label: 'Pink',   swatch: 'bg-pink-500' },
  { value: 'ORANGE', label: 'Orange', swatch: 'bg-orange-500' },
  { value: 'GRAY',   label: 'Gray',   swatch: 'bg-gray-500' },
] as const

interface ShoppingListOption {
  id: string
  name: string
}

export function AppearanceTab({
  initialTheme,
  initialFontSize,
  initialLineHeight,
  initialFontWeight,
  initialWeekStartsOn,
  initialDoneItemColor,
}: AppearanceTabProps) {
  const { setTheme } = useTheme()
  const [theme, setLocalTheme] = useState(initialTheme)
  const [fontSize, setFontSize] = useState(initialFontSize)
  const [lineHeight, setLineHeight] = useState(initialLineHeight)
  const [fontWeight, setFontWeight] = useState(initialFontWeight)
  const [weekStartsOn, setWeekStartsOn] = useState(initialWeekStartsOn)
  const [doneItemColor, setDoneItemColor] = useState(initialDoneItemColor)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  const [shoppingLists, setShoppingLists] = useState<ShoppingListOption[]>([])
  const [dashboardShoppingListId, setDashboardShoppingListId] = useState<string>('')
  const [loadingLists, setLoadingLists] = useState(true)

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
      const body: Record<string, unknown> = {
        theme,
        fontSize,
        lineHeight,
        fontWeight,
        weekStartsOn,
        doneItemColor,
        uiPreferences: { dashboardShoppingListId: dashboardShoppingListId || null },
      }

      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setTheme(theme)
        // Apply accessibility settings immediately without page reload
        document.documentElement.dataset.lineHeight = lineHeight
        document.documentElement.dataset.fontWeight = fontWeight
        window.dispatchEvent(new Event('appearance-updated'))
        setStatus({ type: 'success', message: 'Settings saved. Font size changes apply on next page load.' })
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

  const isHighContrast = theme === 'high-contrast' || theme === 'high-contrast-dark'

  return (
    <div className="space-y-6">

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            Choose how Homebase looks. The two Hi-Contrast options maximise text visibility.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
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
                <div className={cn('w-6 h-6 rounded-full shrink-0', swatch)} />
                <span className="text-xs font-medium leading-tight text-center">{label}</span>
              </button>
            ))}
          </div>
          {isHighContrast && (
            <p className="mt-3 text-sm text-muted-foreground">
              High Contrast themes use black/white with strong borders — best for low-vision users or bright environments.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Font Size */}
      <Card>
        <CardHeader>
          <CardTitle>Text Size</CardTitle>
          <CardDescription>
            Scales all text across the app. Large or Extra Large is recommended for mobile use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {fontSizeOptions.map(({ value, label, previewClass, description }) => (
              <button
                key={value}
                type="button"
                aria-pressed={fontSize === value}
                onClick={() => setFontSize(value)}
                className={cn(
                  'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors',
                  fontSize === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <span className={cn('font-medium', previewClass)}>Aa</span>
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{description}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Line Spacing */}
      <Card>
        <CardHeader>
          <CardTitle>Line Spacing</CardTitle>
          <CardDescription>
            More space between lines makes long text easier to follow, especially on mobile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {lineHeightOptions.map(({ value, label, description }) => (
              <button
                key={value}
                type="button"
                aria-pressed={lineHeight === value}
                onClick={() => setLineHeight(value)}
                className={cn(
                  'flex flex-col gap-1 p-3 rounded-lg border-2 transition-colors',
                  lineHeight === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <span className="text-sm font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{description}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Font Weight */}
      <Card>
        <CardHeader>
          <CardTitle>Text Weight</CardTitle>
          <CardDescription>
            Medium weight text is slightly bolder — helps on low-contrast screens or in bright light.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {fontWeightOptions.map(({ value, label, description }) => (
              <button
                key={value}
                type="button"
                aria-pressed={fontWeight === value}
                onClick={() => setFontWeight(value)}
                className={cn(
                  'flex flex-col gap-1 p-3 rounded-lg border-2 transition-colors',
                  fontWeight === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <span className={cn('text-sm', value === 'medium' ? 'font-medium' : 'font-normal')}>{label}</span>
                <span className="text-xs text-muted-foreground">{description}</span>
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
          <CardTitle>Done Item Colour</CardTitle>
          <CardDescription>Colour for completed items in shopping and todo lists.</CardDescription>
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
                <div className={cn('w-6 h-6 rounded-full shrink-0', swatch)} />
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
            Which shopping list to show on the Home dashboard. Defaults to the most recently created active list.
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
                  <SelectValue placeholder="Auto (most recent active list)">
                    {dashboardShoppingListId
                      ? (shoppingLists.find((l) => l.id === dashboardShoppingListId)?.name ?? dashboardShoppingListId)
                      : 'Auto (most recent active list)'}
                  </SelectValue>
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
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving} size="lg">
        {saving ? 'Saving...' : 'Save Appearance'}
      </Button>

      {status && (
        <div
          role="alert"
          className={cn(
            'flex items-start gap-2 text-sm p-3 rounded-md',
            status.type === 'success'
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-destructive/10 text-destructive'
          )}
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
