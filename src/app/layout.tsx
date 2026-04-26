// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Homebase',
  description: 'Your family hub',
  manifest: '/manifest.webmanifest',
  other: {
    'theme-color': '#000000',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'Homebase',
  },
}

const fontSizeClassMap: Record<string, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let fontSize = 'base'
  let umamiScriptUrl: string | null = null
  let umamiSiteId: string | null = null

  try {
    const session = await auth()
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id as string },
        select: {
          fontSize: true,
          family: {
            select: {
              umamiScriptUrl: true,
              umamiSiteId: true,
            },
          },
        },
      })
      if (user?.fontSize) fontSize = user.fontSize
      if (user?.family?.umamiScriptUrl) umamiScriptUrl = user.family.umamiScriptUrl
      if (user?.family?.umamiSiteId) umamiSiteId = user.family.umamiSiteId
    }
  } catch (err) {
    console.error('[layout] Failed to read user data:', err)
  }

  const fontSizeClass = fontSizeClassMap[fontSize] ?? 'text-base'
  const showUmami = Boolean(umamiScriptUrl && umamiSiteId)

  return (
    <html lang="en" className={`h-full ${fontSizeClass}`} suppressHydrationWarning>
      <body className={`${inter.className} h-full bg-background text-foreground overflow-hidden`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        {showUmami && (
          <Script
            src={umamiScriptUrl!}
            data-website-id={umamiSiteId!}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  )
}
