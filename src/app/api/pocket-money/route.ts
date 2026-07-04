import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getPocketMoneySummary } from '@/lib/pocket-money'
import { DEFAULT_TIMEZONE } from '@/lib/timezone'

async function _GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const summary = await getPocketMoneySummary(user.familyId, user.timezone ?? DEFAULT_TIMEZONE)
  return NextResponse.json(summary)
}

export const GET = withRouteErrors(_GET)
