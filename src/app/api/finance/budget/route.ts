import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { addYears } from 'date-fns'

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const entityId = searchParams.get('entityId') // optional filter

  const where: any = { familyId: session.familyId }
  if (entityId === 'null' || entityId === '') {
    where.entityId = null
  } else if (entityId) {
    where.entityId = entityId
  }

  const budgets = await prisma.financeBudget.findMany({
    where,
    include: {
      category: true,
      bill: { select: { id: true, name: true, amount: true, frequency: true } },
      entity: { select: { id: true, name: true, color: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(budgets)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { name, amount, categoryId, period, rollover, alertThreshold, billId, isIncludedInPlanner, entityId } = json

  if (!name || !amount || !period) {
    return NextResponse.json({ error: 'Name, amount, and period are required' }, { status: 400 })
  }

  const startDate = new Date(new Date().getFullYear(), 0, 1)
  const endDate = addYears(startDate, 10)

  const budget = await prisma.financeBudget.create({
    data: {
      name,
      amount: parseFloat(amount),
      categoryId: categoryId ?? null,
      period,
      startDate,
      endDate,
      rollover: rollover ?? false,
      alertThreshold: alertThreshold ?? 80,
      billId: billId ?? null,
      isIncludedInPlanner: isIncludedInPlanner ?? true,
      entityId: entityId ?? null,
      familyId: session.familyId,
    },
    include: {
      category: true,
      bill: { select: { id: true, name: true, amount: true, frequency: true } },
      entity: { select: { id: true, name: true, color: true } },
    },
  })

  return NextResponse.json(budget, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, name, amount, categoryId, period, rollover, alertThreshold, billId, isIncludedInPlanner, entityId } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeBudget.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Budget not found' }, { status: 404 })

  const budget = await prisma.financeBudget.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(amount !== undefined && { amount: parseFloat(amount) }),
      ...(categoryId !== undefined && { categoryId: categoryId || null }),
      ...(period !== undefined && { period }),
      ...(rollover !== undefined && { rollover }),
      ...(alertThreshold !== undefined && { alertThreshold }),
      ...(billId !== undefined && { billId: billId || null }),
      ...(isIncludedInPlanner !== undefined && { isIncludedInPlanner }),
      ...(entityId !== undefined && { entityId: entityId || null }),
    },
    include: {
      category: true,
      bill: { select: { id: true, name: true, amount: true, frequency: true } },
      entity: { select: { id: true, name: true, color: true } },
    },
  })

  return NextResponse.json(budget)
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeBudget.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Budget not found' }, { status: 404 })

  await prisma.financeBudget.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export async function PATCH(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()

  if (json.upsertFromBill) {
    const { billId, name, amount, categoryId, period, entityId } = json
    if (!billId) return NextResponse.json({ error: 'billId required' }, { status: 400 })

    const existing = await prisma.financeBudget.findFirst({ where: { billId, familyId: session.familyId } })
    const startDate = new Date(new Date().getFullYear(), 0, 1)
    const endDate = addYears(startDate, 10)

    if (existing) {
      const updated = await prisma.financeBudget.update({
        where: { id: existing.id },
        data: {
          name, amount: parseFloat(amount),
          categoryId: categoryId || null,
          period,
          isIncludedInPlanner: true,
          ...(entityId !== undefined && { entityId: entityId || null }),
        },
        include: {
          category: true,
          bill: { select: { id: true, name: true, amount: true, frequency: true } },
          entity: { select: { id: true, name: true, color: true } },
        },
      })
      return NextResponse.json(updated)
    }

    const created = await prisma.financeBudget.create({
      data: {
        name, amount: parseFloat(amount),
        categoryId: categoryId || null,
        period, startDate, endDate,
        rollover: false, alertThreshold: 80,
        billId, isIncludedInPlanner: true,
        entityId: entityId ?? null,
        familyId: session.familyId,
      },
      include: {
        category: true,
        bill: { select: { id: true, name: true, amount: true, frequency: true } },
        entity: { select: { id: true, name: true, color: true } },
      },
    })
    return NextResponse.json(created, { status: 201 })
  }

  if (json.removeFromBill) {
    const { billId } = json
    if (!billId) return NextResponse.json({ error: 'billId required' }, { status: 400 })
    await prisma.financeBudget.deleteMany({ where: { billId, familyId: session.familyId } })
    return NextResponse.json({ success: true })
  }

  const { id, isIncludedInPlanner } = json
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const budget = await prisma.financeBudget.update({
    where: { id },
    data: { isIncludedInPlanner },
    include: {
      category: true,
      bill: { select: { id: true, name: true, amount: true, frequency: true } },
      entity: { select: { id: true, name: true, color: true } },
    },
  })
  return NextResponse.json(budget)
}
