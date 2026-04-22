// src/components/settings/AdvancedThemingTab.tsx
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ColorPicker } from '@/components/ui/color-picker'
import { CheckCircle, AlertCircle, RefreshCw, Palette } from 'lucide-react'
import { CustomThemeColors } from '@/types'
import { cn } from '@/lib/utils'

interface AdvancedThemingTabProps {
  initialCustomTheme?: CustomThemeColors | null
}

type Status = { type: 'success' | 'error'; message: string } | null

// Default theme structure
const DEFAULT_CUSTOM_THEME: CustomThemeColors = {
  // Sidebar
  sidebar: '',
  sidebarForeground: '',
  sidebarPrimary: '',
  sidebarPrimaryForeground: '',
  sidebarAccent: '',
  sidebarAccentForeground: '',
  sidebarBorder: '',
  sidebarRing: '',
  
  // Calendar
  calendarBackground: '',
  calendarEvent: '',
  calendarEventHover: '',
  calendarText: '',
  calendarBorder: '',
  
  // Cards
  card: '',
  cardForeground: '',
  cardBorder: '',
  cardHover: '',
  
  // Text
  textPrimary: '',
  textSecondary: '',
  textMuted: '',
  textAccent: '',
  
  // Buttons
  buttonPrimary: '',
  buttonPrimaryForeground: '',
  buttonSecondary: '',
  buttonSecondaryForeground: '',
  buttonAccent: '',
  buttonAccentForeground: '',
  
  // General
  background: '',
  foreground: '',
  primary: '',
  primaryForeground: '',
  secondary: '',
  secondaryForeground: '',
  accent: '',
  accentForeground: '',
  muted: '',
  mutedForeground: '',
  border: '',
  input: '',
  ring: '',
  destructive: '',
}

// Group colors by category for better organization
const COLOR_GROUPS = [
  {
    title: 'Sidebar',
    description: 'Navigation sidebar colors',
    colors: [
      { key: 'sidebar', label: 'Background' },
      { key: 'sidebarForeground', label: 'Text' },
      { key: 'sidebarPrimary', label: 'Primary' },
      { key: 'sidebarPrimaryForeground', label: 'Primary Text' },
      { key: 'sidebarAccent', label: 'Accent' },
      { key: 'sidebarAccentForeground', label: 'Accent Text' },
      { key: 'sidebarBorder', label: 'Border' },
      { key: 'sidebarRing', label: 'Ring' },
    ],
  },
  {
    title: 'Calendar',
    description: 'Calendar view colors',
    colors: [
      { key: 'calendarBackground', label: 'Background' },
      { key: 'calendarEvent', label: 'Event' },
      { key: 'calendarEventHover', label: 'Event Hover' },
      { key: 'calendarText', label: 'Text' },
      { key: 'calendarBorder', label: 'Border' },
    ],
  },
  {
    title: 'Cards',
    description: 'Card component colors',
    colors: [
      { key: 'card', label: 'Background' },
      { key: 'cardForeground', label: 'Text' },
      { key: 'cardBorder', label: 'Border' },
      { key: 'cardHover', label: 'Hover' },
    ],
  },
  {
    title: 'Text',
    description: 'Text colors throughout the app',
    colors: [
      { key: 'textPrimary', label: 'Primary' },
      { key: 'textSecondary', label: 'Secondary' },
      { key: 'textMuted', label: 'Muted' },
      { key: 'textAccent', label: 'Accent' },
    ],
  },
  {
    title: 'Buttons',
    description: 'Button component colors',
    colors: [
      { key: 'buttonPrimary', label: 'Primary Background' },
      { key: 'buttonPrimaryForeground', label: 'Primary Text' },
      { key: 'buttonSecondary', label: 'Secondary Background' },
      { key: 'buttonSecondaryForeground', label: 'Secondary Text' },
      { key: 'buttonAccent', label: 'Accent Background' },
      { key: 'buttonAccentForeground', label: 'Accent Text' },
    ],
  },
  {
    title: 'General',
    description: 'General theme colors',
    colors: [
      { key: 'background', label: 'Background' },
      { key: 'foreground', label: 'Foreground' },
      { key: 'primary', label: 'Primary' },
      { key: 'primaryForeground', label: 'Primary Text' },
      { key: 'secondary', label: 'Secondary' },
      { key: 'secondaryForeground', label: 'Secondary Text' },
      { key: 'accent', label: 'Accent' },
      { key: 'accentForeground', label: 'Accent Text' },
      { key: 'muted', label: 'Muted' },
      { key: 'mutedForeground', label: 'Muted Text' },
      { key: 'border', label: 'Border' },
      { key: 'input', label: 'Input' },
      { key: 'ring', label: 'Ring' },
      { key: 'destructive', label: 'Destructive' },
    ],
  },
]

