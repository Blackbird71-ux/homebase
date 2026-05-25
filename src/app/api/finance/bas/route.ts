import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { fyStartYear, fyLabel, monthRangeInTz } from '@/lib/finance-fy'

// GET /api/finance/bas?from=YYYY-MM-DD&to=YYYY-MM-DD&entityId=xxx
//
// BAS Worksheet — Australian GST activity statement figures.
//
// All figures are sourced from posted FinanceJournalLine entries only.
// The same source as P&L, Trial Balance, and Balance Sheet — numbers agree.
//
// BAS fields:
//   G1  = Total sales (inc GST) = net income GL credits + 1A
//   1A  = GST collected on sales  = CR lines on "GST Collected" GL account
//   1B  = GST input tax credits   = DR lines on "GST Input Tax Credits" GL account
//   Net = 1A − 1B (payable to / refundable from ATO)

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function basQuarterRange(
  fyYear: number,
  fyStartMonth: number,
  qIdx: number,
  tz: string,
): { from: Date; to: Date; label: string } {
  // Build the start month of this quarter as absolute months from Jan of fyYear
  const startMonthAbs = (fyStartMonth - 1) + qIdx * 3
  const startCalYear  = fyYear + Math.floor(startMonthAbs / 12)
  const startMonth1   = (startMonthAbs % 12) + 1
  const endMonthAbs   = startMonthAbs + 2
  const endCalYear    = fyYear + Math.floor(endMonthAbs / 12)
  const endMonth1     = (endMonthAbs % 12) + 1

  const { start: from } = monthRangeInTz(startCalYear, startMonth1, tz)
  const { end:   to   } = monthRangeInTz(endCalYear,   endMonth1,   tz)

  const fyLbl = fyLabel(fyYear, fyStartMonth)
  const label = `Q${qIdx + 1} ${MONTHS[startMonth1 - 1]}–${MONTHS[endMonth1 - 1]} ${fyLbl}`
  return { from, to, label }
}

function currentBasQuarter(fyStartMonth: number, tz: string) {
  const now = new Date()
  const fyYear = fyStartYear(now, fyStartMonth)
  const todayM1 = now.getMonth() + 1
  const monthsFromFyStart = (todayM1 - fyStartMonth + 12) % 12
  const qIdx = Math.floor(monthsFromFyStart / 3)
  return basQuarterRange(fyYear, fyStartMonth, qIdx, tz)
}

export async function GET(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const fromRaw  = searchParams.get('from')
  const toRaw    = searchParams.get('to')
  const entityId = searchParams.get('entityId') ?? undefined
  const familyId = user.familyId

  const family = await prisma.family.findUnique({
    where:  { id: familyId },
    select: { financeYearStartMonth: true, timezone: true },
  })
  const fyStartMonth = family?.financeYearStartMonth ?? 7
  const tz           = family?.timezone ?? 'Australia/Sydney'

  let from: Date, to: Date, periodLabel: string
  if (fromRaw && toRaw) {
    from = new Date(fromRaw)
    to   = new Date(toRaw)
    periodLabel = `${fromRaw} to ${toRaw}`
  } else {
    const q = currentBasQuarter(fyStartMonth, tz)
    from = q.from
    to   = q.to
    periodLabel = q.label
  }

  // ── 1. GST system accounts ────────────────────────────────────────────────
  const gstAccounts = await prisma.financeCategory.findMany({
    where: {
      familyId,
      isSystem: true,
      name: { in: ['GST Collected', 'GST Input Tax Credits'] },
    },
    select: { id: true, name: true },
  })
  const gstCollectedAcct = gstAccounts.find(a => a.name === 'GST Collected')
  const gstItcAcct       = gstAccounts.find(a => a.name === 'GST Input Tax Credits')

  if (!gstCollectedAcct || !gstItcAcct) {
    return NextResponse.json({
      hasGstAccounts: false,
      error: 'GST accounts not found. Use Chart of Accounts to set up GST Collected and GST Input Tax Credits.',
    })
  }

  // ── 2. GST journal lines in period ────────────────────────────────────────
  const gstLines = await prisma.financeJournalLine.findMany({
    where: {
      glAccountId: { in: [gstCollectedAcct.id, gstItcAcct.id] },
      journalEntry: {
        familyId,
        isPosted: true,
        date: { gte: from, lte: to },
        ...(entityId ? { entityId } : {}),
      },
    },
    include: {
      glAccount: { select: { id: true, name: true } },
      journalEntry: {
        select: {
          id: true, reference: true, date: true, description: true, type: true,
          entity: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { journalEntry: { date: 'asc' } },
  })

  // ── 3. Income GL lines in period (for G1 calculation) ────────────────────
  const incomeLines = await prisma.financeJournalLine.findMany({
    where: {
      side: 'credit',
      glAccount: { familyId, type: 'income' },
      journalEntry: {
        familyId,
        isPosted: true,
        date: { gte: from, lte: to },
        ...(entityId ? { entityId } : {}),
      },
    },
    select: { amount: true },
  })

  // ── 4. Compute BAS figures ─────────────────────────────────────────────────
  interface GstLine {
    journalEntryId: string
    reference:      string | null
    date:           string
    description:    string
    entryType:      string
    glAccountId:    string
    glAccountName:  string
    amount:         number
    side:           string
    entityId:       string | null
    entityName:     string | null
  }

  let oneA = 0
  let oneB = 0
  const salesLines:    GstLine[] = []
  const purchaseLines: GstLine[] = []

  for (const line of gstLines) {
    const item: GstLine = {
      journalEntryId: line.journalEntry.id,
      reference:      line.journalEntry.reference ?? null,
      date:           line.journalEntry.date.toISOString().split('T')[0],
      description:    line.journalEntry.description,
      entryType:      line.journalEntry.type,
      glAccountId:    line.glAccountId,
      glAccountName:  line.glAccount.name,
      amount:         Math.round(line.amount * 100) / 100,
      side:           line.side,
      entityId:       line.journalEntry.entity?.id   ?? null,
      entityName:     line.journalEntry.entity?.name ?? null,
    }

    if (line.glAccountId === gstCollectedAcct.id && line.side === 'credit') {
      oneA += line.amount
      salesLines.push(item)
    } else if (line.glAccountId === gstItcAcct.id && line.side === 'debit') {
      oneB += line.amount
      purchaseLines.push(item)
    }
  }

  const r = (n: number) => Math.round(n * 100) / 100
  oneA = r(oneA)
  oneB = r(oneB)

  const netIncome = incomeLines.reduce((s, l) => s + l.amount, 0)
  const g1        = r(netIncome + oneA)   // total sales inc GST
  const netGst    = r(oneA - oneB)        // positive = payable to ATO; negative = refund

  return NextResponse.json({
    hasGstAccounts: true,
    period: {
      from:  from.toISOString().split('T')[0],
      to:    to.toISOString().split('T')[0],
      label: periodLabel,
    },
    summary: { g1, oneA, oneB, netGst },
    lines:   { sales: salesLines, purchases: purchaseLines },
    entityId: entityId ?? null,
  })
}
