import { requireSession } from '@/lib/auth-helpers'
import FinanceLayoutClient from './FinanceLayoutClient'

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  return (
    <FinanceLayoutClient isAdmin={session.role === 'admin'}>
      {children}
    </FinanceLayoutClient>
  )
}
