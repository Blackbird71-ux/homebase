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

  const family = await prisma.family.findUnique({
    where: { id: session.familyId },
    select: { hideFinanceModule: true },
  })

  return (
    <AppShell isAdmin={isAdmin} hideFinanceModule={!!family?.hideFinanceModule}>
      {children}
    </AppShell>
  )
}
