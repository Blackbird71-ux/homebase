import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _POST() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Calculate date 3 months ago
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

  try {
    // Find all entries older than 3 months for this family
    const oldEntries = await prisma.auditLog.findMany({
      where: {
        familyId: user.familyId,
        createdAt: { lt: threeMonthsAgo },
      },
      orderBy: { createdAt: 'asc' },
    })

    if (oldEntries.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No entries older than 3 months to backup.',
        count: 0,
        entries: [],
      })
    }

    // Delete the old entries
    await prisma.auditLog.deleteMany({
      where: {
        familyId: user.familyId,
        createdAt: { lt: threeMonthsAgo },
      },
    })

    return NextResponse.json({
      success: true,
      message: `Backed up and removed ${oldEntries.length} log entries.`,
      count: oldEntries.length,
      entries: oldEntries.map((e) => ({
        id: e.id,
        userId: e.userId,
        userName: e.userName,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId,
        summary: e.summary,
        details: e.details,
        createdAt: e.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[audit-log-backup] Failed:', err)
    return NextResponse.json(
      { error: 'Failed to backup audit log' },
      { status: 500 }
    )
  }
}

export const POST = withRouteErrors(_POST)
