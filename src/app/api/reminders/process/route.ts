import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { processAllReminders } from '@/lib/reminders'

async function _POST(req: Request) {
  // Allow admin session OR a valid CRON_SECRET header
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = req.headers.get('x-cron-secret')

  const hasValidSecret = cronSecret && headerSecret === cronSecret
  if (!hasValidSecret) {
    const session = await auth()
    if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await processAllReminders()
    const total = result.chores + result.events + result.documents
    return NextResponse.json({
      success: true,
      sent: result,
      message: total === 0 ? 'No reminders to send' : `Sent ${total} reminder email${total !== 1 ? 's' : ''}`,
    })
  } catch (err) {
    console.error('[api/reminders/process]', err)
    return NextResponse.json({ error: 'Failed to process reminders' }, { status: 500 })
  }
}

export const POST = withRouteErrors(_POST)
