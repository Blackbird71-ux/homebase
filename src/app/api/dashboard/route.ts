import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getDashboardData } from '@/lib/dashboard-data'

async function _GET(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const scopeParam = searchParams.get('scope')
  const scope = scopeParam === '14' ? 14 : scopeParam === '30' ? 30 : 7

  // Ungated: the client refetches after Customise, so newly enabled cards need data too
  const data = await getDashboardData({
    familyId: user.familyId,
    userId: user.id,
    timezone: user.timezone ?? 'UTC',
    scope,
    dashboardShoppingListId: searchParams.get('dashboardShoppingListId'),
    dashboardTodoListId: searchParams.get('dashboardTodoListId'),
  })

  return NextResponse.json(data)
}

export const GET = withRouteErrors(_GET)
