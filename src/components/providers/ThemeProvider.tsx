// src/components/providers/ThemeProvider.tsx
'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { AdvancedThemeProvider } from './AdvancedThemeProvider'
import { CustomThemeColors } from '@/types'
import { useEffect, useState } from 'react'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [customTheme, setCustomTheme] = useState<CustomThemeColors | null>(null)

  // Fetch custom theme from user preferences
  useEffect(() => {
    async function fetchCustomTheme() {
      try {
        const response = await fetch('/api/settings')
        if (response.ok) {
          const data = await response.json()
          if (data.uiPreferences) {
            const uiPrefs = JSON.parse(data.uiPreferences)
            if (uiPrefs.customTheme) {
              setCustomTheme(uiPrefs.customTheme)
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch custom theme:', error)
      }
    }

    fetchCustomTheme()
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
