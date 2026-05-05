import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { verifyPin, generateUnlockToken, getUnlockCookieName } from '@/lib/secure-unlock'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await _req.json()
  const { pin } = body

  if (!pin || typeof pin !== 'string') {
    return NextResponse.json(
      { error: 'PIN is required' },
      { status: 400 }
    )
  }

  // Find the document
  const document = await prisma.document.findFirst({
    where: {
      id,
      familyId: user.familyId,
    },
    select: {
      id: true,
      pinHash: true,
    },
  })

  if (!document) {
    return NextResponse.json(
      { error: 'Document not found' },
      { status: 404 }
    )
  }

  // Check if document is PIN-protected
  if (!document.pinHash) {
    return NextResponse.json(
      { error: 'Document is not PIN protected' },
      { status: 400 }
    )
  }

  // Verify the PIN
  const isValid = await verifyPin(pin, document.pinHash)
  if (!isValid) {
    return NextResponse.json(
      { error: 'Incorrect PIN' },
      { status: 403 }
    )
  }

  // Generate unlock token and set cookie
  const token = generateUnlockToken('document', id)
  const cookieName = getUnlockCookieName('document', id)
  const cookieStore = await cookies()
  
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60, // 15 minutes
    path: '/',
  })

  return NextResponse.json({ success: true, message: 'Document unlocked' })
}
