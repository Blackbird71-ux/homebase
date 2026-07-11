import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { AppShell } from '@/components/layout/AppShell'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()
  const isAdmin = session.role === 'admin'

  const [family, dbUser] = await Promise.all([
    prisma.family.findUnique({
      where: { id: session.familyId },
      select: { hideFinanceModule: true, name: true },
    }),
    prisma.user.findUnique({
      where: { id: session.id },
      select: { shareLocation: true, uiPreferences: true },
    }),
  ])

  // Per-user main nav visibility from uiPreferences (href → false hides the item)
  let mainNav: Record<string, boolean> = {}
  if (dbUser?.uiPreferences) {
    try {
      const prefs = JSON.parse(dbUser.uiPreferences)
      if (prefs?.mainNav && typeof prefs.mainNav === 'object') mainNav = prefs.mainNav
    } catch { /* ignore */ }
  }

  return (
    <AppShell isAdmin={isAdmin} hideFinanceModule={!!family?.hideFinanceModule} familyName={family?.name} memberName={session.name} memberRole={session.role} shareLocation={!!dbUser?.shareLocation} mainNav={mainNav}>
      {children}
    </AppShell>
  )
}
