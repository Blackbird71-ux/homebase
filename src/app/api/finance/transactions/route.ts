import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')
  const categoryId = searchParams.get('categoryId')
  const memberId = searchParams.get('memberId')
  const locationId = searchParams.get('locationId')
  const type = searchParams.get('type')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const isCleared = searchParams.get('isCleared')
  const isRecurring = searchParams.get('isRecurring')
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = parseInt(searchParams.get('limit') ?? '50', 10)

  const where: any = { familyId: session.familyId }
  if (accountId) where.accountId = accountId
  if (categoryId) where.categoryId = categoryId
  if (memberId) where.memberId = memberId
  if (locationId) where.locationId = locationId
  if (type) where.type = type
  if (searchParams.get('entityId')) where.entityId = searchParams.get('entityId')
  if (startDate) where.date = { ...(where.date || {}), gte: new Date(startDate) }
  if (endDate) where.date = { ...(where.date || {}), lte: new Date(endDate) }
  if (isCleared !== null) where.isCleared = isCleared === 'true'
  if (isRecurring !== null) where.isRecurring = isRecurring === 'true'

  const [transactions, total] = await Promise.all([
    prisma.financeTransaction.findMany({
      where,
      include: {
        category: true,
        account: true,
        location: { select: { id: true, name: true } },
        entity: { select: { id: true, name: true, color: true, isDefault: true } },
      },
      orderBy: { date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.financeTransaction.count({ where }),
  ])

  return NextResponse.json({ transactions, total, page, limit })
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const {
    accountId, categoryId, type, amount, payee,
    description, date, isRecurring, isCleared, isPrivate,
    memberId, locationId, taxClassification,
  } = json

  if (!type || amount === undefined) {
    return NextResponse.json({ error: 'Type and amount are required' }, { status: 400 })
  }
  if (!['income', 'expense', 'transfer'].includes(type)) {
    return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 })
  }

  const transaction = await prisma.financeTransaction.create({
    data: {
      accountId: accountId ?? null,
      categoryId: categoryId ?? null,
      type,
      amount,
      payee: payee ?? null,
      description: description ?? null,
      date: date ? new Date(date) : new Date(),
      isRecurring: isRecurring ?? false,
      isCleared: isCleared ?? false,
      isPrivate: isPrivate ?? false,
      memberId: memberId ?? null,
      locationId: locationId ?? null,
      entityId: json.entityId ?? null,
      taxClassification: taxClassification ?? null,
      createdBy: session.id,
      familyId: session.familyId,
    },
    include: {
      category: true,
      account: true,
      location: { select: { id: true, name: true } },
      entity: { select: { id: true, name: true, color: true, isDefault: true } },
    },
  })

  // Update account balance
  if (accountId) {
    const balanceChange = type === 'income' ? amount : type === 'expense' ? -amount : 0
    if (balanceChange !== 0) {
      await prisma.financeAccount.update({
        where: { id: accountId },
        data: { currentBalance: { increment: balanceChange } },
      })
    }
  }

  return NextResponse.json(transaction, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const {
    id, accountId, categoryId, type, amount, payee,
    description, date, isRecurring, isCleared, isPrivate,
    memberId, locationId, taxClassification,
  } = json

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeTransaction.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  // Reverse old balance change if account changed or amount/type changed
  if (existing.accountId && (existing.accountId !== accountId || existing.amount !== amount || existing.type !== type)) {
    const oldChange = existing.type === 'income' ? -existing.amount : existing.type === 'expense' ? existing.amount : 0
    if (oldChange !== 0) {
      await prisma.financeAccount.update({
        where: { id: existing.accountId },
        data: { currentBalance: { increment: oldChange } },
      })
    }
  }

  const transaction = await prisma.financeTransaction.update({
    where: { id },
    data: {
      ...(accountId !== undefined && { accountId }),
      ...(categoryId !== undefined && { categoryId }),
      ...(type !== undefined && { type }),
      ...(amount !== undefined && { amount }),
      ...(payee !== undefined && { payee }),
      ...(description !== undefined && { description }),
      ...(date !== undefined && { date: new Date(date) }),
      ...(isRecurring !== undefined && { isRecurring }),
      ...(isCleared !== undefined && { isCleared }),
      ...(isPrivate !== undefined && { isPrivate }),
      ...(memberId !== undefined && { memberId: memberId ?? null }),
      ...(locationId !== undefined && { locationId: locationId ?? null }),
      ...(json.entityId !== undefined && { entityId: json.entityId ?? null }),
      ...(taxClassification !== undefined && { taxClassification: taxClassification ?? null }),
    },
    include: {
      category: true,
      account: true,
      location: { select: { id: true, name: true } },
      entity: { select: { id: true, name: true, color: true, isDefault: true } },
    },
  })

  // Apply new balance change
  if (transaction.accountId) {
    const newChange = transaction.type === 'income' ? transaction.amount : transaction.type === 'expense' ? -transaction.amount : 0
    if (newChange !== 0) {
      await prisma.financeAccount.update({
        where: { id: transaction.accountId },
        data: { currentBalance: { increment: newChange } },
      })
    }
  }

  return NextResponse.json(transaction)
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeTransaction.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  // Reverse balance
  if (existing.accountId) {
    const change = existing.type === 'income' ? -existing.amount : existing.type === 'expense' ? existing.amount : 0
    if (change !== 0) {
      await prisma.financeAccount.update({
        where: { id: existing.accountId },
        data: { currentBalance: { increment: change } },
      })
    }
  }

  await prisma.financeTransaction.delete({ where: { id } })
  return NextResponse.json({ success: true })
}