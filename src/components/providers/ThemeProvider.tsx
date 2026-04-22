// src/components/providers/ThemeProvider.tsx
'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { AdvancedThemeProvider } from './AdvancedThemeProvider'
import { CustomThemeColors } from '@/types'
import { useEffect, useState } from 'react'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [customTheme, setCustomTheme] = useState<CustomThemeColors | null>(null)

  // Fetch custom theme from user preferences
  async function fetchCustomTheme() {
    try {
      const response = await fetch('/api/settings')
      if (response.ok) {
        const data = await response.json()
        if (data.uiPreferences) {
          const uiPrefs = typeof data.uiPreferences === 'string'
            ? JSON.parse(data.uiPreferences)
            : data.uiPreferences
          setCustomTheme(uiPrefs?.customTheme ?? null)
        } else {
          setCustomTheme(null)
        }
      }
    } catch (error) {
      console.error('Failed to fetch custom theme:', error)
    }
  }

  useEffect(() => {
    fetchCustomTheme()

    // Re-fetch whenever AdvancedThemingTab fires this event after a successful save
    const handler = () => fetchCustomTheme()
    window.addEventListener('advanced-theme-updated', handler)
    return () => window.removeEventListener('advanced-theme-updated', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      themes={['light', 'dark', 'system', 'modern', 'midnight', 'apple-grey', 'glass-dark', 'sunset', 'ocean', 'forest']}
    >
      <AdvancedThemeProvider customTheme={customTheme}>
        {children}
      </AdvancedThemeProvider>
    </NextThemesProvider>
  )
}
