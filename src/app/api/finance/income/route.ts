import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { addMonths, addWeeks } from 'date-fns'

const INCOME_INCLUDE = {
  account: { select: { id: true, name: true } },
  category: true,
  location: { select: { id: true, name: true } },
  entity: { select: { id: true, name: true, color: true, type: true } },
}

export async function GET() {
  const session = await requireSession()
  const entries = await prisma.financeIncomeEntry.findMany({
    where: { familyId: session.familyId },
    include: INCOME_INCLUDE,
    orderBy: { nextExpectedDate: 'asc' },
  })
  return NextResponse.json(entries)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const {
    name, amount, accountId, categoryId, frequency,
    incomeType, nextExpectedDate, endDate,
    isActive, received, receivedDate,
    notes, memberId, locationId, entityId,
  } = json

  if (!name || !amount || !frequency) {
    return NextResponse.json({ error: 'Name, amount, and frequency are required' }, { status: 400 })
  }

  const entry = await prisma.financeIncomeEntry.create({
    data: {
      name,
      amount: parseFloat(amount),
      accountId: accountId ?? null,
      categoryId: categoryId ?? null,
      frequency,
      incomeType: incomeType ?? 'recurring',
      nextExpectedDate: new Date(nextExpectedDate ?? new Date()),
      endDate: endDate ? new Date(endDate) : null,
      isActive: isActive ?? true,
      received: received ?? false,
      receivedDate: receivedDate ? new Date(receivedDate) : null,
      notes: notes ?? null,
      memberId: memberId ?? null,
      locationId: locationId ?? null,
      entityId: entityId ?? null,
      familyId: session.familyId,
    },
    include: INCOME_INCLUDE,
  })

  return NextResponse.json(entry, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const {
    id, name, amount, accountId, categoryId, frequency,
    incomeType, nextExpectedDate, endDate,
    isActive, received, receivedDate,
    notes, memberId, locationId, entityId,
  } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeIncomeEntry.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Income entry not found' }, { status: 404 })

  const entry = await prisma.financeIncomeEntry.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(amount !== undefined && { amount: parseFloat(amount) }),
      ...(accountId !== undefined && { accountId: accountId ?? null }),
      ...(categoryId !== undefined && { categoryId: categoryId ?? null }),
      ...(frequency !== undefined && { frequency }),
      ...(incomeType !== undefined && { incomeType }),
      ...(nextExpectedDate !== undefined && { nextExpectedDate: new Date(nextExpectedDate) }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(isActive !== undefined && { isActive }),
      ...(received !== undefined && { received }),
      ...(receivedDate !== undefined && { receivedDate: receivedDate ? new Date(receivedDate) : null }),
      ...(notes !== undefined && { notes: notes ?? null }),
      ...(memberId !== undefined && { memberId: memberId ?? null }),
      ...(locationId !== undefined && { locationId: locationId ?? null }),
      ...(entityId !== undefined && { entityId: entityId ?? null }),
    },
    include: INCOME_INCLUDE,
  })

  return NextResponse.json(entry)
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeIncomeEntry.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Income entry not found' }, { status: 404 })

  await prisma.financeIncomeEntry.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

function advanceNextExpectedDate(date: Date, frequency: string): Date {
  if (frequency === 'monthly') return addMonths(date, 1)
  if (frequency === 'fortnightly') return addWeeks(date, 2)
  if (frequency === 'weekly') return addWeeks(date, 1)
  if (frequency === 'quarterly') return addMonths(date, 3)
  if (frequency === 'yearly') return addMonths(date, 12)
  return addMonths(date, 1)
}

export async function PATCH(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, received } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeIncomeEntry.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Income entry not found' }, { status: 404 })

  const updateData: Record<string, any> = {}
  if (received !== undefined) {
    updateData.received = received
    updateData.receivedDate = received ? new Date() : null
  }

  // If undoing a received entry, delete child occurrences that were spawned
  if (received === false && existing.received === true) {
    await prisma.financeIncomeEntry.deleteMany({
      where: { parentIncomeId: id, familyId: session.familyId, received: false },
    })
  }

  const entry = await prisma.financeIncomeEntry.update({
    where: { id },
    data: updateData,
    include: INCOME_INCLUDE,
  })

  // If marking as received and it's a recurring entry, spawn the next occurrence
  if (received === true && existing.incomeType !== 'one-off') {
    const newExpectedDate = advanceNextExpectedDate(existing.nextExpectedDate, existing.frequency)
    if (!existing.endDate || newExpectedDate <= existing.endDate) {
      await prisma.financeIncomeEntry.create({
        data: {
          name: existing.name,
          amount: existing.amount,
          accountId: existing.accountId,
          categoryId: existing.categoryId,
          frequency: existing.frequency,
          incomeType: existing.incomeType,
          nextExpectedDate: newExpectedDate,
          endDate: existing.endDate,
          isActive: existing.isActive,
          received: false,
          receivedDate: null,
          notes: existing.notes,
          memberId: existing.memberId,
          locationId: existing.locationId,
          entityId: existing.entityId,
          parentIncomeId: existing.id,
          familyId: session.familyId,
        },
      })
    }
  }

  return NextResponse.json(entry)
}
