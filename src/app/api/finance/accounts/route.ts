import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await requireSession()
  const accounts = await prisma.financeAccount.findMany({
    where: { familyId: session.familyId },
    orderBy: { sortOrder: 'asc' },
  })

  // Compute cleared balance from cleared transactions only
  // currentBalance = all transactions (including uncleared/pending)
  // clearedBalance = only isCleared=true transactions
  const enriched = await Promise.all(accounts.map(async (acct) => {
    const clearedSum = await prisma.financeTransaction.aggregate({
      where: { accountId: acct.id, familyId: session.familyId, isCleared: true },
      _sum: { amount: true },
    })
    const pendingExpenseSum = await prisma.financeTransaction.aggregate({
      where: { accountId: acct.id, familyId: session.familyId, isCleared: false, type: 'expense' },
      _sum: { amount: true },
    })
    const pendingIncomeSum = await prisma.financeTransaction.aggregate({
      where: { accountId: acct.id, familyId: session.familyId, isCleared: false, type: 'income' },
      _sum: { amount: true },
    })
    const pendingCount = await prisma.financeTransaction.count({
      where: { accountId: acct.id, familyId: session.familyId, isCleared: false },
    })
    return {
      ...acct,
      pendingCount,
      pendingExpense: pendingExpenseSum._sum.amount ?? 0,
      pendingIncome: pendingIncomeSum._sum.amount ?? 0,
    }
  }))

  return NextResponse.json(enriched)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { name, type, institution, currency, currentBalance, creditLimit, color, icon } = json

  if (!name || !type) {
    return NextResponse.json({ error: 'Name and type are required' }, { status: 400 })
  }
  if (!['checking', 'savings', 'credit', 'cash', 'investment', 'loan', 'entity_account', 'external_account', 'other'].includes(type)) {
    return NextResponse.json({ error: 'Invalid account type' }, { status: 400 })
  }

  // Get max sort order
  const maxOrder = await prisma.financeAccount.findFirst({
    where: { familyId: session.familyId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  const account = await prisma.financeAccount.create({
    data: {
      name,
      type,
      institution: institution ?? null,
      currency: currency ?? 'AUD',
      currentBalance: currentBalance ?? 0,
      creditLimit: creditLimit ?? null,
      color: color ?? null,
      icon: icon ?? null,
      sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
      familyId: session.familyId,
    },
  })

  return NextResponse.json(account, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, name, type, institution, currency, currentBalance, creditLimit, color, icon, isActive } = json

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeAccount.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const account = await prisma.financeAccount.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type }),
      ...(institution !== undefined && { institution }),
      ...(currency !== undefined && { currency }),
      ...(currentBalance !== undefined && { currentBalance }),
      ...(creditLimit !== undefined && { creditLimit }),
      ...(color !== undefined && { color }),
      ...(icon !== undefined && { icon }),
      ...(isActive !== undefined && { isActive }),
    },
  })

  return NextResponse.json(account)
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeAccount.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  await prisma.financeAccount.delete({ where: { id } })
  return NextResponse.json({ success: true })
}