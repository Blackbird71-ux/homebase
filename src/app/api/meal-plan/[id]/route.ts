import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'

async function _DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await prisma.mealPlan.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.mealPlan.delete({ where: { id } })

  void createAuditLog(
    user,
    'delete',
    'mealPlan',
    id,
    `Removed ${existing.mealType} meal on ${existing.date.toISOString().split('T')[0]}`,
    { mealPlan: { date: existing.date.toISOString(), mealType: existing.mealType } }
  )

  return NextResponse.json({ success: true })
}

export const DELETE = withRouteErrors(_DELETE)
