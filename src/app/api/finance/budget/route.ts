import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { removeBillBudgetRule } from '@/lib/finance-budget-rule'

async function _GET(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const entityId = searchParams.get('entityId') // optional filter

  const where: any = { familyId: user.familyId }
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

async function _POST(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { name, amount, categoryId, period, rollover, alertThreshold, billId, isIncludedInPlanner, entityId } = json

  if (!name || !amount || !period) {
    return NextResponse.json({ error: 'Name, amount, and period are required' }, { status: 400 })
  }

  const startDate = new Date(new Date().getFullYear(), 0, 1)
  const endDate = new Date(startDate.getFullYear() + 10, startDate.getMonth(), startDate.getDate())

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
      familyId: user.familyId,
    },
    include: {
      category: true,
      bill: { select: { id: true, name: true, amount: true, frequency: true } },
      entity: { select: { id: true, name: true, color: true } },
    },
  })

  return NextResponse.json(budget, { status: 201 })
}

async function _PUT(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { id, name, amount, categoryId, period, rollover, alertThreshold, billId, isIncludedInPlanner, entityId } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeBudget.findFirst({ where: { id, familyId: user.familyId } })
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

async function _DELETE(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeBudget.findFirst({ where: { id, familyId: user.familyId } })
  if (!existing) return NextResponse.json({ error: 'Budget not found' }, { status: 404 })

  await prisma.financeBudget.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

async function _PATCH(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()

  if (json.upsertFromBill) {
    const { billId, name, amount, categoryId, period, entityId } = json
    if (!billId) return NextResponse.json({ error: 'billId required' }, { status: 400 })

    const existing = await prisma.financeBudget.findFirst({ where: { billId, familyId: user.familyId } })
    const startDate = new Date(new Date().getFullYear(), 0, 1)
    const endDate = new Date(startDate.getFullYear() + 10, startDate.getMonth(), startDate.getDate())

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
        familyId: user.familyId,
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
    await removeBillBudgetRule(prisma, billId, user.familyId)
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

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
export const PUT = withRouteErrors(_PUT)
export const PATCH = withRouteErrors(_PATCH)
export const DELETE = withRouteErrors(_DELETE)
