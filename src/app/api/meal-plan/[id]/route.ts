import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
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
