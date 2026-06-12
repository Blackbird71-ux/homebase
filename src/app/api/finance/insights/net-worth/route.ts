import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getFamilyTimezone } from '@/lib/family'
import { todayStringInTz, endOfLocalDayUtc, formatInTz } from '@/lib/timezone'
import { monthRangeInTz } from '@/lib/finance-fy'
import { computeBalanceSheet } from '@/lib/finance-balance-sheet'

// GET /api/finance/insights/net-worth?months=12
//
// Net worth trend: one point per calendar month (family timezone), each
// computed by the same computeBalanceSheet() the Balance Sheet page uses —
// past months as at their local month-end, the current month as at today so
// the latest point always matches the Balance Sheet headline.

export async function GET(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const months = Math.min(24, Math.max(3, parseInt(searchParams.get('months') ?? '12', 10)))

  const tz = await getFamilyTimezone(user.familyId)
  const todayStr = todayStringInTz(tz)
  const [curYear, curMonth1] = todayStr.split('-').map(Number)

  const points: { label: string; netWorth: number; assets: number; liabilities: number }[] = []
  for (let i = months - 1; i >= 0; i--) {
    // Walk back i whole months from (curYear, curMonth1) without day-overflow.
    const totalMonths = curYear * 12 + (curMonth1 - 1) - i
    const year = Math.floor(totalMonths / 12)
    const month1 = (totalMonths % 12) + 1

    const { start, end } = monthRangeInTz(year, month1, tz)
    const asAt = i === 0 ? endOfLocalDayUtc(todayStr, tz) : end
    const label = formatInTz(start, tz, { month: 'short', year: '2-digit' })

    const sheet = await computeBalanceSheet(user.familyId, asAt)
    points.push({
      label,
      netWorth:    sheet.netWorth,
      assets:      sheet.assets.total,
      liabilities: sheet.liabilities.total,
    })
  }

  return NextResponse.json({ points })
}
