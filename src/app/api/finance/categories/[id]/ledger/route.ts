import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { DEFAULT_TIMEZONE } from '@/lib/timezone'
import { fyDateRangeInTz, fyStartYear } from '@/lib/finance-fy'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LedgerRow {
  id: string
  date: string
  description: string
  reference: string | null
  source: 'journal'
  sourceId: string
  debit: number
  credit: number
  balance: number
  vendor: string | null
  isCleared: boolean
}

export interface LedgerResponse {
  category: {
    id: string
    name: string
    glCode: string | null
    type: string
    normalBalance: 'debit' | 'credit'
  }
  dateFrom: string
  dateTo: string
  openingBalance: number
  rows: LedgerRow[]
  totals: {
    totalDebits: number
    totalCredits: number
    closingBalance: number
  }
}

// ─── Normal balance convention ────────────────────────────────────────────────
// Assets / Expenses → debit-normal
// Liabilities / Income / Equity / Transfer → credit-normal

function normalBalance(type: string): 'debit' | 'credit' {
  return ['asset', 'expense', 'cost_of_sales', 'other_expense'].includes(type.toLowerCase())
    ? 'debit'
    : 'credit'
}

function jlSignedDelta(side: string, amount: number, norm: 'debit' | 'credit'): number {
  if (side === 'debit')  return norm === 'debit'  ? amount : -amount
  if (side === 'credit') return norm === 'credit' ? amount : -amount
  return amount
}

// ─── tzMidnight helper ────────────────────────────────────────────────────────

function tzMidnight(dateStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const noonUtc = Date.UTC(y, m - 1, d, 12, 0, 0, 0)
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(new Date(noonUtc))
  const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value)
  const tzYear = get('year'), tzMonth = get('month'), tzDay = get('day')
  const tzHour = get('hour'), tzMinute = get('minute'), tzSecond = get('second')
  const offsetMs = noonUtc - Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond)
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) + offsetMs)
}

// ─── Route ───────────────────────────────────────────────────────────────────
//
// GL-FIRST: reads exclusively from posted FinanceJournalLine entries.
// FinanceTransaction is the cache for the transactions page only.
// Single source of truth = GL.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const user = session?.user as SessionUser | undefined
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: categoryId } = await params
    const { searchParams } = new URL(req.url)

    const family = await prisma.family.findUnique({
      where: { id: user.familyId },
      select: { timezone: true, financeYearStartMonth: true },
    })
    const tz           = family?.timezone              ?? DEFAULT_TIMEZONE
    const fyStartMonth = family?.financeYearStartMonth ?? 7

    // ── Date range ────────────────────────────────────────────────────────
    let dateFrom: string
    let dateTo: string

    if (searchParams.get('from') && searchParams.get('to')) {
      dateFrom = searchParams.get('from')!
      dateTo   = searchParams.get('to')!
    } else {
      const now          = new Date()
      const localDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)
      const localYear    = parseInt(localDateStr.slice(0, 4), 10)
      const localMonth   = parseInt(localDateStr.slice(5, 7), 10)
      const fyYear       = fyStartYear(new Date(localYear, localMonth - 1, 1), fyStartMonth)
      const { start, end } = fyDateRangeInTz(fyYear, fyStartMonth, tz)
      dateFrom = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(start)
      dateTo   = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(end)
    }

    const periodStart = tzMidnight(dateFrom, tz)
    const periodEnd   = new Date(tzMidnight(dateTo, tz).getTime() + 86_400_000 - 1)

    // ── Verify category ───────────────────────────────────────────────────
    const category = await prisma.financeCategory.findFirst({
      where: { id: categoryId, familyId: user.familyId },
      select: { id: true, name: true, type: true, glCode: true },
    })
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const norm = normalBalance(category.type ?? 'expense')

    // ── Opening balance ───────────────────────────────────────────────────
    // Net of all pre-period posted GL lines. COA opening balances are now
    // journalised (type='opening_balance'), so they are captured here when dated
    // before the period; the static category.openingBalance field is a display
    // mirror only and must NOT be seeded as well (it would double-count the
    // journalised opening entry). See finance-opening-balance.setCategoryOpeningBalance.
    let openingBalance = 0

    const preJLines = await prisma.financeJournalLine.findMany({
      where: {
        glAccountId: category.id,
        journalEntry: {
          familyId: user.familyId,
          isPosted: true,
          date: { lt: periodStart },
        },
      },
      select: { side: true, amount: true },
    })
    for (const jl of preJLines) {
      openingBalance += jlSignedDelta(jl.side, jl.amount, norm)
    }
    openingBalance = Math.round(openingBalance * 100) / 100

    // ── In-period posted GL lines ─────────────────────────────────────────
    const journalLines = await prisma.financeJournalLine.findMany({
      where: {
        glAccountId: category.id,
        journalEntry: {
          familyId: user.familyId,
          isPosted: true,
          date: { gte: periodStart, lte: periodEnd },
        },
      },
      include: {
        journalEntry: {
          select: {
            id: true,
            date: true,
            description: true,
            reference: true,
            type: true,
          },
        },
      },
      orderBy: [
        { journalEntry: { date: 'asc' } },
        { journalEntry: { createdAt: 'asc' } },
      ],
    })

    // ── Running balance ───────────────────────────────────────────────────
    let running = openingBalance
    const rows: LedgerRow[] = journalLines.map(jl => {
      running += jlSignedDelta(jl.side, jl.amount, norm)
      return {
        id:          jl.id,
        date:        new Date(jl.journalEntry.date).toISOString(),
        description: jl.description ?? jl.journalEntry.description ?? `Journal ${jl.journalEntry.reference ?? ''}`,
        reference:   jl.journalEntry.reference ?? null,
        source:      'journal',
        sourceId:    jl.journalEntry.id,
        debit:       Math.round((jl.side === 'debit'  ? jl.amount : 0) * 100) / 100,
        credit:      Math.round((jl.side === 'credit' ? jl.amount : 0) * 100) / 100,
        balance:     Math.round(running * 100) / 100,
        vendor:      null,
        isCleared:   true,
      }
    })

    const totalDebits  = rows.reduce((s, r) => s + r.debit,  0)
    const totalCredits = rows.reduce((s, r) => s + r.credit, 0)

    return NextResponse.json({
      category: {
        id:            category.id,
        name:          category.name,
        glCode:        category.glCode ?? null,
        type:          category.type ?? 'expense',
        normalBalance: norm,
      },
      dateFrom,
      dateTo,
      openingBalance,
      rows,
      totals: {
        totalDebits:    Math.round(totalDebits  * 100) / 100,
        totalCredits:   Math.round(totalCredits * 100) / 100,
        closingBalance: Math.round(running       * 100) / 100,
      },
    } satisfies LedgerResponse)
  } catch (err) {
    console.error('[finance/categories/[id]/ledger] GET error:', err)
    return NextResponse.json({ error: 'Failed to load ledger' }, { status: 500 })
  }
}
