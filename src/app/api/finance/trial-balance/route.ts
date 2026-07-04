import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { getFamilyTimezone } from '@/lib/family'
import { localMidnightToUtc, endOfLocalDayUtc } from '@/lib/timezone'

// GET /api/finance/trial-balance
//
// Query params:
//   from=YYYY-MM-DD        — period start (optional; all-time if omitted)
//   to=YYYY-MM-DD          — period end   (optional)
//   entityId=              — filter to one entity (optional)
//   glAccountId=           — if present: return General Ledger for this account
//
// Returns either:
//   { mode: 'trial-balance', accounts, grandTotalDebit, grandTotalCredit, isBalanced, ... }
//   { mode: 'general-ledger', glAccount, lines, openingBalance, closingBalance, ... }

async function _GET(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)

  const familyId    = user.familyId
  const fromRaw     = searchParams.get('from')
  const toRaw       = searchParams.get('to')
  const entityId    = searchParams.get('entityId') ?? undefined
  const glAccountId = searchParams.get('glAccountId') ?? undefined

  // Load family timezone so date boundaries are correct for AU users.
  // The NAS runs UTC; setHours(23,59,59) on a UTC server means 2pm AEST,
  // cutting off same-day journal entries posted after that time.
  const tz = await getFamilyTimezone(familyId)

  // Build date filter for journal entries — use timezone-aware end-of-day
  const dateFilter: any = {}
  if (fromRaw) dateFilter.gte = localMidnightToUtc(fromRaw, tz)
  if (toRaw)   dateFilter.lte = endOfLocalDayUtc(toRaw, tz)

  const journalEntryFilter: any = {
    familyId,
    isPosted: true,
    ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
    ...(entityId ? { entityId } : {}),
  }

  // ── GENERAL LEDGER MODE ──────────────────────────────────────────────────
  if (glAccountId) {
    const glAccount = await prisma.financeCategory.findFirst({
      where: { id: glAccountId, familyId },
      select: {
        id: true, name: true, type: true, glCode: true,
        openingBalance: true, openingBalanceDate: true,
        parentId: true,
        parent: { select: { name: true } },
      },
    })
    if (!glAccount) {
      return NextResponse.json({ error: 'GL account not found' }, { status: 404 })
    }

    // All posted journal lines for this account — GL is the single source of truth
    const journalLines = await prisma.financeJournalLine.findMany({
      where: {
        glAccountId,
        journalEntry: journalEntryFilter,
      },
      include: {
        journalEntry: {
          select: {
            id: true, reference: true, date: true,
            description: true, type: true,
          },
        },
      },
      orderBy: [
        { journalEntry: { date: 'asc' } },
        { journalEntry: { createdAt: 'asc' } },
      ],
    })

    type LedgerLine = {
      id: string; date: string; reference: string; description: string
      type: 'journal'; entryType: string
      debit: number; credit: number; lineDescription: string | null
    }

    const entries: LedgerLine[] = journalLines.map(l => ({
      id:              l.id,
      date:            l.journalEntry.date.toISOString(),
      reference:       l.journalEntry.reference ?? '',
      description:     l.journalEntry.description,
      type:            'journal',
      entryType:       l.journalEntry.type,
      debit:           l.side === 'debit'  ? l.amount : 0,
      credit:          l.side === 'credit' ? l.amount : 0,
      lineDescription: l.description ?? null,
    }))

    // Running balance — normal balance side determines sign
    // Assets & Expenses: DR increases, CR decreases
    // Liabilities, Equity, Income: CR increases, DR decreases
    const normalDebitSide = ['asset', 'expense'].includes(glAccount.type)

    // Opening balance = net of all posted lines BEFORE the period start (mirrors
    // the category ledger). COA opening balances are journalised
    // (type='opening_balance'), so they are captured here when dated before
    // `from`; the static glAccount.openingBalance field is a display mirror only
    // and must NOT be seeded as well — that would double-count the journalised
    // opening entry. With no `from`, the opening JE falls inside the range and
    // shows as a dated line, so the seed is 0.
    let openingBalance = 0
    if (dateFilter.gte) {
      const priorLines = await prisma.financeJournalLine.findMany({
        where: {
          glAccountId,
          journalEntry: {
            familyId,
            isPosted: true,
            date: { lt: dateFilter.gte },
            ...(entityId ? { entityId } : {}),
          },
        },
        select: { side: true, amount: true },
      })
      for (const l of priorLines) {
        openingBalance += normalDebitSide
          ? (l.side === 'debit' ? l.amount : -l.amount)
          : (l.side === 'credit' ? l.amount : -l.amount)
      }
      openingBalance = Math.round(openingBalance * 100) / 100
    }
    let running = openingBalance

    const ledgerLines = entries.map(e => {
      const movement = normalDebitSide
        ? e.debit - e.credit
        : e.credit - e.debit
      running += movement
      return {
        ...e,
        movement: Math.round(movement * 100) / 100,
        balance:  Math.round(running  * 100) / 100,
      }
    })

    const totalDebit  = Math.round(entries.reduce((s, e) => s + e.debit,  0) * 100) / 100
    const totalCredit = Math.round(entries.reduce((s, e) => s + e.credit, 0) * 100) / 100

    return NextResponse.json({
      mode: 'general-ledger',
      glAccount: {
        id:           glAccount.id,
        name:         glAccount.name,
        type:         glAccount.type,
        glCode:       glAccount.glCode,
        parentName:   (glAccount as any).parent?.name ?? null,
        openingBalance,
      },
      openingBalance,
      closingBalance: Math.round(running * 100) / 100,
      totalDebit,
      totalCredit,
      lines: ledgerLines,
      from: fromRaw ?? null,
      to:   toRaw   ?? null,
    })
  }

  // ── TRIAL BALANCE MODE ───────────────────────────────────────────────────

  // Fetch all posted journal lines in range
  const journalLines = await prisma.financeJournalLine.findMany({
    where: { journalEntry: journalEntryFilter },
    include: {
      glAccount: {
        select: {
          id: true, name: true, type: true, glCode: true,
          parentId: true,
          parent: { select: { id: true, name: true } },
        },
      },
    },
  })

  // Aggregate by GL account
  const accountMap = new Map<string, {
    id: string; name: string; type: string; glCode: string | null
    parentId: string | null; parentName: string | null
    totalDebit: number; totalCredit: number
  }>()

  for (const line of journalLines) {
    const acct = line.glAccount
    if (!accountMap.has(acct.id)) {
      accountMap.set(acct.id, {
        id:          acct.id,
        name:        acct.name,
        type:        acct.type,
        glCode:      acct.glCode,
        parentId:    acct.parentId,
        parentName:  (acct as any).parent?.name ?? null,
        totalDebit:  0,
        totalCredit: 0,
      })
    }
    const entry = accountMap.get(acct.id)!
    if (line.side === 'debit')  entry.totalDebit  += line.amount
    if (line.side === 'credit') entry.totalCredit += line.amount
  }

  // Sort: asset → liability → equity → income → expense → transfer, then GL code/name
  const typeOrder: Record<string, number> = {
    asset: 1, liability: 2, equity: 3, income: 4, expense: 5, transfer: 6,
  }

  const accounts = Array.from(accountMap.values())
    .filter(a => a.totalDebit > 0.005 || a.totalCredit > 0.005)
    .sort((a, b) => {
      const diff = (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9)
      if (diff !== 0) return diff
      if (a.glCode && b.glCode) return a.glCode.localeCompare(b.glCode, undefined, { numeric: true })
      return a.name.localeCompare(b.name)
    })
    .map(a => ({
      ...a,
      totalDebit:  Math.round(a.totalDebit  * 100) / 100,
      totalCredit: Math.round(a.totalCredit * 100) / 100,
      netBalance:  Math.round((a.totalDebit - a.totalCredit) * 100) / 100,
    }))

  const grandTotalDebit  = Math.round(accounts.reduce((s, a) => s + a.totalDebit,  0) * 100) / 100
  const grandTotalCredit = Math.round(accounts.reduce((s, a) => s + a.totalCredit, 0) * 100) / 100
  const difference       = Math.round(Math.abs(grandTotalDebit - grandTotalCredit) * 100) / 100
  const isBalanced       = difference < 0.01

  return NextResponse.json({
    mode: 'trial-balance',
    accounts,
    grandTotalDebit,
    grandTotalCredit,
    isBalanced,
    difference,
    from: fromRaw ?? null,
    to:   toRaw   ?? null,
  })
}

export const GET = withRouteErrors(_GET)
