import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireSession } from '@/lib/auth-helpers'
import { getUnlockCookieName } from '@/lib/secure-unlock'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireSession()
  const { id } = await params

  const cookieName = getUnlockCookieName('note', id)
  const cookieStore = await cookies()

  // Clear the unlock cookie
  cookieStore.set(cookieName, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })

  return NextResponse.json({ success: true, message: 'Note locked' })
}
