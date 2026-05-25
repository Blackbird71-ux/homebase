// src/app/api/finance/snapshots/route.ts
// GET — list finance snapshots for the current family

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
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
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[snapshots] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
