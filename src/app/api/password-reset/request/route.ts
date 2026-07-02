import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generatePasswordResetToken } from '@/lib/password-reset-token'
import { sendEmail } from '@/lib/email'
import { passwordResetHtml } from '@/lib/email-templates'
import { enforceIpRateLimit } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const limited = enforceIpRateLimit(req, 'password-reset-request', 5, 15 * 60 * 1000)
  if (limited) return limited

  try {
    const { email } = await req.json()
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Always return success to prevent email enumeration
    const genericResponse = NextResponse.json({ success: true })

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true, name: true },
    })

    if (!user) return genericResponse

    const token = generatePasswordResetToken(user.id)
    const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3300'
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`

    const result = await sendEmail({
      to: user.email,
      subject: 'HomeBase — Reset your password',
      html: passwordResetHtml(user.name, resetUrl),
    })

    if (!result.success) {
      console.error('[password-reset] Failed to send email:', result.error)
    }

    return genericResponse
  } catch (err) {
    console.error('[password-reset/request]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
