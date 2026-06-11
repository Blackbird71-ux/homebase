import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/email'
import { securityAlertHtml } from '@/lib/email-templates'

const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MINUTES = 15

// Email the admin user once per rate-limit window. Never throws — a mail
// failure must not change the endpoint's response.
async function notifyAdmin(ip: string) {
  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'admin' },
      select: { email: true },
    })
    if (!admin?.email) return
    const result = await sendEmail({
      to: admin.email,
      subject: 'HomeBase — Security alert: password reset attempts blocked',
      html: securityAlertHtml({ ip, attempts: RATE_LIMIT_MAX, windowMinutes: RATE_LIMIT_WINDOW_MINUTES }),
    })
    if (!result.success) {
      console.error(`[admin-reset-password] Failed to send security alert email: ${result.error}`)
    }
  } catch (err) {
    console.error('[admin-reset-password] Security alert email error:', err)
  }
}

// Break-glass password reset, guarded by the ADMIN_RESET_TOKEN secret.
// Every attempt is rate-limited per IP and logged (logs are visible in the
// admin log viewer and docker logs).
export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  const limit = checkRateLimit(`admin-reset-password:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MINUTES * 60 * 1000)
  if (!limit.ok) {
    console.warn(`[admin-reset-password] Rate limit exceeded from ${ip}`)
    if (limit.firstExceedance) {
      await notifyAdmin(ip)
    }
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const token = req.headers.get('x-reset-token')
  if (!token || token !== process.env.ADMIN_RESET_TOKEN) {
    console.warn(`[admin-reset-password] Rejected attempt with invalid token from ${ip}`)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, password } = await req.json()
  if (!email || !password || password.length < 8) {
    return NextResponse.json({ error: 'email and password (min 8 chars) required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    console.warn(`[admin-reset-password] Valid token but unknown user "${email}" from ${ip}`)
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const hashed = await bcrypt.hash(password, 12)
  await prisma.user.update({ where: { email }, data: { password: hashed } })

  console.log(`[admin-reset-password] Password reset for ${email} from ${ip}`)
  return NextResponse.json({ ok: true, message: `Password reset for ${email}` })
}
