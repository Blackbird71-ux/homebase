import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await requireSession()
  const bills = await prisma.financeRecurringBill.findMany({
    where: { familyId: session.familyId },
    include: { account: { select: { id: true, name: true } }, category: true },
    orderBy: { nextDueDate: 'asc' },
  })
  return NextResponse.json(bills)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { name, amount, accountId, categoryId, frequency, dayOfMonth, nextDueDate } = json

  if (!name || !amount || !frequency) {
    return NextResponse.json({ error: 'Name, amount, and frequency are required' }, { status: 400 })
  }

  const bill = await prisma.financeRecurringBill.create({
    data: {
      name, amount: parseFloat(amount), accountId: accountId ?? null,
      categoryId: categoryId ?? null, frequency,
      dayOfMonth: dayOfMonth ? parseInt(dayOfMonth, 10) : null,
      nextDueDate: new Date(nextDueDate ?? new Date()),
      familyId: session.familyId,
    },
    include: { account: { select: { id: true, name: true } }, category: true },
  })

  return NextResponse.json(bill, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, name, amount, accountId, categoryId, frequency, dayOfMonth, nextDueDate, isActive } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeRecurringBill.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }

  const bill = await prisma.financeRecurringBill.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(amount !== undefined && { amount }),
      ...(accountId !== undefined && { accountId }),
      ...(categoryId !== undefined && { categoryId }),
      ...(frequency !== undefined && { frequency }),
      ...(dayOfMonth !== undefined && { dayOfMonth }),
      ...(nextDueDate !== undefined && { nextDueDate: new Date(nextDueDate) }),
      ...(isActive !== undefined && { isActive }),
    },
    include: { account: { select: { id: true, name: true } }, category: true },
  })

  return NextResponse.json(bill)
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeRecurringBill.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }

  await prisma.financeRecurringBill.delete({ where: { id } })
  return NextResponse.json({ success: true })
}