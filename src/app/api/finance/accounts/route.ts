import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import {
  deriveAccountBalancesFromGl,
  ensureAccountGlCategory,
  ensureAllAccountGlCategories,
  accountTypeToGlType,
  setOpeningBalance,
  syncAccountGlCategoryName,
} from '@/lib/finance-opening-balance'

async function _GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const familyId = user.familyId

  // Xero 1:1 model: each account IS a GL account. Ensure every account is bound
  // to its GL category, then read the displayed balance from the ledger so the
  // Accounts page reconciles with the Balance Sheet BY CONSTRUCTION. The old
  // path summed FinanceTransaction rows and explicitly dropped every GL-routed
  // payment (a paid bill never reduced the account), producing a number that
  // disagreed with the reports.
  await ensureAllAccountGlCategories(familyId)

  const [accounts, glBalanceMap, pendingTxs] = await Promise.all([
    prisma.financeAccount.findMany({
      where: { familyId },
      orderBy: { sortOrder: 'asc' },
    }),
    deriveAccountBalancesFromGl(familyId),
    // Pending (uncleared) transactions are a UI cache concept with no GL
    // posting yet — still surfaced as informational badges, keyed by accountId.
    prisma.financeTransaction.findMany({
      where: { familyId, isCleared: false },
      select: { accountId: true, type: true, amount: true },
    }),
  ])

  const pendingCountMap = new Map<string, number>()
  const pendingExpenseMap = new Map<string, number>()
  const pendingIncomeMap = new Map<string, number>()
  for (const tx of pendingTxs) {
    if (!tx.accountId) continue
    pendingCountMap.set(tx.accountId, (pendingCountMap.get(tx.accountId) ?? 0) + 1)
    if (tx.type === 'expense') {
      pendingExpenseMap.set(tx.accountId, (pendingExpenseMap.get(tx.accountId) ?? 0) + tx.amount)
    } else if (tx.type === 'income') {
      pendingIncomeMap.set(tx.accountId, (pendingIncomeMap.get(tx.accountId) ?? 0) + tx.amount)
    }
  }

  const enriched = accounts.map((acct) => ({
    ...acct,
    currentBalance: glBalanceMap.get(acct.id) ?? 0,
    pendingCount: pendingCountMap.get(acct.id) ?? 0,
    pendingExpense: pendingExpenseMap.get(acct.id) ?? 0,
    pendingIncome: pendingIncomeMap.get(acct.id) ?? 0,
  }))

  return NextResponse.json(enriched)
}

async function _POST(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    where: { familyId: user.familyId },
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
      familyId: user.familyId,
    },
  })

  // Xero 1:1 model: bind the new account to its GL category immediately so its
  // balance reads from the ledger from the first transaction (not only once an
  // opening balance is set). setOpeningBalance below will realign the type if a
  // signed opening balance demands it.
  await ensureAccountGlCategory({
    accountId: account.id,
    familyId: user.familyId,
    name: account.name,
    type: accountTypeToGlType(account.type),
  })

  // If opening balance provided, create the double-entry opening balance transaction
  if (openingBalance != null && openingBalance !== 0) {
    await setOpeningBalance(
      account.id,
      user.familyId,
      user.id,
      openingBalance,
      openingBalanceDate ? new Date(openingBalanceDate) : new Date()
    )
  }

  return NextResponse.json(account, { status: 201 })
}

async function _PUT(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { id, name, type, institution, currency, creditLimit, color, icon, isActive } = json

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeAccount.findFirst({
    where: { id, familyId: user.familyId },
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

  // F3: keep the per-account opening-balance GL category label in sync on rename.
  if (name !== undefined && name !== existing.name) {
    await syncAccountGlCategoryName(id, user.familyId, name)
  }

  return NextResponse.json(account)
}

async function _DELETE(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeAccount.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  await prisma.financeAccount.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
export const PUT = withRouteErrors(_PUT)
export const DELETE = withRouteErrors(_DELETE)
