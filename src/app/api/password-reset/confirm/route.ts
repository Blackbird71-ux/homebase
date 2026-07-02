import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPasswordResetToken } from '@/lib/password-reset-token'
import bcrypt from 'bcryptjs'
import { enforceIpRateLimit } from '@/lib/rate-limit'

export async function POST(req: Request) {
  const limited = enforceIpRateLimit(req, 'password-reset-confirm', 10, 15 * 60 * 1000)
  if (limited) return limited

  try {
    const { token, password } = await req.json()

    if (!token || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const payload = verifyPasswordResetToken(token)
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired reset link. Please request a new one.' },
        { status: 400 }
      )
    }

    const hashed = await bcrypt.hash(password, 12)
    await prisma.user.update({
      where: { id: payload.userId },
      data: { password: hashed },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[password-reset/confirm]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
