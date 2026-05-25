// src/app/api/finance/snapshots/[id]/route.ts
// GET — retrieve a single finance snapshot with full report data

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const user = session?.user as SessionUser | undefined
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    const snapshot = await prisma.financeSnapshot.findFirst({
      where: { id, familyId: user.familyId },
      include: {
        _count: { select: { emails: true } },
      },
    })

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
    }

    // Parse the report JSON for the client
    const report = JSON.parse(snapshot.reportJson)

    return NextResponse.json({
      id: snapshot.id,
      financialYear: snapshot.financialYear,
      snapshotMonth: snapshot.snapshotMonth,
      snapshotYear: snapshot.snapshotYear,
      periodLabel: snapshot.periodLabel,
      monthsComplete: snapshot.monthsComplete,
      createdAt: snapshot.createdAt,
      emailCount: snapshot._count.emails,
      report,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[snapshots/[id]] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
