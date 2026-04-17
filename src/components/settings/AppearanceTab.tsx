// src/components/settings/AppearanceTab.tsx
'use client'

import { useState } from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, AlertCircle, Sun, Moon, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppearanceTabProps {
  initialTheme: string
  initialFontSize: string
  initialWeekStartsOn: number
}

type Status = { type: 'success' | 'error'; message: string } | null

const themeOptions = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
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

export function AppearanceTab({ initialTheme, initialFontSize, initialWeekStartsOn }: AppearanceTabProps) {
  const { setTheme } = useTheme()
  const [theme, setLocalTheme] = useState(initialTheme)
  const [fontSize, setFontSize] = useState(initialFontSize)
  const [weekStartsOn, setWeekStartsOn] = useState(initialWeekStartsOn)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, fontSize, weekStartsOn }),
      })
      if (res.ok) {
        // Apply theme immediately via next-themes
        setTheme(theme)
        // Font size change requires a page reload to re-apply the html class from server
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
          <div className="flex gap-3">
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={theme === value}
                onClick={() => setLocalTheme(value)}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors flex-1',
                  theme === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <Icon className="h-5 w-5" />
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
