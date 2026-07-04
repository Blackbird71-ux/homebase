import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { todayStringInTz, formatInTz } from '@/lib/timezone'
import { monthRangeInTz } from '@/lib/finance-fy'
import { postedNonReversedWhere } from '@/lib/finance-journal-filters'

async function _GET(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const months = Math.min(24, Math.max(3, parseInt(searchParams.get('months') ?? '12', 10)))

  const tz = user.timezone ?? 'UTC'

  // Current calendar month in the family's timezone — NOT the server's UTC month.
  // Reading getFullYear()/getMonth() off a UTC instant gave the wrong month for
  // users east of UTC (e.g. Sydney's June 1 = 2026-05-31T14:00Z reads as May),
  // dropping the current month and overflowing on short months via setMonth().
  const [curYear, curMonth1] = todayStringInTz(tz).split('-').map(Number)

  // Build month buckets from (months-1) ago up to and including the current month.
  // Each bucket is the Sydney-local calendar month expressed as UTC instants.
  const buckets: { label: string; start: Date; end: Date }[] = []
  for (let i = months - 1; i >= 0; i--) {
    // Walk back i whole months from (curYear, curMonth1) without day-overflow.
    const totalMonths = curYear * 12 + (curMonth1 - 1) - i
    const year = Math.floor(totalMonths / 12)
    const month1 = (totalMonths % 12) + 1

    const { start, end } = monthRangeInTz(year, month1, tz)
    const label = formatInTz(start, tz, { month: 'short', year: 'numeric' })
    buckets.push({ label, start, end })
  }

  if (buckets.length === 0) return NextResponse.json({ monthly: [], categoryBreakdown: [] })

  const rangeStart = buckets[0].start
  const rangeEnd = buckets[buckets.length - 1].end

  // Fetch all posted journal lines in range with category type
  const lines = await prisma.financeJournalLine.findMany({
    where: {
      journalEntry: {
        familyId: user.familyId,
        ...postedNonReversedWhere,
        date: { gte: rangeStart, lte: rangeEnd },
      },
    },
    select: {
      side: true,
      amount: true,
      glAccount: {
        select: { id: true, name: true, type: true, color: true, parentId: true },
      },
      journalEntry: { select: { date: true } },
    },
  })

  // ── Monthly income vs expense ──────────────────────────────────────────────
  // Income category lines: credit to income account = revenue
  // Expense category lines: debit to expense account = cost
  const monthly = buckets.map(bucket => {
    const bucketLines = lines.filter(l => {
      const d = l.journalEntry.date
      return d >= bucket.start && d <= bucket.end
    })

    let income = 0
    let expenses = 0
    for (const l of bucketLines) {
      const type = l.glAccount.type
      if (type === 'income') {
        income += l.side === 'credit' ? l.amount : -l.amount
      } else if (type === 'expense') {
        expenses += l.side === 'debit' ? l.amount : -l.amount
      }
    }

    return {
      label: bucket.label,
      income: Math.max(0, income),
      expenses: Math.max(0, expenses),
      net: income - expenses,
    }
  })

  // ── Category breakdown for most recent full month ──────────────────────────
  const lastBucket = buckets[buckets.length - 1]
  const lastMonthLines = lines.filter(l => {
    const d = l.journalEntry.date
    return d >= lastBucket.start && d <= lastBucket.end
  })

  const catMap = new Map<string, { name: string; color: string | null; amount: number }>()
  for (const l of lastMonthLines) {
    if (l.glAccount.type !== 'expense') continue
    if (l.side !== 'debit') continue
    const key = l.glAccount.parentId ?? l.glAccount.id
    const existing = catMap.get(key)
    if (existing) {
      existing.amount += l.amount
    } else {
      catMap.set(key, {
        name: l.glAccount.name,
        color: l.glAccount.color,
        amount: l.amount,
      })
    }
  }

  const categoryBreakdown = Array.from(catMap.values())
    .filter(c => c.amount > 0.01)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)

  return NextResponse.json({ monthly, categoryBreakdown })
}

export const GET = withRouteErrors(_GET)
