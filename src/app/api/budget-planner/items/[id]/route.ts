import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession()
  const { id } = await params
  const body = await req.json()

  // Verify ownership
  const existing = await prisma.budgetPlannerItem.findUnique({
    where: { id },
  })

  if (!existing || existing.userId !== session.id) {
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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession()
  const { id } = await params

  // Verify ownership
  const existing = await prisma.budgetPlannerItem.findUnique({
    where: { id },
  })

  if (!existing || existing.userId !== session.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.budgetPlannerItem.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
