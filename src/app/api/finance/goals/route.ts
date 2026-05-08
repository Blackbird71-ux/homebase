import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await requireSession()
  const goals = await prisma.financeSavingsGoal.findMany({
    where: { familyId: session.familyId },
    include: { account: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(goals)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { name, targetAmount, currentAmount, targetDate, accountId, color, icon } = json

  if (!name || !targetAmount) {
    return NextResponse.json({ error: 'Name and target amount are required' }, { status: 400 })
  }

  const goal = await prisma.financeSavingsGoal.create({
    data: {
      name, targetAmount: parseFloat(targetAmount),
      currentAmount: currentAmount ? parseFloat(currentAmount) : 0,
      targetDate: targetDate ? new Date(targetDate) : null,
      accountId: accountId ?? null, color: color ?? null, icon: icon ?? null,
      familyId: session.familyId,
    },
    include: { account: { select: { id: true, name: true } } },
  })

  return NextResponse.json(goal, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, name, targetAmount, currentAmount, targetDate, accountId, color, icon, isComplete } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeSavingsGoal.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
  }

  const goal = await prisma.financeSavingsGoal.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(targetAmount !== undefined && { targetAmount }),
      ...(currentAmount !== undefined && { currentAmount }),
      ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
      ...(accountId !== undefined && { accountId }),
      ...(color !== undefined && { color }),
      ...(icon !== undefined && { icon }),
      ...(isComplete !== undefined && { isComplete }),
    },
    include: { account: { select: { id: true, name: true } } },
  })

  return NextResponse.json(goal)
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeSavingsGoal.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
  }

  await prisma.financeSavingsGoal.delete({ where: { id } })
  return NextResponse.json({ success: true })
}