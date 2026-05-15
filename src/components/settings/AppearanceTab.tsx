// src/components/settings/AppearanceTab.tsx
'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle, AlertCircle, Sun, Moon, Monitor, Eye, Loader2, MapPin, LayoutList, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppearanceTabProps {
  initialTheme: string
  initialFontSize: string
  initialLineHeight: string
  initialFontWeight: string
  initialWeekStartsOn: number
  initialDoneItemColor: string
  initialSecureCardStyle?: string
  initialSecureCardColor?: string
}

type Status = { type: 'success' | 'error'; message: string } | null

const themeOptions = [
  { value: 'light',              label: 'Light',           icon: Sun,     swatch: 'bg-white border border-zinc-200' },
  { value: 'dark',               label: 'Dark',            icon: Moon,    swatch: 'bg-zinc-900' },
  { value: 'system',             label: 'System',          icon: Monitor, swatch: 'bg-gradient-to-br from-white to-zinc-900' },
  { value: 'modern',             label: 'Modern',          icon: Sun,     swatch: 'bg-[#f5f5f7]' },
  { value: 'midnight',           label: 'Midnight',        icon: Moon,    swatch: 'bg-[#0b0e14]' },
  { value: 'apple-grey',         label: 'Apple',           icon: Sun,     swatch: 'bg-[#f2f2f7]' },
  { value: 'apple-pro',          label: 'Apple Pro',       icon: Moon,    swatch: 'bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] border border-blue-400/30' },
  { value: 'glass-dark',         label: 'Glass',           icon: Moon,    swatch: 'bg-black' },
  { value: 'sunset',             label: 'Sunset',          icon: Sun,     swatch: 'bg-gradient-to-br from-orange-100 to-pink-100' },
  { value: 'ocean',              label: 'Ocean',           icon: Sun,     swatch: 'bg-gradient-to-br from-blue-50 to-cyan-50' },
  { value: 'forest',             label: 'Forest',          icon: Sun,     swatch: 'bg-gradient-to-br from-green-50 to-emerald-50' },
  { value: 'high-contrast',          label: 'Hi-Contrast',       icon: Eye,  swatch: 'bg-white border-2 border-black' },
  { value: 'high-contrast-dark',     label: 'Hi-Contrast Dark',  icon: Eye,  swatch: 'bg-black border border-white/60' },
  { value: 'high-contrast-sunset',   label: 'HC Sunset',         icon: Eye,  swatch: 'bg-amber-50 border-2 border-amber-900' },
  { value: 'high-contrast-ocean',    label: 'HC Ocean',          icon: Eye,  swatch: 'bg-sky-50 border-2 border-sky-900' },
  { value: 'high-contrast-forest',   label: 'HC Forest',         icon: Eye,  swatch: 'bg-emerald-50 border-2 border-emerald-900' },
  { value: 'high-contrast-midnight', label: 'HC Midnight',       icon: Eye,  swatch: 'bg-[#070b18] border border-sky-300' },
  { value: 'apple-aqua',     label: 'Apple Aqua',     icon: Sun,  swatch: 'bg-[#f5f5fa] border border-blue-200' },
  { value: 'apple-graphite', label: 'Apple Graphite', icon: Moon, swatch: 'bg-[#2a2a2e]' },
  { value: 'apple-sunset',   label: 'Apple Sunset',   icon: Sun,  swatch: 'bg-gradient-to-br from-orange-50 to-rose-100' },
  { value: 'apple-midnight', label: 'Apple Midnight', icon: Moon, swatch: 'bg-[#0d1226]' },
  { value: 'apple-forest',   label: 'Apple Forest',   icon: Sun,  swatch: 'bg-gradient-to-br from-green-50 to-teal-100' },
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

interface TodoListOption {
  id: string
  name: string
}

const secureCardStyleOptions = [
  { value: 'blur',   label: 'Blur',   description: 'Blur content with overlay' },
  { value: 'color',  label: 'Colour', description: 'Show coloured placeholder' },
] as const

const secureCardColorOptions = [
  { value: 'default',  label: 'Default',   swatch: 'bg-muted' },
  { value: 'red',      label: 'Red',       swatch: 'bg-red-100 dark:bg-red-950/40' },
  { value: 'blue',     label: 'Blue',      swatch: 'bg-blue-100 dark:bg-blue-950/40' },
  { value: 'green',    label: 'Green',     swatch: 'bg-green-100 dark:bg-green-950/40' },
  { value: 'amber',    label: 'Amber',     swatch: 'bg-amber-100 dark:bg-amber-950/40' },
  { value: 'purple',   label: 'Purple',    swatch: 'bg-purple-100 dark:bg-purple-950/40' },
  { value: 'pink',     label: 'Pink',      swatch: 'bg-pink-100 dark:bg-pink-950/40' },
] as const

export function AppearanceTab({
  initialTheme,
  initialFontSize,
  initialLineHeight,
  initialFontWeight,
  initialWeekStartsOn,
  initialDoneItemColor,
  initialSecureCardStyle = 'blur',
  initialSecureCardColor = 'default',
}: AppearanceTabProps) {
  const { setTheme } = useTheme()
  const [theme, setLocalTheme] = useState(initialTheme)
  const [fontSize, setFontSize] = useState(initialFontSize)
  const [lineHeight, setLineHeight] = useState(initialLineHeight)
  const [fontWeight, setFontWeight] = useState(initialFontWeight)
  const [weekStartsOn, setWeekStartsOn] = useState(initialWeekStartsOn)
  const [doneItemColor, setDoneItemColor] = useState(initialDoneItemColor)
  const [secureCardStyle, setSecureCardStyle] = useState(initialSecureCardStyle)
  const [secureCardColor, setSecureCardColor] = useState(initialSecureCardColor)
  const [mealPlanLayout, setMealPlanLayout] = useState<'single' | 'multi'>('multi')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  const [shoppingLists, setShoppingLists] = useState<ShoppingListOption[]>([])
  const [dashboardShoppingListId, setDashboardShoppingListId] = useState<string>('')
  const [todoLists, setTodoLists] = useState<TodoListOption[]>([])
  const [dashboardTodoListId, setDashboardTodoListId] = useState<string>('')
  const [loadingLists, setLoadingLists] = useState(true)
  const [weatherLocation, setWeatherLocation] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [shoppingRes, todoRes, settingsRes] = await Promise.all([
          fetch('/api/lists?type=SHOPPING'),
          fetch('/api/lists?type=TODO'),
          fetch('/api/settings'),
        ])
        if (shoppingRes.ok) {
          const lists = await shoppingRes.json()
          setShoppingLists(lists)
        }
        if (todoRes.ok) {
          const lists = await todoRes.json()
          setTodoLists(lists)
        }
        if (settingsRes.ok) {
          const settings = await settingsRes.json()
          const prefs = settings.uiPreferences
          if (prefs?.dashboardShoppingListId) {
            setDashboardShoppingListId(prefs.dashboardShoppingListId)
          }
          if (prefs?.dashboardTodoListId) {
            setDashboardTodoListId(prefs.dashboardTodoListId)
          }
          if (prefs?.secureCardStyle) {
            setSecureCardStyle(prefs.secureCardStyle)
          }
          if (prefs?.secureCardColor) {
            setSecureCardColor(prefs.secureCardColor)
          }
          if (prefs?.mealPlanLayout === 'single' || prefs?.mealPlanLayout === 'multi') {
            setMealPlanLayout(prefs.mealPlanLayout)
          }
          if (prefs?.weatherLocation) {
            setWeatherLocation(prefs.weatherLocation)
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
        uiPreferences: {
          dashboardShoppingListId: dashboardShoppingListId || null,
          dashboardTodoListId: dashboardTodoListId || null,
          secureCardStyle,
          secureCardColor,
          mealPlanLayout,
          weatherLocation: weatherLocation || null,
        },
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
        document.documentElement.dataset.fontSize = fontSize
        window.dispatchEvent(new Event('appearance-updated'))
        setStatus({ type: 'success', message: 'Settings saved.' })
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

  const isHighContrast = theme.startsWith('high-contrast')

  function SaveBar() {
    return (
      <div className="pt-2 space-y-3">
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

  return (
    <Tabs defaultValue="theme" className="w-full">
      <TabsList className="mb-6">
        <TabsTrigger value="theme">Theme</TabsTrigger>
        <TabsTrigger value="text">Text</TabsTrigger>
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="advanced">Advanced</TabsTrigger>
      </TabsList>

      {/* ── THEME TAB ── */}
      <TabsContent value="theme" className="space-y-6">

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>
            Choose how Homebase looks. Hi-Contrast themes maximise text visibility with solid borders.
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
              High Contrast themes use strongly contrasting colours with solid borders — best for low-vision users or bright environments.
            </p>
          )}
        </CardContent>
      </Card>

      <SaveBar />
      </TabsContent>

      {/* ── TEXT TAB ── */}
      <TabsContent value="text" className="space-y-6">

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

      <SaveBar />
      </TabsContent>

      {/* ── DASHBOARD TAB ── */}
      <TabsContent value="dashboard" className="space-y-6">

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

      {/* Done Item Colour */}
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

      {/* Meal Planner Layout */}
      <Card>
        <CardHeader>
          <CardTitle>Meal Planner Layout</CardTitle>
          <CardDescription>
            Choose how days are displayed in the Meal Planner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              aria-pressed={mealPlanLayout === 'multi'}
              onClick={() => setMealPlanLayout('multi')}
              className={cn(
                'flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all',
                mealPlanLayout === 'multi'
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-muted-foreground/30'
              )}
            >
              {/* Mini grid preview */}
              <div className="w-full aspect-[4/3] rounded-lg border border-border/50 bg-muted/30 p-1.5 grid grid-cols-2 gap-1">
                {[0,1,2,3].map(i => (
                  <div key={i} className="rounded bg-muted/60 flex flex-col gap-0.5 p-1">
                    <div className="h-1 w-3/4 rounded-sm bg-muted-foreground/20" />
                    <div className="h-2 rounded-sm bg-primary/20" />
                    <div className="h-1.5 rounded-sm bg-muted/80" />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                <span className="text-sm font-medium">Grid</span>
              </div>
              <span className="text-xs text-muted-foreground text-center leading-tight">See more days at once — great for planning ahead</span>
            </button>

            <button
              type="button"
              aria-pressed={mealPlanLayout === 'single'}
              onClick={() => setMealPlanLayout('single')}
              className={cn(
                'flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all',
                mealPlanLayout === 'single'
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-muted-foreground/30'
              )}
            >
              {/* Mini list preview */}
              <div className="w-full aspect-[4/3] rounded-lg border border-border/50 bg-muted/30 p-1.5 flex flex-col gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="rounded bg-muted/60 flex items-center gap-1.5 px-1.5 py-1">
                    <div className="shrink-0 w-5 flex flex-col items-center">
                      <div className="h-1 w-4 rounded-sm bg-muted-foreground/20" />
                      <div className="h-2.5 w-3.5 rounded-sm bg-primary/30" />
                    </div>
                    <div className="flex-1 flex flex-col gap-0.5">
                      <div className="h-1.5 w-full rounded-sm bg-primary/20" />
                      <div className="h-1 w-2/3 rounded-sm bg-muted/80" />
                      <div className="h-1 w-1/2 rounded-sm bg-muted/80" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <LayoutList className="h-3.5 w-3.5 shrink-0" />
                <span className="text-sm font-medium">List</span>
              </div>
              <span className="text-xs text-muted-foreground text-center leading-tight">One day per row with all meal slots always visible</span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Weather Location */}
      <Card>
        <CardHeader>
          <CardTitle>Weather Location</CardTitle>
          <CardDescription>
            Default location for weather on the dashboard. Leave blank to use GPS location instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={weatherLocation}
                onChange={(e) => setWeatherLocation(e.target.value)}
                placeholder="e.g. Sydney, AU"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Used as fallback when GPS location is unavailable. Get your free OpenWeatherMap API key to enable weather.
            </p>
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

      {/* Dashboard Todo List */}
      <Card>
        <CardHeader>
          <CardTitle>Dashboard Todo List</CardTitle>
          <CardDescription>
            Which todo list to show on the Home dashboard. Defaults to the most recently created active list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingLists ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading todo lists...
            </div>
          ) : (
            <div className="space-y-2">
              <Select value={dashboardTodoListId} onValueChange={(v: string | null) => setDashboardTodoListId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Auto (most recent active list)">
                    {dashboardTodoListId
                      ? (todoLists.find((l) => l.id === dashboardTodoListId)?.name ?? dashboardTodoListId)
                      : 'Auto (most recent active list)'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Auto (most recent active list)</SelectItem>
                  {todoLists.map((list) => (
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

      <SaveBar />
      </TabsContent>

      {/* ── ADVANCED TAB ── */}
      <TabsContent value="advanced" className="space-y-6">

      {/* Secure Card Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Secure Card Appearance</CardTitle>
          <CardDescription>
            How PIN-protected notes and contacts appear on cards before unlocking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Style</Label>
            <div className="grid grid-cols-2 gap-2">
              {secureCardStyleOptions.map(({ value, label, description }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={secureCardStyle === value}
                  onClick={() => setSecureCardStyle(value)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors text-left',
                    secureCardStyle === value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  )}
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">{description}</span>
                </button>
              ))}
            </div>
          </div>
          {secureCardStyle === 'color' && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Placeholder Colour</Label>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {secureCardColorOptions.map(({ value, label, swatch }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={secureCardColor === value}
                    onClick={() => setSecureCardColor(value)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-colors',
                      secureCardColor === value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30'
                    )}
                  >
                    <div className={cn('w-6 h-6 rounded-full shrink-0', swatch)} />
                    <span className="text-xs font-medium truncate w-full text-center">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SaveBar />
      </TabsContent>

    </Tabs>
  )
}
