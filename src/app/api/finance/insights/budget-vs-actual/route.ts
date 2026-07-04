import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getFamilyTimezone } from '@/lib/family'
import { todayStringInTz, formatInTz } from '@/lib/timezone'
import { monthRangeInTz } from '@/lib/finance-fy'
import { postedNonReversedWhere } from '@/lib/finance-journal-filters'
import { toMonthlyAmount } from '@/lib/financeShared'

// GET /api/finance/insights/budget-vs-actual?month=YYYY-MM
//
// Monthly spend vs budget by category. Actuals come from posted journal
// lines (debits to expense GL accounts, same convention as the insights
// route); budgets are FinanceBudget rows active in the month, normalized
// to a monthly figure with toMonthlyAmount. A budget on a parent category
// rolls up spending in its direct child categories.

async function _GET(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tz = await getFamilyTimezone(user.familyId)

  const { searchParams } = new URL(req.url)
  const monthParam = searchParams.get('month')
  const monthStr = monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)
    ? monthParam
    : todayStringInTz(tz).slice(0, 7)
  const [year, month1] = monthStr.split('-').map(Number)
  const { start, end } = monthRangeInTz(year, month1, tz)

  const [budgets, expenseCategories, lines] = await Promise.all([
    prisma.financeBudget.findMany({
      where: {
        familyId: user.familyId,
        categoryId: { not: null },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: {
        categoryId: true, amount: true, period: true,
        category: { select: { name: true, color: true } },
      },
    }),
    prisma.financeCategory.findMany({
      where: { familyId: user.familyId, type: 'expense' },
      select: { id: true, parentId: true },
    }),
    prisma.financeJournalLine.findMany({
      where: {
        journalEntry: {
          familyId: user.familyId,
          ...postedNonReversedWhere,
          date: { gte: start, lte: end },
        },
        glAccount: { type: 'expense' },
      },
      select: { side: true, amount: true, glAccountId: true },
    }),
  ])

  // Net spend per expense category (debit-positive).
  const actualByCat = new Map<string, number>()
  for (const l of lines) {
    const delta = l.side === 'debit' ? l.amount : -l.amount
    actualByCat.set(l.glAccountId, (actualByCat.get(l.glAccountId) ?? 0) + delta)
  }

  const childrenOf = new Map<string, string[]>()
  for (const c of expenseCategories) {
    if (!c.parentId) continue
    const list = childrenOf.get(c.parentId) ?? []
    list.push(c.id)
    childrenOf.set(c.parentId, list)
  }

  // One row per budgeted category; multiple budgets on a category sum.
  const rowMap = new Map<string, { categoryId: string; name: string; color: string | null; budget: number }>()
  for (const b of budgets) {
    const categoryId = b.categoryId!
    const existing = rowMap.get(categoryId)
    const monthly = toMonthlyAmount(b.amount, b.period)
    if (existing) existing.budget += monthly
    else rowMap.set(categoryId, {
      categoryId,
      name: b.category?.name ?? 'Unknown category',
      color: b.category?.color ?? null,
      budget: monthly,
    })
  }

  const round2 = (n: number) => Math.round(n * 100) / 100
  const coveredCatIds = new Set<string>()

  const rows = Array.from(rowMap.values()).map(row => {
    const catIds = [row.categoryId, ...(childrenOf.get(row.categoryId) ?? [])]
    let actual = 0
    for (const id of catIds) {
      actual += actualByCat.get(id) ?? 0
      coveredCatIds.add(id)
    }
    return { ...row, budget: round2(row.budget), actual: round2(actual) }
  }).sort((a, b) => b.budget - a.budget)

  // Spending in expense categories no budget covers.
  let unbudgeted = 0
  for (const [catId, amount] of actualByCat) {
    if (!coveredCatIds.has(catId)) unbudgeted += amount
  }

  return NextResponse.json({
    month: monthStr,
    label: formatInTz(start, tz, { month: 'long', year: 'numeric' }),
    rows,
    totals: {
      budget:     round2(rows.reduce((s, r) => s + r.budget, 0)),
      actual:     round2(rows.reduce((s, r) => s + r.actual, 0)),
      unbudgeted: round2(Math.max(0, unbudgeted)),
    },
  })
}

export const GET = withRouteErrors(_GET)