export function AdvancedThemingTab({ initialCustomTheme }: AdvancedThemingTabProps) {
  const [customTheme, setCustomTheme] = useState<CustomThemeColors>(
    initialCustomTheme || { ...DEFAULT_CUSTOM_THEME }
  )
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [hasChanges, setHasChanges] = useState(false)

  // Check if there are changes from initial
  useEffect(() => {
    const hasActualChanges = Object.keys(customTheme).some(
      key => customTheme[key as keyof CustomThemeColors] !== (initialCustomTheme?.[key as keyof CustomThemeColors] || '')
    )
    setHasChanges(hasActualChanges)
  }, [customTheme, initialCustomTheme])

  const handleColorChange = (key: keyof CustomThemeColors, value: string) => {
    setCustomTheme(prev => ({
      ...prev,
      [key]: value,
    }))
  }

  const resetToDefaults = () => {
    setCustomTheme({ ...DEFAULT_CUSTOM_THEME })
  }

  const resetToInitial = () => {
    if (initialCustomTheme) {
      setCustomTheme({ ...initialCustomTheme })
    } else {
      setCustomTheme({ ...DEFAULT_CUSTOM_THEME })
    }
  }

  const clearAll = () => {
    setCustomTheme({ ...DEFAULT_CUSTOM_THEME })
  }

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      // Filter out empty values
      const filteredTheme: CustomThemeColors = {}
      Object.entries(customTheme).forEach(([key, value]) => {
        if (value && value.trim() !== '') {
          filteredTheme[key as keyof CustomThemeColors] = value
        }
      })

      const uiPreferences = {
        customTheme: filteredTheme,
      }

      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiPreferences: JSON.stringify(uiPreferences) }),
      })

      if (res.ok) {
        setStatus({ type: 'success', message: 'Custom theme saved successfully.' })
        setHasChanges(false)
        // Notify ThemeProvider to re-fetch — no full page reload needed
        window.dispatchEvent(new Event('advanced-theme-updated'))
      } else {
        const data = await res.json()
        setStatus({ type: 'error', message: data.error ?? 'Failed to save custom theme.' })
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Advanced Theming</h2>
          <p className="text-muted-foreground">
            Customize colors for different parts of the application. Leave empty to use theme defaults.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={resetToInitial}
            disabled={!hasChanges}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset Changes
          </Button>
          <Button
            variant="outline"
            onClick={clearAll}
          >
            Clear All
          </Button>
        </div>
      </div>

      {COLOR_GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              {group.title}
            </CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {group.colors.map(({ key, label }) => (
                <div key={key} className="space-y-2">
                  <label className="text-sm font-medium">
                    {label}
                  </label>
                  <ColorPicker
                    value={customTheme[key as keyof CustomThemeColors] || ''}
                    onChange={(value) => handleColorChange(key as keyof CustomThemeColors, value)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center justify-between pt-4 border-t">
        <div className="text-sm text-muted-foreground">
          {hasChanges ? 'You have unsaved changes' : 'No changes to save'}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={resetToDefaults}
          >
            Reset to Defaults
          </Button>
          <Button
            onClick={save}
            disabled={saving || !hasChanges}
          >
            {saving ? 'Saving...' : 'Save Custom Theme'}
          </Button>
        </div>
      </div>

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
          {status.type === 'success' ? (
            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <span>{status.message}</span>
        </div>
      )}

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-sm">Preview</CardTitle>
          <CardDescription>
            See how your custom colors look in real-time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div
              className="h-20 rounded-lg border"
              style={{ backgroundColor: customTheme.sidebar || 'var(--sidebar)' }}
            >
              <div className="p-2 text-xs">Sidebar</div>
            </div>
            <div
              className="h-20 rounded-lg border"
              style={{ backgroundColor: customTheme.card || 'var(--card)' }}
            >
              <div className="p-2 text-xs">Card</div>
            </div>
            <div
              className="h-20 rounded-lg border"
              style={{ backgroundColor: customTheme.buttonPrimary || 'var(--primary)' }}
            >
              <div className="p-2 text-xs text-white">Button</div>
            </div>
            <div
              className="h-20 rounded-lg border"
              style={{ backgroundColor: customTheme.background || 'var(--background)' }}
            >
              <div className="p-2 text-xs">Background</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}