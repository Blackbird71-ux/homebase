import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { fyDateRangeInTz, fyStartYear } from '@/lib/finance-fy'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LedgerRow {
  id: string
  date: string        // ISO string from DB
  description: string
  reference: string | null
  source: 'transaction' | 'journal'
  sourceId: string
  debit: number       // always positive; 0 when this row is a credit movement
  credit: number      // always positive; 0 when this row is a debit movement
  balance: number     // running balance after this row
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
  dateFrom: string   // YYYY-MM-DD
  dateTo: string     // YYYY-MM-DD
  openingBalance: number
  rows: LedgerRow[]
  totals: {
    totalDebits: number
    totalCredits: number
    closingBalance: number
  }
}

// ─── Normal balance convention ────────────────────────────────────────────────
// Assets / Expenses → debit-normal  (balance increases on debit, decreases on credit)
// Liabilities / Income / Equity / Transfer → credit-normal

function normalBalance(type: string): 'debit' | 'credit' {
  return ['asset', 'expense', 'cost_of_sales', 'other_expense'].includes(type.toLowerCase())
    ? 'debit'
    : 'credit'
}

// ─── Sign helpers ─────────────────────────────────────────────────────────────

/**
 * Return the signed delta this transaction applies to the category's running balance.
 * Positive = balance increases per the account's normal balance convention.
 */
function txSignedDelta(txType: string, amount: number, norm: 'debit' | 'credit'): number {
  const t = txType.toLowerCase()
  // income tx credits the income/asset account → increases credit-normal, decreases debit-normal
  if (t === 'income' || t === 'receipt')
    return norm === 'credit' ? amount : -amount
  // expense tx debits the expense/asset account → increases debit-normal, decreases credit-normal
  if (t === 'expense' || t === 'payment')
    return norm === 'debit' ? amount : -amount
  // opening_balance: stored signed (positive = asset side, negative = liability side)
  if (t === 'opening_balance')
    return norm === 'debit' ? amount : -amount
  // transfer: treat like an expense movement (DR asset, CR liability)
  if (t === 'transfer')
    return norm === 'debit' ? amount : -amount
  return amount
}

/**
 * Return the signed delta a journal line applies to the category's running balance.
 * DR increases debit-normal accounts; CR increases credit-normal accounts.
 */
function jlSignedDelta(side: string, amount: number, norm: 'debit' | 'credit'): number {
  if (side === 'debit')  return norm === 'debit'  ? amount : -amount
  if (side === 'credit') return norm === 'credit' ? amount : -amount
  return amount
}

// ─── tzMidnight helper (same approach as finance-fy.ts) ──────────────────────

