import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { deriveJournalLineBalances } from '@/lib/finance-opening-balance'
import { postAmortisationPeriod } from '@/lib/finance-prepayment'

// =============================================================================
// GET  /api/finance/prepayments
//   Lists every prepayment amortisation schedule for the family with its lines
//   (posted / unposted), plus the authoritative GL "Prepaid Expenses" balance
//   and a reconciliation against the unposted-line subledger total.
//
//   Prepaid Expenses is a current asset (debit-positive). At the tax point the
//   net is capitalised (DR Prepaid). Each posted amortisation period releases a
//   slice (CR Prepaid). So:
//       GL Prepaid balance  ==  Σ unposted schedule-line amounts
//   when every prepaid movement originates from a schedule. A non-zero
//   `difference` flags manual journals or opening balances touching Prepaid.
//
// POST /api/finance/prepayments   { scheduleLineId }
//   Posts one amortisation period (manual "Post now"): DR <expense> / CR Prepaid.
// =============================================================================

const round2 = (n: number) => Math.round(n * 100) / 100

async function _GET(_request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const familyId = user.familyId

  // ── GL control: Prepaid Expenses balance (asset, debit-positive) ───────────
  // Look the account up rather than ensure-create it — a report GET must not
  // write. If no prepayment has ever been capitalised the account may not exist
  // yet, in which case the balance is simply 0.
  const prepaidCandidates = await prisma.financeCategory.findMany({
    where: { familyId, type: 'asset', isSystem: true },
    select: { id: true, name: true },
  })
  const prepaidAccount = prepaidCandidates.find(c => c.name.toLowerCase().includes('prepaid expenses'))
  let glPrepaidBalance = 0
  if (prepaidAccount) {
    const journalBalances = await deriveJournalLineBalances(familyId, null, null)
    glPrepaidBalance = round2(journalBalances.get(prepaidAccount.id)?.netBalance ?? 0)
  }

  // ── Schedules + lines ──────────────────────────────────────────────────────
  const schedules = await prisma.financePrepaymentSchedule.findMany({
    where: { familyId },
    orderBy: { createdAt: 'desc' },
    include: {
      lines: {
        orderBy: { periodIndex: 'asc' },
        include: { journalEntry: { select: { reference: true } } },
      },
    },
  })

  let subledgerRemaining = 0
  const shaped = schedules.map(s => {
    const postedTotal = round2(
      s.lines.filter(l => l.posted).reduce((sum, l) => sum + l.amount, 0),
    )
    const remainingTotal = round2(
      s.lines.filter(l => !l.posted).reduce((sum, l) => sum + l.amount, 0),
    )
    subledgerRemaining += remainingTotal
    return {
      id: s.id,
      description: s.description,
      billId: s.billId,
      totalNet: s.totalNet,
      coverageStart: s.coverageStart,
      coverageEnd: s.coverageEnd,
      periodCount: s.periodCount,
      status: s.status,
      postedTotal,
      remainingTotal,
      lines: s.lines.map(l => ({
        id: l.id,
        periodIndex: l.periodIndex,
        periodDate: l.periodDate,
        amount: l.amount,
        posted: l.posted,
        postedAt: l.postedAt,
        journalReference: l.journalEntry?.reference ?? null,
      })),
    }
  })
  subledgerRemaining = round2(subledgerRemaining)

  const difference = round2(glPrepaidBalance - subledgerRemaining)

  return NextResponse.json({
    glPrepaidBalance,
    subledgerRemaining,
    difference,
    reconciled: Math.abs(difference) < 0.005,
    schedules: shaped,
  })
}

async function _POST(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const familyId = user.familyId

  let body: { scheduleLineId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const scheduleLineId = typeof body.scheduleLineId === 'string' ? body.scheduleLineId : null
  if (!scheduleLineId) {
    return NextResponse.json({ error: 'scheduleLineId is required' }, { status: 400 })
  }

  // nextJournalReference (inside postAmortisationPeriod) derives the next JE-N
  // from MAX; concurrent posts can collide on @@unique([familyId, reference])
  // → P2002. Retry a few times before surfacing the conflict.
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const journalEntryId = await prisma.$transaction(async (tx) =>
        postAmortisationPeriod(tx, { familyId, scheduleLineId }),
      )
      return NextResponse.json({ ok: true, journalEntryId })
    } catch (err: unknown) {
      lastErr = err
      const code = (err as { code?: string })?.code
      if (code === 'P2002') continue // reference collision — retry
      const message = err instanceof Error ? err.message : 'Failed to post amortisation period'
      if (message.includes('not found')) {
        return NextResponse.json({ error: message }, { status: 404 })
      }
      if (message.includes('already been posted') || message.includes('cancelled')) {
        return NextResponse.json({ error: message }, { status: 409 })
      }
      return NextResponse.json({ error: message }, { status: 422 })
    }
  }
  const message = lastErr instanceof Error ? lastErr.message : 'Reference collision — please retry'
  return NextResponse.json({ error: message }, { status: 409 })
}

export const GET = withRouteErrors(_GET)
export const POST = withRouteErrors(_POST)
