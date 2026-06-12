import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getFamilyTimezone } from '@/lib/family'
import { todayStringInTz, endOfLocalDayUtc } from '@/lib/timezone'
import { computeBalanceSheet } from '@/lib/finance-balance-sheet'

// GET /api/finance/balance-sheet?asAt=2026-06-30&entityId=optional
//
// Balance Sheet as at a specific date. All computation lives in
// src/lib/finance-balance-sheet.ts (shared with the net-worth trend report).

export async function GET(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const asAtParam = searchParams.get('asAt')
  const entityId  = searchParams.get('entityId') ?? undefined

  const familyId = user.familyId

  const tz = await getFamilyTimezone(familyId)

  // asAt: interpret the date string as end-of-day in the family's timezone
  const asAt = asAtParam
    ? endOfLocalDayUtc(asAtParam, tz)
    : endOfLocalDayUtc(
        new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
        tz
      )

  const balanceSheet = await computeBalanceSheet(familyId, asAt, entityId)

  return NextResponse.json({
    asAt: asAtParam ?? todayStringInTz(tz),
    ...balanceSheet,
  })
}
