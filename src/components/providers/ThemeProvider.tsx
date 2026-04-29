// src/components/providers/ThemeProvider.tsx
'use client'

import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'
import { AdvancedThemeProvider } from './AdvancedThemeProvider'
import { CustomThemeColors } from '@/types'
import { useEffect, useState } from 'react'

// Sits inside NextThemesProvider so it can call useTheme() and sync the
// per-user DB theme into next-themes (which otherwise only reads localStorage).
function ThemeSyncer({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme()
  const [customTheme, setCustomTheme] = useState<CustomThemeColors | null>(null)

  async function fetchSettings() {
    try {
      const response = await fetch('/api/settings')
      if (!response.ok) return
      const data = await response.json()

      // Sync base theme from DB → overrides whatever was in localStorage
      if (data.theme) setTheme(data.theme)

      // Sync custom CSS-variable overrides
      if (data.uiPreferences) {
        const uiPrefs = typeof data.uiPreferences === 'string'
          ? JSON.parse(data.uiPreferences)
          : data.uiPreferences
        setCustomTheme(uiPrefs?.customTheme ?? null)
      } else {
        setCustomTheme(null)
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    }
  }

  useEffect(() => {
    fetchSettings()

    // Re-sync whenever AdvancedThemingTab fires this event after a save
    window.addEventListener('advanced-theme-updated', fetchSettings)
    return () => window.removeEventListener('advanced-theme-updated', fetchSettings)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AdvancedThemeProvider customTheme={customTheme}>
      {children}
    </AdvancedThemeProvider>
  )
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      themes={['light', 'dark', 'system', 'modern', 'midnight', 'apple-grey', 'glass-dark', 'sunset', 'ocean', 'forest']}
    >
      <ThemeSyncer>
        {children}
      </ThemeSyncer>
    </NextThemesProvider>
  )
}
