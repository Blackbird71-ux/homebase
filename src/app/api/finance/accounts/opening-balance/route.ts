import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { setOpeningBalance } from '@/lib/finance-opening-balance'

// POST /api/finance/accounts/opening-balance
// Set or update the opening balance for an existing account.
// amount = null or 0 → clears the opening balance transaction.
export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { accountId, amount, date } = json

  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
  }

  // Verify the account belongs to this family
  const account = await prisma.financeAccount.findFirst({
    where: { id: accountId, familyId: session.familyId },
    select: { id: true, name: true, openingBalance: true, openingBalanceTxId: true },
  })
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  const parsedAmount = amount != null && amount !== '' ? parseFloat(amount) : null
  const parsedDate = date ? new Date(date) : new Date()

  await setOpeningBalance(
    accountId,
    session.familyId,
    session.id,
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
