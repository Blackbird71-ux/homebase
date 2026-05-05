import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPinResetToken } from '@/lib/pin-reset-token'
import { hashPin } from '@/lib/secure-unlock'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { token, newPin } = body

    if (!token || !newPin) {
      return NextResponse.json(
        { error: 'Missing required fields: token, newPin' },
        { status: 400 }
      )
    }

    // Validate PIN format
    if (typeof newPin !== 'string' || newPin.length < 4 || newPin.length > 10) {
      return NextResponse.json(
        { error: 'PIN must be between 4 and 10 characters' },
        { status: 400 }
      )
    }

    // Verify token
    const payload = verifyPinResetToken(token)
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token. Please request a new one.' },
        { status: 400 }
      )
    }

    // Hash the new PIN
    const pinHash = await hashPin(newPin)

    // Update the entity's pinHash
    if (payload.entityType === 'note') {
      await prisma.note.update({
        where: { id: payload.entityId },
        data: { pinHash },
      })
    } else if (payload.entityType === 'document') {
      await prisma.document.update({
        where: { id: payload.entityId },
        data: { pinHash },
      })
    } else if (payload.entityType === 'contact') {
      await prisma.householdContact.update({
        where: { id: payload.entityId },
        data: { pinHash },
      })
    }

    return NextResponse.json({ success: true, message: 'PIN has been reset successfully.' })
  } catch (err) {
    console.error('[pin-reset-confirm] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
