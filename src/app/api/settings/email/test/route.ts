import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { sendEmail } from '@/lib/email'

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only admins can test email
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { to } = body

    if (!to) {
      return NextResponse.json({ error: 'Recipient email is required' }, { status: 400 })
    }

    const result = await sendEmail({
      to,
      subject: 'HomeBase - Test Email',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Test Email</h2>
          <p>This is a test email from your HomeBase family management system.</p>
          <p>If you received this, your email configuration is working correctly!</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">HomeBase Family Management</p>
        </div>
      `,
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send test email' },
        { status: 500 }
      )
    }

    return NextResponse.json({ message: 'Test email sent successfully!' })
  } catch (err) {
    console.error('[email-test] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
