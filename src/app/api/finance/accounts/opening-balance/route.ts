import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { setOpeningBalance } from '@/lib/finance-opening-balance'

// POST /api/finance/accounts/opening-balance
// Set or update the opening balance for an existing account.
// amount = null or 0 → clears the opening balance transaction.
async function _POST(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { accountId, amount, date } = json

  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
  }

  // Verify the account belongs to this family
  const account = await prisma.financeAccount.findFirst({
    where: { id: accountId, familyId: user.familyId },
    select: { id: true, name: true, openingBalance: true, openingBalanceTxId: true },
  })
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const parsedAmount = amount != null && amount !== '' ? parseFloat(amount) : null
  const parsedDate = date ? new Date(date) : new Date()

  await setOpeningBalance(
    accountId,
    user.familyId,
    user.id,
    parsedAmount,
    parsedDate,
  )

  // Return updated account with derived balance
  const updated = await prisma.financeAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true, name: true, openingBalance: true, openingBalanceDate: true, openingBalanceTxId: true,
    },
  })

  return NextResponse.json({
    success: true,
    account: updated,
    message: parsedAmount == null || parsedAmount === 0
      ? 'Opening balance cleared'
      : `Opening balance set to ${parsedAmount}`,
  })
}

export const POST = withRouteErrors(_POST)
