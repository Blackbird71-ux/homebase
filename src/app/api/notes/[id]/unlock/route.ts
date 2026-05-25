import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { verifyPin, generateUnlockToken, getUnlockCookieName } from '@/lib/secure-unlock'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await _req.json()
  const { pin } = body

  if (!pin || typeof pin !== 'string') {
    return NextResponse.json(
      { error: 'PIN is required' },
      { status: 400 }
    )
  }

  // Find the note
  const note = await prisma.note.findFirst({
    where: {
      id,
      familyId: user.familyId,
    },
    select: {
      id: true,
      pinHash: true,
      isPrivate: true,
      createdBy: true,
    },
  })

  if (!note) {
    return NextResponse.json(
      { error: 'Note not found' },
      { status: 404 }
    )
  }

  // Block access to other users' private notes
  if (note.isPrivate && note.createdBy !== user.id) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  // Check if note is PIN-protected
  if (!note.pinHash) {
    return NextResponse.json(
      { error: 'Note is not PIN protected' },
      { status: 400 }
    )
  }

  // Verify the PIN
  const isValid = await verifyPin(pin, note.pinHash)
  if (!isValid) {
    return NextResponse.json(
      { error: 'Incorrect PIN' },
      { status: 403 }
    )
  }

  // Generate unlock token and set cookie
  const token = generateUnlockToken('note', id)
  const cookieName = getUnlockCookieName('note', id)
  const cookieStore = await cookies()
  
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60, // 15 minutes
    path: '/',
  })

  return NextResponse.json({ success: true, message: 'Note unlocked' })
}
