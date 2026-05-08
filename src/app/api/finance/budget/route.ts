import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await requireSession()
  const budgets = await prisma.financeBudget.findMany({
    where: { familyId: session.familyId },
    include: { category: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(budgets)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { name, amount, categoryId, period, startDate, endDate, rollover, alertThreshold } = json

  if (!name || !amount || !period) {
    return NextResponse.json({ error: 'Name, amount, and period are required' }, { status: 400 })
  }

  const budget = await prisma.financeBudget.create({
    data: {
      name, amount: parseFloat(amount), categoryId: categoryId ?? null,
      period, startDate: new Date(startDate ?? new Date()),
      endDate: new Date(endDate ?? new Date(Date.now() + 365 * 86400000)),
      rollover: rollover ?? false, alertThreshold: alertThreshold ?? 80,
      familyId: session.familyId,
    },
    include: { category: true },
  })

  return NextResponse.json(budget, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, name, amount, categoryId, period, startDate, endDate, rollover, alertThreshold } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeBudget.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Budget not found' }, { status: 404 })
  }

  const budget = await prisma.financeBudget.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(amount !== undefined && { amount }),
      ...(categoryId !== undefined && { categoryId }),
      ...(period !== undefined && { period }),
      ...(startDate !== undefined && { startDate: new Date(startDate) }),
      ...(endDate !== undefined && { endDate: new Date(endDate) }),
      ...(rollover !== undefined && { rollover }),
      ...(alertThreshold !== undefined && { alertThreshold }),
    },
    include: { category: true },
  })

  return NextResponse.json(budget)
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeBudget.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Budget not found' }, { status: 404 })
  }

  await prisma.financeBudget.delete({ where: { id } })
  return NextResponse.json({ success: true })
}