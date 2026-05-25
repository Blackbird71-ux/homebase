import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { monthBoundsInTz, formatInTz } from '@/lib/timezone'

export async function GET(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const months = Math.min(24, Math.max(3, parseInt(searchParams.get('months') ?? '12', 10)))

  const tz = user.timezone ?? 'UTC'

  // Build month buckets from (months) ago up to current month
  const { start: currentMonthStart } = monthBoundsInTz(tz)
  const buckets: { label: string; start: Date; end: Date }[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(currentMonthStart)
    d.setMonth(d.getMonth() - i)
    const year = d.getFullYear()
    const month = d.getMonth()

    // Finance journal dates are stored as UTC midnight accounting dates by convention
    const start = new Date(Date.UTC(year, month, 1))
    const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))

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
        isPosted: true,
        isReversed: false,
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
