import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { deriveAllAccountBalances, setOpeningBalance } from '@/lib/finance-opening-balance'

export async function GET() {
  const session = await requireSession()
  const familyId = session.familyId

  // Fetch accounts and all cleared/pending transactions in two queries (not N+1).
  const [accounts, allTxs] = await Promise.all([
    prisma.financeAccount.findMany({
      where: { familyId },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.financeTransaction.findMany({
      where: { familyId },
      select: { accountId: true, glAccountId: true, type: true, amount: true, isCleared: true },
    }),
  ])

  // Build derived balance map from cleared transactions (single pass).
  const clearedBalanceMap = new Map<string, number>()
  const pendingCountMap = new Map<string, number>()
  const pendingExpenseMap = new Map<string, number>()
  const pendingIncomeMap = new Map<string, number>()

  for (const tx of allTxs) {
    if (!tx.accountId && !tx.glAccountId) continue
    // glAccountId takes precedence — GL-routed payments post to the GL category bucket, not accountId
    // But the Accounts page only tracks FinanceAccount balances, so only accumulate when accountId is set
    // and there is NO glAccountId override (glAccountId means it went to a GL category, not a bank account)
    const bankBucket = tx.glAccountId ? null : tx.accountId
    if (tx.isCleared) {
      if (bankBucket) {
        const cur = clearedBalanceMap.get(bankBucket) ?? 0
        if (tx.type === 'income') {
          clearedBalanceMap.set(bankBucket, cur + tx.amount)
        } else if (tx.type === 'expense') {
          clearedBalanceMap.set(bankBucket, cur - tx.amount)
        } else if (tx.type === 'opening_balance') {
          // Signed amount: positive for assets, negative for liabilities.
          clearedBalanceMap.set(bankBucket, cur + tx.amount)
        }
      }
    } else {
      // Pending — still track by accountId (GL-pending transactions are rare)
      const pendingBucket = tx.accountId
      if (!pendingBucket) continue
      pendingCountMap.set(pendingBucket, (pendingCountMap.get(pendingBucket) ?? 0) + 1)
      if (tx.type === 'expense') {
        pendingExpenseMap.set(pendingBucket, (pendingExpenseMap.get(pendingBucket) ?? 0) + tx.amount)
      } else if (tx.type === 'income') {
        pendingIncomeMap.set(pendingBucket, (pendingIncomeMap.get(pendingBucket) ?? 0) + tx.amount)
      }
    }
  }

  const enriched = accounts.map((acct) => ({
    ...acct,
    currentBalance: clearedBalanceMap.get(acct.id) ?? 0,
    pendingCount: pendingCountMap.get(acct.id) ?? 0,
    pendingExpense: pendingExpenseMap.get(acct.id) ?? 0,
    pendingIncome: pendingIncomeMap.get(acct.id) ?? 0,
  }))

  return NextResponse.json(enriched)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { name, type, institution, currency, creditLimit, color, icon, openingBalance, openingBalanceDate } = json

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
      currentBalance: 0,
      creditLimit: creditLimit ?? null,
      color: color ?? null,
      icon: icon ?? null,
      sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
      familyId: session.familyId,
    },
  })

  // If opening balance provided, create the double-entry opening balance transaction
  if (openingBalance != null && openingBalance !== 0) {
    await setOpeningBalance(
      account.id,
      session.familyId,
      session.id,
      openingBalance,
      openingBalanceDate ? new Date(openingBalanceDate) : new Date()
    )
  }

  return NextResponse.json(account, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, name, type, institution, currency, creditLimit, color, icon, isActive } = json

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