// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Homebase',
  description: 'Your family hub',
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
  // Read font size from DB for server-side application
  // Falls back to 'base' if not logged in
  let fontSize = 'base'
  try {
    const session = await auth()
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id as string },
        select: { fontSize: true },
      })
      if (user?.fontSize) fontSize = user.fontSize
    }
  } catch {
    // Not logged in or DB error — use default
  }

  const fontSizeClass = fontSizeClassMap[fontSize] ?? 'text-base'

  return (
    <html lang="en" className={`h-full ${fontSizeClass}`} suppressHydrationWarning>
      <body className={`${inter.className} h-full bg-background text-foreground overflow-hidden`}>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
