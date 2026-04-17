// src/components/providers/ThemeProvider.tsx
'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      themes={['light', 'dark', 'system', 'modern', 'midnight', 'apple-grey', 'glass-dark']}
    >
      {children}
    </NextThemesProvider>
  )
}
