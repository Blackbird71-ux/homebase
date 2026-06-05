import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { getFamilyTimezone } from '@/lib/family'
import { endOfLocalDayUtc } from '@/lib/timezone'

// Timezone-aware start-of-day, mirroring endOfLocalDayUtc. Using new Date(dateStr)
// parses YYYY-MM-DD as UTC midnight, which for a UTC+10 user is 10:00 AEST —
// excluding journals posted 00:00–10:00 AEST on the first day of a period.
function asAtStartOfDay(dateStr: string, tz: string): Date {
  const [year, month1, day] = dateStr.split('-').map(Number)
  if (!year || !month1 || !day) return new Date(`${dateStr}T00:00:00.000Z`)
  try {
    const noonUtc = Date.UTC(year, month1 - 1, day, 12, 0, 0, 0)
    const fmt = new Intl.DateTimeFormat('en-AU', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(new Date(noonUtc))
    const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value)
    const tzY = get('year'), tzM = get('month'), tzD = get('day')
    const tzH = get('hour'), tzMin = get('minute'), tzS = get('second')
    const offsetMs = noonUtc - Date.UTC(tzY, tzM - 1, tzD, tzH, tzMin, tzS)
    const midnightUtc = Date.UTC(year, month1 - 1, day, 0, 0, 0, 0) + offsetMs
    return new Date(midnightUtc)
  } catch {
    return new Date(`${dateStr}T00:00:00.000Z`)
  }
}

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

export async function GET(request: NextRequest) {
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
  if (fromRaw) dateFilter.gte = asAtStartOfDay(fromRaw, tz)
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
    const openingBalance  = glAccount.openingBalance ?? 0
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
