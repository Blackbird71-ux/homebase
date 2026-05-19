import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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

export async function requireSystemAdmin(): Promise<SessionUser | NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSystemAdmin: true },
  })
  if (!dbUser?.isSystemAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return session.user as unknown as SessionUser
}
