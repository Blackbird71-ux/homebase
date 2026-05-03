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
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': 'Homebase',
    'viewport-fit': 'cover',
  },
}

const fontSizeClassMap: Record<string, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let fontSize = 'base'
  let lineHeight = 'normal'
  let fontWeight = 'normal'
  let umamiScriptUrl: string | null = null
  let umamiSiteId: string | null = null

  try {
    const session = await auth()
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id as string },
        select: {
          fontSize: true,
          lineHeight: true,
          fontWeight: true,
          family: {
            select: {
              umamiScriptUrl: true,
              umamiSiteId: true,
            },
          },
        },
      })
      if (user?.fontSize) fontSize = user.fontSize
      if (user?.lineHeight) lineHeight = user.lineHeight
      if (user?.fontWeight) fontWeight = user.fontWeight
      if (user?.family?.umamiScriptUrl) umamiScriptUrl = user.family.umamiScriptUrl
      if (user?.family?.umamiSiteId) umamiSiteId = user.family.umamiSiteId
    }
  } catch (err) {
    console.error('[layout] Failed to read user data:', err)
  }

  const fontSizeClass = fontSizeClassMap[fontSize] ?? 'text-base'
  const showUmami = Boolean(umamiScriptUrl && umamiSiteId)

  return (
    <html
      lang="en"
      className={`h-full ${fontSizeClass}`}
      data-line-height={lineHeight}
      data-font-weight={fontWeight}
      suppressHydrationWarning
    >
      <body className={`${inter.className} h-full bg-background text-foreground overflow-hidden`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        {/* Register service worker as early as possible after page is interactive.
            afterInteractive fires before React useEffect, reducing the window
            where navigations can bypass the SW. skipWaiting + clients.claim()
            in sw.js ensures it takes control of this tab immediately. */}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(function(err) {
              console.error('[SW] Registration failed:', err)
            })
          }
        `}</Script>
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
