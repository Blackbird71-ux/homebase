import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generatePinResetToken } from '@/lib/pin-reset-token'
import { sendEmail } from '@/lib/email'
import { enforceIpRateLimit } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const limited = enforceIpRateLimit(req, 'pin-reset-request', 5, 15 * 60 * 1000)
  if (limited) return limited

  try {
    const body = await req.json()
    const { entityType, entityId, userEmail } = body

    if (!entityType || !entityId || !userEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: entityType, entityId, userEmail' },
        { status: 400 }
      )
    }

    if (!['note', 'document', 'contact'].includes(entityType)) {
      return NextResponse.json(
        { error: 'Invalid entityType. Must be note, document, or contact' },
        { status: 400 }
      )
    }

    // Find user by email (stored lowercased — see register route)
    const user = await prisma.user.findUnique({
      where: { email: String(userEmail).toLowerCase().trim() },
      select: { id: true, email: true, name: true, familyId: true },
    })

    if (!user) {
      // Always return success to prevent email enumeration
      return NextResponse.json({ success: true, message: 'If the email matches, a reset link has been sent.' })
    }

    // Verify the entity belongs to the user's family
    let entityBelongsToFamily = false
    if (entityType === 'note') {
      const note = await prisma.note.findUnique({ where: { id: entityId }, select: { familyId: true } })
      entityBelongsToFamily = note?.familyId === user.familyId
    } else if (entityType === 'document') {
      const doc = await prisma.document.findUnique({ where: { id: entityId }, select: { familyId: true } })
      entityBelongsToFamily = doc?.familyId === user.familyId
    } else if (entityType === 'contact') {
      const contact = await prisma.householdContact.findUnique({ where: { id: entityId }, select: { familyId: true } })
      entityBelongsToFamily = contact?.familyId === user.familyId
    }

    if (!entityBelongsToFamily) {
      return NextResponse.json({ success: true, message: 'If the email matches, a reset link has been sent.' })
    }

    // Generate token
    const token = generatePinResetToken(user.id, entityType as 'note' | 'document' | 'contact', entityId)

    // Build reset URL
    const baseUrl = process.env.AUTH_URL || 'http://localhost:3300'
    const resetUrl = `${baseUrl}/reset-pin?token=${encodeURIComponent(token)}`

    // Send email
    const entityLabel = entityType === 'note' ? 'Note' : entityType === 'document' ? 'Document' : 'Contact'
    const result = await sendEmail({
      to: user.email,
      subject: `HomeBase - PIN Reset Request for ${entityLabel}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>HomeBase PIN Reset</h2>
          <p>Hi ${user.name},</p>
          <p>A PIN reset was requested for a ${entityLabel.toLowerCase()} in your HomeBase family account.</p>
          <p>Click the link below to reset your PIN. This link expires in 15 minutes.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Reset PIN
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">HomeBase Family Management</p>
        </div>
      `,
    })

    if (!result.success) {
      console.error('[pin-reset] Failed to send email:', result.error)
      return NextResponse.json(
        { error: 'Failed to send reset email. Email may not be configured.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, message: 'If the email matches, a reset link has been sent.' })
  } catch (err) {
    console.error('[pin-reset] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
