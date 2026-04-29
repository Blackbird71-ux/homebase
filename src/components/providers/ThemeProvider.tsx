// src/components/providers/ThemeProvider.tsx
'use client'

import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'
import { useEffect } from 'react'

// Sits inside NextThemesProvider so it can call useTheme() and sync the
// per-user DB theme into next-themes (which otherwise only reads localStorage).
function ThemeSyncer({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme()

  async function fetchSettings() {
    try {
      const response = await fetch('/api/settings')
      if (!response.ok) return
      const data = await response.json()

      if (data.theme) setTheme(data.theme)

      // Apply accessibility data attributes immediately without page reload
      if (data.lineHeight) document.documentElement.dataset.lineHeight = data.lineHeight
      if (data.fontWeight) document.documentElement.dataset.fontWeight = data.fontWeight
    } catch (error) {
      console.error('Failed to fetch settings:', error)
    }
  }

  useEffect(() => {
    fetchSettings()

    window.addEventListener('appearance-updated', fetchSettings)
    return () => window.removeEventListener('appearance-updated', fetchSettings)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      themes={['light', 'dark', 'system', 'modern', 'midnight', 'apple-grey', 'glass-dark', 'sunset', 'ocean', 'forest', 'high-contrast', 'high-contrast-dark']}
    >
      <ThemeSyncer>
        {children}
      </ThemeSyncer>
    </NextThemesProvider>
  )
}
