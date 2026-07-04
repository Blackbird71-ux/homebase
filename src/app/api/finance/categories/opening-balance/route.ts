import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { setCategoryOpeningBalance } from '@/lib/finance-opening-balance'

// POST /api/finance/categories/opening-balance
// Body: { categoryId: string, amount: number | null, date: string | null }
// Sets or clears the opening balance on a Chart of Accounts (FinanceCategory) entry.
// Only valid for type = 'asset' | 'liability' | 'equity'.
// amount = null or 0 clears the opening balance.
// amount > 0 = normal balance (asset with funds, liability with debt owed, equity in credit)
// amount < 0 = abnormal balance (rare; e.g. an asset that is overdrawn)
async function _POST(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { categoryId, amount, date } = json

  if (!categoryId) {
    return NextResponse.json({ error: 'categoryId is required' }, { status: 400 })
  }

  // Verify the category belongs to this family
  const category = await prisma.financeCategory.findFirst({
    where: { id: categoryId, familyId: user.familyId },
    select: { id: true, name: true, type: true },
  })
  if (!category) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  // Only asset, liability, equity accounts should have opening balances.
  // Income and expense accounts reset to zero each period by definition.
  if (!['asset', 'liability', 'equity'].includes(category.type)) {
    return NextResponse.json({
      error: `Opening balances are only valid for asset, liability, and equity accounts. This account is type "${category.type}".`,
    }, { status: 400 })
  }

  const parsedAmount = (amount != null && amount !== '' && amount !== 0)
    ? parseFloat(String(amount))
    : null
  const parsedDate = (parsedAmount != null && date)
    ? new Date(date)
    : null

  // GL-first: post (or clear) the opening-balance journal and mirror the value
  // onto the category. All balance posting lives in the shared helper.
  await setCategoryOpeningBalance(categoryId, user.familyId, parsedAmount, parsedDate)

  const updated = await prisma.financeCategory.findFirst({
    where: { id: categoryId, familyId: user.familyId },
    select: {
      id: true, name: true, type: true,
      openingBalance: true, openingBalanceDate: true,
    },
  })
  if (!updated) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    category: {
      ...updated,
      openingBalanceDate: updated.openingBalanceDate?.toISOString() ?? null,
    },
    message: parsedAmount == null
      ? `Opening balance cleared for ${category.name}`
      : `Opening balance set to ${parsedAmount} for ${category.name}`,
  })
}

export const POST = withRouteErrors(_POST)
