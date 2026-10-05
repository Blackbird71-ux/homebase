import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { withRouteErrors } from '@/lib/route-errors'
import { getTodayData } from '@/lib/today-data'
import type { SessionUser } from '@/types'

async function _GET(req: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scope = new URL(req.url).searchParams.get('scope') === 'family' ? 'family' : 'mine'
  const data = await getTodayData({
    familyId: user.familyId,
    userId: user.id,
    timezone: user.timezone ?? 'UTC',
    scope,
  })
  return NextResponse.json(data)
}

export const GET = withRouteErrors(_GET)
