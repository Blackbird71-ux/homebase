// src/components/providers/AdvancedThemeProvider.tsx
'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { CustomThemeColors } from '@/types'

interface AdvancedThemeProviderProps {
  children: React.ReactNode
  customTheme?: CustomThemeColors | null
}

// CSS variable mappings for custom theme colors
const CSS_VARIABLE_MAPPINGS: Record<keyof CustomThemeColors, string> = {
  // Sidebar
  sidebar: '--sidebar',
  sidebarForeground: '--sidebar-foreground',
  sidebarPrimary: '--sidebar-primary',
  sidebarPrimaryForeground: '--sidebar-primary-foreground',
  sidebarAccent: '--sidebar-accent',
  sidebarAccentForeground: '--sidebar-accent-foreground',
  sidebarBorder: '--sidebar-border',
  sidebarRing: '--sidebar-ring',
  
  // Calendar
  calendarBackground: '--calendar-background',
  calendarEvent: '--calendar-event',
  calendarEventHover: '--calendar-event-hover',
  calendarText: '--calendar-text',
  calendarBorder: '--calendar-border',
  
  // Cards
  card: '--card',
  cardForeground: '--card-foreground',
  cardBorder: '--card-border',
  cardHover: '--card-hover',
  
  // Text
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textMuted: '--text-muted',
  textAccent: '--text-accent',
  
  // Buttons
  buttonPrimary: '--button-primary',
  buttonPrimaryForeground: '--button-primary-foreground',
  buttonSecondary: '--button-secondary',
  buttonSecondaryForeground: '--button-secondary-foreground',
  buttonAccent: '--button-accent',
  buttonAccentForeground: '--button-accent-foreground',
  
  // General
  background: '--background',
  foreground: '--foreground',
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  secondary: '--secondary',
  secondaryForeground: '--secondary-foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  border: '--border',
  input: '--input',
  ring: '--ring',
  destructive: '--destructive',
}

export function AdvancedThemeProvider({ children, customTheme }: AdvancedThemeProviderProps) {
  const { theme, systemTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Apply custom theme colors as CSS variables
  useEffect(() => {
    if (!customTheme || Object.keys(customTheme).length === 0) {
      // Clear any previously set custom variables
      Object.values(CSS_VARIABLE_MAPPINGS).forEach(variable => {
        document.documentElement.style.removeProperty(variable)
      })
      return
    }

    // Apply each custom color as a CSS variable
    Object.entries(customTheme).forEach(([key, value]) => {
      const cssVariable = CSS_VARIABLE_MAPPINGS[key as keyof CustomThemeColors]
      if (cssVariable && value) {
        document.documentElement.style.setProperty(cssVariable, value)
      }
    })

    // Return cleanup function to remove custom variables
    return () => {
      Object.entries(customTheme).forEach(([key]) => {
        const cssVariable = CSS_VARIABLE_MAPPINGS[key as keyof CustomThemeColors]
        if (cssVariable) {
          document.documentElement.style.removeProperty(cssVariable)
        }
      })
    }
  }, [customTheme])

  // Wait for component to mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Apply theme-specific overrides
  useEffect(() => {
    if (!mounted) return

    // Reset all custom variables first
    Object.values(CSS_VARIABLE_MAPPINGS).forEach(variable => {
      document.documentElement.style.removeProperty(variable)
    })

    // Re-apply custom theme if it exists
    if (customTheme && Object.keys(customTheme).length > 0) {
      Object.entries(customTheme).forEach(([key, value]) => {
        const cssVariable = CSS_VARIABLE_MAPPINGS[key as keyof CustomThemeColors]
        if (cssVariable && value) {
          document.documentElement.style.setProperty(cssVariable, value)
        }
      })
    }
  }, [theme, systemTheme, mounted, customTheme])

  return <>{children}</>
}