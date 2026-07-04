import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { DEFAULT_TIMEZONE, localMidnightToUtc } from '@/lib/timezone'
import { currentFyContextInTz, fyLabel, monthRangeInTz } from '@/lib/finance-fy'
import {
  computeBasFigures,
  gstCollectedContribution,
  gstItcContribution,
} from '@/lib/finance-bas'

// GET /api/finance/bas?from=YYYY-MM-DD&to=YYYY-MM-DD&entityId=xxx
//
// BAS Worksheet — Australian GST activity statement figures.
//
// All figures are sourced from posted FinanceJournalLine entries only.
// The same source as P&L, Trial Balance, and Balance Sheet — numbers agree.
//
// Every figure nets BOTH debit and credit sides of the relevant accounts, so
// reversals/contra lines reduce the figure exactly as they do on the P&L. The
// arithmetic lives in src/lib/finance-bas.ts (computeBasFigures); detail lines
// below carry a SIGNED amount (negative on the contra side) so the on-screen
// line totals reconcile to these summary figures.
//
// BAS fields:
//   G1  = Total *taxable* sales (inc GST) = net gstApplicable income (CR − DR) + 1A
//   1A  = GST collected on sales  = "GST Collected" GL: credits − debits
//   1B  = GST input tax credits   = "GST Input Tax Credits" GL: debits − credits
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
  // "Now" must be read in the family tz, not the server's UTC clock: within the
  // UTC offset after a local quarter rollover, server-UTC still reports the prior
  // calendar month and hands an east-of-UTC family the previous BAS quarter (P9-FC-01).
  const { fyYear, month1: todayM1 } = currentFyContextInTz(fyStartMonth, tz)
  const monthsFromFyStart = (todayM1 - fyStartMonth + 12) % 12
  const qIdx = Math.floor(monthsFromFyStart / 3)
  return basQuarterRange(fyYear, fyStartMonth, qIdx, tz)
}

async function _GET(request: NextRequest) {
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
  const tz           = family?.timezone ?? DEFAULT_TIMEZONE

  let from: Date, to: Date, periodLabel: string
  if (fromRaw && toRaw) {
    // Interpret the supplied YYYY-MM-DD as local calendar days in the family tz:
    // from = local midnight of `fromRaw`; to = end of the local day `toRaw`.
    from = localMidnightToUtc(fromRaw, tz)
    to   = new Date(localMidnightToUtc(toRaw, tz).getTime() + 86_400_000 - 1)
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
  // Fetch BOTH sides: a reversal/contra debits the income account and must net
  // out of net income (and therefore G1), matching the P&L. Filtering to credits
  // only would overstate G1 by every reversed income amount.
  //
  // G1 = total *taxable* sales (inc GST), so only income categories flagged
  // gstApplicable feed it. Wages, bank interest, super etc. (gstApplicable=false)
  // are out-of-scope income and must NOT inflate G1. The income account holds the
  // ex-GST amount (GST is split to GST Collected), so g1 = netIncome + 1A below
  // yields GST-inclusive taxable supplies. NOTE: this binary flag has no separate
  // "GST-free supply" state, so genuinely GST-free sales would be excluded too —
  // acceptable for household finances, revisit if true GST-free sales appear.
  const incomeLines = await prisma.financeJournalLine.findMany({
    where: {
      glAccount: { familyId, type: 'income', gstApplicable: true },
      journalEntry: {
        familyId,
        isPosted: true,
        date: { gte: from, lte: to },
        ...(entityId ? { entityId } : {}),
      },
    },
    select: { amount: true, side: true },
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

  const salesLines:    GstLine[] = []
  const purchaseLines: GstLine[] = []

  // Detail lines: each row carries the SIGNED contribution to its BAS figure, so
  // a reversal/contra line shows as a negative amount and the page's positive sum
  // of line.amount reconciles to the summary figure below.
  for (const line of gstLines) {
    let signed: number
    if (line.glAccountId === gstCollectedAcct.id) {
      signed = gstCollectedContribution(line.side, line.amount)
    } else if (line.glAccountId === gstItcAcct.id) {
      signed = gstItcContribution(line.side, line.amount)
    } else {
      continue
    }

    const item: GstLine = {
      journalEntryId: line.journalEntry.id,
      reference:      line.journalEntry.reference ?? null,
      date:           line.journalEntry.date.toISOString().split('T')[0],
      description:    line.journalEntry.description,
      entryType:      line.journalEntry.type,
      glAccountId:    line.glAccountId,
      glAccountName:  line.glAccount.name,
      amount:         Math.round(signed * 100) / 100,
      side:           line.side,
      entityId:       line.journalEntry.entity?.id   ?? null,
      entityName:     line.journalEntry.entity?.name ?? null,
    }

    if (line.glAccountId === gstCollectedAcct.id) salesLines.push(item)
    else                                          purchaseLines.push(item)
  }

  // Summary figures — netted over both sides (reversals reduce each figure).
  const { g1, oneA, oneB, netGst } = computeBasFigures(
    gstLines.map(l => ({ glAccountId: l.glAccountId, side: l.side, amount: l.amount })),
    incomeLines,
    gstCollectedAcct.id,
    gstItcAcct.id,
  )

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

export const GET = withRouteErrors(_GET)
