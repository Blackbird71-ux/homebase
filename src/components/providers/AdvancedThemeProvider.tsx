// src/components/providers/AdvancedThemeProvider.tsx
'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { CustomThemeColors } from '@/types'

interface AdvancedThemeProviderProps {
  children: React.ReactNode
  customTheme?: CustomThemeColors | null
}

// CSS variable mappings for custom theme colors
const CSS_VARIABLE_MAPPINGS: Record<keyof CustomThemeColors, string[]> = {
  // Sidebar - map to both --sidebar and --color-sidebar for Tailwind compatibility
  sidebar: ['--sidebar', '--color-sidebar'],
  sidebarForeground: ['--sidebar-foreground', '--color-sidebar-foreground'],
  sidebarPrimary: ['--sidebar-primary', '--color-sidebar-primary'],
  sidebarPrimaryForeground: ['--sidebar-primary-foreground', '--color-sidebar-primary-foreground'],
  sidebarAccent: ['--sidebar-accent', '--color-sidebar-accent'],
  sidebarAccentForeground: ['--sidebar-accent-foreground', '--color-sidebar-accent-foreground'],
  sidebarBorder: ['--sidebar-border', '--color-sidebar-border'],
  sidebarRing: ['--sidebar-ring', '--color-sidebar-ring'],
  
  // Calendar
  calendarBackground: ['--calendar-background'],
  calendarEvent: ['--calendar-event'],
  calendarEventHover: ['--calendar-event-hover'],
  calendarText: ['--calendar-text'],
  calendarBorder: ['--calendar-border'],
  
  // Cards
  card: ['--card', '--color-card'],
  cardForeground: ['--card-foreground', '--color-card-foreground'],
  cardBorder: ['--card-border', '--color-card-border'],
  cardHover: ['--card-hover'],
  
  // Text
  textPrimary: ['--text-primary'],
  textSecondary: ['--text-secondary'],
  textMuted: ['--text-muted'],
  textAccent: ['--text-accent'],
  
  // Buttons
  buttonPrimary: ['--button-primary'],
  buttonPrimaryForeground: ['--button-primary-foreground'],
  buttonSecondary: ['--button-secondary'],
  buttonSecondaryForeground: ['--button-secondary-foreground'],
  buttonAccent: ['--button-accent'],
  buttonAccentForeground: ['--button-accent-foreground'],

  // Pills & navigation tabs
  pillInactiveBg: ['--pill-inactive-bg'],
  pillInactiveBorder: ['--pill-inactive-border'],
  pillInactiveFg: ['--pill-inactive-fg'],
  
  // General - map to both base variables and --color-* for Tailwind
  background: ['--background', '--color-background'],
  foreground: ['--foreground', '--color-foreground'],
  primary: ['--primary', '--color-primary'],
  primaryForeground: ['--primary-foreground', '--color-primary-foreground'],
  secondary: ['--secondary', '--color-secondary'],
  secondaryForeground: ['--secondary-foreground', '--color-secondary-foreground'],
  accent: ['--accent', '--color-accent'],
  accentForeground: ['--accent-foreground', '--color-accent-foreground'],
  muted: ['--muted', '--color-muted'],
  mutedForeground: ['--muted-foreground', '--color-muted-foreground'],
  border: ['--border', '--color-border'],
  input: ['--input', '--color-input'],
  ring: ['--ring', '--color-ring'],
  destructive: ['--destructive', '--color-destructive'],
}

/**
 * Build a <style> block that sets all custom theme variables at :root with
 * !important so they win over Tailwind v4's @theme inline resolved values,
 * which are static at build-time and cannot be overridden via
 * documentElement.style.setProperty alone.
 */
function buildStyleContent(customTheme: CustomThemeColors | null | undefined): string {
  if (!customTheme || Object.keys(customTheme).length === 0) return ''

  const declarations = Object.entries(customTheme)
    .filter(([, value]) => value && value.trim() !== '')
    .flatMap(([key, value]) => {
      const cssVars = CSS_VARIABLE_MAPPINGS[key as keyof CustomThemeColors]
      if (!cssVars) return []
      return cssVars.map(cssVar => `  ${cssVar}: ${value} !important;`)
    })
    .filter(Boolean)
    .join('\n')

  if (!declarations) return ''
  
  // Set variables for :root and all theme classes to ensure they work in all theme modes
  // List all theme classes from ThemeProvider
  const themeClasses = [
    ':root', // default/light theme
    '.dark',
    '.midnight',
    '.glass-dark',
    '.modern',
    '.aurora',
    '.apple-grey',
    '.apple-pro',
    '.apple-aqua',
    '.apple-graphite',
    '.apple-sunset',
    '.apple-midnight',
    '.apple-forest',
    '.sunset',
    '.ocean',
    '.forest',
    '.paper',
    '.harbour',
    '.plum'
  ]
  
  const themeBlocks = themeClasses.map(theme => `${theme} {\n${declarations}\n}`).join('\n\n')
  
  return themeBlocks
}

// Stable no-op subscribe for useSyncExternalStore (module-level so it never
// resubscribes across renders). Detects whether we're on the client without a
// setState-in-effect, avoiding the SSR/hydration mismatch the old `mounted`
// flag guarded against.
const emptySubscribe = () => () => {}

export function AdvancedThemeProvider({ children, customTheme }: AdvancedThemeProviderProps) {
  // `mounted` is false during SSR, true on the client.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  // Derived CSS is computed during render (pure), not via effect-set state.
  // Output depends only on customTheme — the active theme/systemTheme don't
  // change the generated variable block (it targets every theme class).
  const styleContent = useMemo(
    () => buildStyleContent(customTheme),
    [customTheme]
  )

  return (
    <>
      {mounted && styleContent && (
        <style id="advanced-theme-vars" dangerouslySetInnerHTML={{ __html: styleContent }} />
      )}
      {children}
    </>
  )
}