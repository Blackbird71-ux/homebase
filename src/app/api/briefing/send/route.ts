import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendDailyBriefings } from '@/lib/daily-briefing'

// Manual trigger for the daily briefing push (the 7am cron in scheduler.ts
// is the normal path). Mirrors /api/reminders/process: admin session OR a
// valid CRON_SECRET header.
async function _POST(req: Request) {
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
    const notified = await sendDailyBriefings()
    return NextResponse.json({
      success: true,
      notified,
      message: notified === 0 ? 'No briefings to send (no subscribers, or already sent today)' : `Briefing sent to ${notified} user${notified !== 1 ? 's' : ''}`,
    })
  } catch (err) {
    console.error('[api/briefing/send]', err)
    return NextResponse.json({ error: 'Failed to send briefings' }, { status: 500 })
  }
}

export const POST = withRouteErrors(_POST)
