import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth-helpers'
import { AppShell } from '@/components/layout/AppShell'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()
  const isAdmin = session.role === 'admin'

  return <AppShell isAdmin={isAdmin}>{children}</AppShell>
}
