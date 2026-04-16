import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import type { SessionUser } from '@/types'

export async function requireSession(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  return session.user as unknown as SessionUser
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSession()
  if (user.role !== 'admin') redirect('/home')
  return user
}
