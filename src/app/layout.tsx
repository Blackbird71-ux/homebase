// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import './apple-theme.css'
import './pages.css'
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

  const showUmami = Boolean(umamiScriptUrl && umamiSiteId)

  return (
    <html
      lang="en"
      className="h-full"
      data-font-size={fontSize}
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
            in sw.js ensures it takes control of this tab immediately.
            
            Also triggers:
            - Idle warm-up: after 3 seconds of page being interactive, sends
              WARM_CACHE message to the SW to pre-cache recipe details + images
            - Periodic Background Sync: registers for daily cache refresh
              (Chrome Android only — silently ignored on other browsers) */}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').then(function(reg) {
              // Idle warm-up: wait 3s then ask SW to warm the cache
              setTimeout(function() {
                if (reg.active) {
                  reg.active.postMessage({ type: 'WARM_CACHE' });
                }
              }, 3000);

              // Periodic Background Sync — daily cache refresh
              // Supported on Chrome Android; silently ignored elsewhere
              if ('periodicSync' in reg) {
                reg.periodicSync.register('homebase-cache-warm', {
                  minInterval: 24 * 60 * 60 * 1000 // once per day
                }).catch(function() {
                  // Periodic sync not supported or permission denied — ignore
                });
              }
            }).catch(function(err) {
              console.error('[SW] Registration failed:', err);
            });
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
