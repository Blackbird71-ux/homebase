import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getUnlockCookieName } from '@/lib/secure-unlock'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const cookieName = getUnlockCookieName('document', id)
  const cookieStore = await cookies()

  // Clear the unlock cookie
  cookieStore.set(cookieName, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })

  return NextResponse.json({ success: true, message: 'Document locked' })
}
