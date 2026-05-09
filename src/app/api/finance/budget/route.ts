import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { startOfMonth, endOfMonth, addYears } from 'date-fns'

export async function GET(request: NextRequest) {
  const session = await requireSession()

  const budgets = await prisma.financeBudget.findMany({
    where: { familyId: session.familyId },
    include: {
      category: true,
      bill: { select: { id: true, name: true, amount: true, frequency: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(budgets)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const {
    name, amount, categoryId, period,
    rollover, alertThreshold,
    billId, isIncludedInPlanner,
  } = json

  if (!name || !amount || !period) {
    return NextResponse.json({ error: 'Name, amount, and period are required' }, { status: 400 })
  }

  // Use a broad date range — budget rules are ongoing, not date-bound for our use case
  const startDate = new Date(new Date().getFullYear(), 0, 1)  // Jan 1 this year
  const endDate = addYears(startDate, 10)                     // 10-year horizon

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
      familyId: session.familyId,
    },
    include: {
      category: true,
      bill: { select: { id: true, name: true, amount: true, frequency: true } },
    },
  })

  return NextResponse.json(budget, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const {
    id, name, amount, categoryId, period,
    rollover, alertThreshold,
    billId, isIncludedInPlanner,
  } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeBudget.findFirst({
    where: { id, familyId: session.familyId },
  })
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
    },
    include: {
      category: true,
      bill: { select: { id: true, name: true, amount: true, frequency: true } },
    },
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
  if (!existing) return NextResponse.json({ error: 'Budget not found' }, { status: 404 })

  await prisma.financeBudget.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

// PATCH — toggle isIncludedInPlanner, or upsert a budget rule from a bill
export async function PATCH(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()

  // Upsert from bill: find existing rule for this bill or create a new one
  if (json.upsertFromBill) {
    const { billId, name, amount, categoryId, period } = json
    if (!billId) return NextResponse.json({ error: 'billId required' }, { status: 400 })

    const existing = await prisma.financeBudget.findFirst({
      where: { billId, familyId: session.familyId },
    })

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
        },
        include: { category: true, bill: { select: { id: true, name: true, amount: true, frequency: true } } },
      })
      return NextResponse.json(updated)
    }

    const created = await prisma.financeBudget.create({
      data: {
        name, amount: parseFloat(amount),
        categoryId: categoryId || null,
        period,
        startDate,
        endDate,
        rollover: false,
        alertThreshold: 80,
        billId,
        isIncludedInPlanner: true,
        familyId: session.familyId,
      },
      include: { category: true, bill: { select: { id: true, name: true, amount: true, frequency: true } } },
    })
    return NextResponse.json(created, { status: 201 })
  }

  // Remove budget rule for a bill
  if (json.removeFromBill) {
    const { billId } = json
    if (!billId) return NextResponse.json({ error: 'billId required' }, { status: 400 })
    await prisma.financeBudget.deleteMany({
      where: { billId, familyId: session.familyId },
    })
    return NextResponse.json({ success: true })
  }

  // Toggle planner inclusion
  const { id, isIncludedInPlanner } = json
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const budget = await prisma.financeBudget.update({
    where: { id },
    data: { isIncludedInPlanner },
    include: { category: true, bill: { select: { id: true, name: true, amount: true, frequency: true } } },
  })
  return NextResponse.json(budget)
}