function tzMidnight(dateStr: string, tz: string): Date {
  // Use noon-UTC anchor to find the UTC instant corresponding to
  // 00:00:00 of dateStr in the given IANA timezone.
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session  = await requireSession()
    const { id: categoryId } = await params
    const { searchParams } = new URL(req.url)

    // ── Fetch family for timezone + FY settings ───────────────────────────────
    const family = await prisma.family.findUnique({
      where: { id: session.familyId },
      select: { timezone: true, financeYearStartMonth: true },
    })
    const tz           = family?.timezone          ?? 'Australia/Sydney'
    const fyStartMonth = family?.financeYearStartMonth ?? 7

    // ── Resolve date range (default: current AU FY) ───────────────────────────
    let dateFrom: string
    let dateTo: string

    if (searchParams.get('from') && searchParams.get('to')) {
      dateFrom = searchParams.get('from')!
      dateTo   = searchParams.get('to')!
    } else {
      const now = new Date()
      // Derive today's date in AU timezone
      const localDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)
      const localYear    = parseInt(localDateStr.slice(0, 4), 10)
      const localMonth   = parseInt(localDateStr.slice(5, 7), 10)
      const fyYear       = fyStartYear(new Date(localYear, localMonth - 1, 1), fyStartMonth)
      const { start, end } = fyDateRangeInTz(fyYear, fyStartMonth, tz)
      dateFrom = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(start)
      dateTo   = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(end)
    }

    // Convert YYYY-MM-DD → UTC boundaries in the family timezone
    const periodStart = tzMidnight(dateFrom, tz)
    const periodEnd   = new Date(tzMidnight(dateTo, tz).getTime() + 86_400_000 - 1) // +23:59:59.999

    // ── Verify category belongs to this family ────────────────────────────────
    const category = await prisma.financeCategory.findFirst({
      where: { id: categoryId, familyId: session.familyId },
      select: { id: true, name: true, type: true, glCode: true, openingBalance: true },
    })
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    const norm = normalBalance(category.type ?? 'expense')

    // ── Opening balance ───────────────────────────────────────────────────────
    // Static field on the category PLUS all cleared pre-period transactions
    // against this category, PLUS all pre-period posted journal lines.

    let openingBalance = (category.openingBalance as number | null) ?? 0

    // Pre-period transactions (both categoryId and glAccountId routes)
    const preTxs = await prisma.financeTransaction.findMany({
      where: {
        familyId: session.familyId,
        isCleared: true,
        date: { lt: periodStart },
        OR: [
          { categoryId: category.id },
          { glAccountId: category.id },
        ],
      },
      select: { type: true, amount: true },
    })
    for (const tx of preTxs) {
      openingBalance += txSignedDelta(tx.type, tx.amount, norm)
    }

    // Pre-period posted journal lines
    const preJLines = await prisma.financeJournalLine.findMany({
      where: {
        glAccountId: category.id,
        journalEntry: {
          familyId: session.familyId,
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

    // ── In-period transactions ────────────────────────────────────────────────
    const transactions = await prisma.financeTransaction.findMany({
      where: {
        familyId: session.familyId,
        date: { gte: periodStart, lte: periodEnd },
        OR: [
          { categoryId: category.id },
          { glAccountId: category.id },
        ],
      },
      include: {
        vendor: { select: { name: true } },
        account: { select: { name: true } },
      },
      orderBy: { date: 'asc' },
    })

    // ── In-period posted journal lines ────────────────────────────────────────
    const journalLines = await prisma.financeJournalLine.findMany({
      where: {
        glAccountId: category.id,
        journalEntry: {
          familyId: session.familyId,
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
          },
        },
      },
      orderBy: { journalEntry: { date: 'asc' } },
    })

    // ── Build unified raw row list ─────────────────────────────────────────────

    type RawRow = {
      sortDate: number  // ms for sorting
      id: string
      date: string
      description: string
      reference: string | null
      source: 'transaction' | 'journal'
      sourceId: string
      signedDelta: number
      debit: number
      credit: number
      vendor: string | null
      isCleared: boolean
    }

    const rawRows: RawRow[] = []

    for (const tx of transactions) {
      const delta   = txSignedDelta(tx.type, tx.amount, norm)
      const isDebit = tx.type === 'expense' || tx.type === 'payment' || tx.type === 'opening_balance' || tx.type === 'transfer'
      rawRows.push({
        sortDate:    new Date(tx.date).getTime(),
        id:          tx.id,
        date:        new Date(tx.date).toISOString(),
        description: tx.description ?? tx.vendor?.name ?? tx.type,
        reference:   tx.reference ?? null,
        source:      'transaction',
        sourceId:    tx.id,
        signedDelta: delta,
        debit:       isDebit ? tx.amount : 0,
        credit:      isDebit ? 0 : tx.amount,
        vendor:      tx.vendor?.name ?? null,
        isCleared:   tx.isCleared,
      })
    }

    for (const jl of journalLines) {
      const delta   = jlSignedDelta(jl.side, jl.amount, norm)
      const isDebit = jl.side === 'debit'
      rawRows.push({
        sortDate:    new Date(jl.journalEntry.date).getTime(),
        id:          jl.id,
        date:        new Date(jl.journalEntry.date).toISOString(),
        description: jl.description ?? jl.journalEntry.description ?? `Journal ${jl.journalEntry.reference ?? ''}`,
        reference:   jl.journalEntry.reference ?? null,
        source:      'journal',
        sourceId:    jl.journalEntry.id,
        signedDelta: delta,
        debit:       isDebit ? jl.amount : 0,
        credit:      isDebit ? 0 : jl.amount,
        vendor:      null,
        isCleared:   true, // posted journal entries are always "cleared"
      })
    }

    // Sort by date asc; on same date transactions before journal lines
    rawRows.sort((a, b) => {
      if (a.sortDate !== b.sortDate) return a.sortDate - b.sortDate
      if (a.source === 'transaction' && b.source === 'journal') return -1
      if (a.source === 'journal' && b.source === 'transaction') return 1
      return 0
    })

    // ── Running balance ───────────────────────────────────────────────────────
    let running = openingBalance
    const rows: LedgerRow[] = rawRows.map(r => {
      running += r.signedDelta
      return {
        id:          r.id,
        date:        r.date,
        description: r.description,
        reference:   r.reference,
        source:      r.source,
        sourceId:    r.sourceId,
        debit:       Math.round(r.debit  * 100) / 100,
        credit:      Math.round(r.credit * 100) / 100,
        balance:     Math.round(running  * 100) / 100,
        vendor:      r.vendor,
        isCleared:   r.isCleared,
      }
    })

    const totalDebits  = rawRows.reduce((s, r) => s + r.debit,  0)
    const totalCredits = rawRows.reduce((s, r) => s + r.credit, 0)

    const response: LedgerResponse = {
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
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('[finance/categories/[id]/ledger] GET error:', err)
    return NextResponse.json({ error: 'Failed to load ledger' }, { status: 500 })
  }
}
