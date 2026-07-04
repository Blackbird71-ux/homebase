import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()

  // Verify ownership
  const existing = await prisma.budgetPlannerItem.findUnique({
    where: { id },
  })

  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updateData: Record<string, unknown> = {}
  if (body.amount !== undefined) updateData.amount = body.amount
  if (body.frequency !== undefined) updateData.frequency = body.frequency
  if (body.category !== undefined) updateData.category = body.category
  if (body.subcategory !== undefined) updateData.subcategory = body.subcategory
  if (body.type !== undefined) updateData.type = body.type
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder

  const updated = await prisma.budgetPlannerItem.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json(updated)
}

async function _DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  // Verify ownership
  const existing = await prisma.budgetPlannerItem.findUnique({
    where: { id },
  })

  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.budgetPlannerItem.delete({ where: { id } })

  return NextResponse.json({ success: true })
}

export const PUT = withRouteErrors(_PUT)
export const DELETE = withRouteErrors(_DELETE)
