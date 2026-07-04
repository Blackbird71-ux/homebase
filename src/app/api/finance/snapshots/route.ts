// src/app/api/finance/snapshots/route.ts
// GET — list finance snapshots for the current family

import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'

async function _GET(request: NextRequest) {
  try {
    const session = await auth()
    const user = session?.user as SessionUser | undefined
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year') // optional filter

    const where: Record<string, unknown> = { familyId: user.familyId }
    if (year) where.financialYear = year

    const snapshots = await prisma.financeSnapshot.findMany({
      where,
      orderBy: [{ snapshotYear: 'desc' }, { snapshotMonth: 'desc' }],
      select: {
        id: true,
        financialYear: true,
        snapshotMonth: true,
        snapshotYear: true,
        periodLabel: true,
        monthsComplete: true,
        createdAt: true,
        _count: { select: { emails: true } },
      },
    })

    return NextResponse.json(snapshots)
  } catch (err) {
    // P11-A1: log the detail server-side but never return the raw error to the
    // client — align with the app's leak-nothing posture (a Prisma/DB string
    // could otherwise surface to a logged-in user).
    console.error('[snapshots] Error:', err instanceof Error ? err.message : 'Unknown error')
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export const GET = withRouteErrors(_GET)
