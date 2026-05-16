import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { spawnDueDrafts } from '@/lib/finance-draft-spawn-service'
import type { SessionUser } from '@/types'

// POST /api/admin/spawn-now
// Manually triggers the draft-spawn worker for all families.
// Requires an admin session. Useful for testing without waiting for the cron.
export async function POST() {
  const user = await requireSession()
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const families = await prisma.family.findMany({
    select: { id: true, timezone: true },
  })

  if (families.length === 0) {
    return NextResponse.json({ message: 'No families found', results: [] })
  }

  const asOf = new Date()
  const results = []

  for (const family of families) {
    const systemUser: SessionUser = {
      id: 'system',
      name: 'System (manual trigger)',
      email: '',
      role: 'admin',
      familyId: family.id,
      timezone: family.timezone ?? 'Australia/Brisbane',
      weekStartsOn: 1,
    }

    try {
      const report = await spawnDueDrafts(systemUser, family.id, asOf)
      const disabled = report.results.filter(r => r.disabledDueToMissingGlAccount).length
      results.push({
        familyId: family.id,
        templatesConsidered: report.templatesConsidered,
        totalSpawned: report.totalSpawned,
        disabled,
        ok: true,
      })
    } catch (err) {
      results.push({
        familyId: family.id,
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return NextResponse.json({ asOf, results })
}
