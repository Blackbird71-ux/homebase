// =============================================================================
// finance-prepayment.ts
//
// Prepaid-and-amortise engine (audit Finding F3).
//
// A material prepayment — a bill whose net (ex-GST) cost ≥ the family's
// prepaymentThreshold AND whose coverage spans more than one month — must be
// capitalised to the "Prepaid Expenses" current-asset account at the tax point,
// then recognised as expense evenly over the coverage period. This mirrors the
// Xero / AASB-1031 treatment.
//
//   Tax point (bill received):
//     DR  Prepaid Expenses      net
//     DR  GST Input Tax Credits gst        (claimed in FULL at the tax point)
//     CR  Accounts Payable      gross
//
//   Each period over coverage (× periodCount):
//     DR  <expense GL>          net / periodCount
//     CR  Prepaid Expenses      net / periodCount
//
// This module owns the schedule maths and the GL posting for each period. It
// does NOT decide bill status, spawn occurrences, or touch transactions — the
// caller orchestrates that, exactly like finance-posting.ts.
//
// Posting cadence (product decision): MANUAL. Schedule lines are pre-computed at
// the tax point but only post when the user clicks "Post" for a period. There is
// no cron / on-read catch-up.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { nextJournalReference } from '@/lib/finance-journal-ref'
import { ensurePrepaidExpensesCategory, ensureGstAccounts, calcGst } from '@/lib/finance-opening-balance'
import type { TxClient } from '@/lib/finance-posting'

const BALANCE_EPSILON = 0.005

// ── Date helpers (UTC accounting dates by convention) ────────────────────────

/** Floor a date to UTC midnight of its calendar day. */
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Add n calendar months in UTC. Day-of-month is preserved where valid; the
 *  rare day-overflow (e.g. 31 Jan + 1 month) rolls forward per JS Date and is
 *  acceptable for amortisation accounting dates (coverage usually starts on the
 *  1st). */
function addMonthsUtc(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()))
}

/** Number of whole calendar months a [start, end] span touches, inclusive.
 *  2026-03-01 → 2027-02-28 = 12. */
function monthsBetweenInclusive(start: Date, end: Date): number {
  return (
    (end.getUTCFullYear() * 12 + end.getUTCMonth()) -
    (start.getUTCFullYear() * 12 + start.getUTCMonth()) + 1
  )
}

const round2 = (n: number) => Math.round(n * 100) / 100

// ── Coverage resolution ──────────────────────────────────────────────────────

/** Coverage months implied by a recurrence frequency. null = not amortisable on
 *  a monthly basis (weekly / fortnightly / custom), so such bills are never
 *  auto-eligible unless explicit coverage dates are supplied. Frequency strings
 *  match the canonical vocabulary in finance-recurrence-core.ts (stepOccurrence)
 *  — note the recurring vocabulary uses 'yearly', not 'annual'. */
function frequencyToMonths(frequency: string): number | null {
  switch (frequency) {
    case 'monthly':    return 1
    case 'bimonthly':  return 2
    case 'quarterly':  return 3
    case 'halfyearly': return 6
    case 'yearly':     return 12
    default:           return null // weekly | fortnightly | custom | unknown
  }
}

export interface ResolvedCoverage {
  start: Date
  end: Date
  months: number
}

/**
 * Resolve the coverage span for a bill.
 *  - If both coverageStart and coverageEnd are set (user override), use them and
 *    derive the month count from the span.
 *  - Otherwise auto-derive from the recurrence frequency, anchored at anchorDate
 *    (the bill / invoice date).
 * Returns null when no span can be determined (e.g. weekly bill, no override).
 */
export function resolveCoverage(params: {
  coverageStart: Date | null | undefined
  coverageEnd: Date | null | undefined
  frequency: string
  anchorDate: Date
}): ResolvedCoverage | null {
  const { coverageStart, coverageEnd, frequency, anchorDate } = params

  if (coverageStart && coverageEnd) {
    const start = utcMidnight(coverageStart)
    const end = utcMidnight(coverageEnd)
    const months = monthsBetweenInclusive(start, end)
    if (months < 1) return null
    return { start, end, months }
  }

  const months = frequencyToMonths(frequency)
  if (months == null) return null
  const start = utcMidnight(anchorDate)
  // Inclusive end = last day before the next period begins.
  const end = new Date(addMonthsUtc(start, months).getTime() - 86_400_000)
  return { start, end, months }
}

// ── Eligibility (materiality gate) ───────────────────────────────────────────

/** Materiality rule: net ≥ threshold AND coverage spans more than one period. */
export function isPrepaymentEligible(net: number, months: number, threshold: number): boolean {
  return net >= threshold && months > 1
}

// ── Amortisation schedule maths ──────────────────────────────────────────────

export interface ScheduleLineSpec {
  periodIndex: number
  periodDate: Date
  amount: number
}

/**
 * Even split of `net` across `months` periods starting at `coverageStart`. Every
 * period gets round2(net/months); the final period absorbs the cent remainder so
 * the line amounts sum to exactly `net`.
 */
export function buildAmortisationSchedule(
  net: number,
  coverageStart: Date,
  months: number,
): ScheduleLineSpec[] {
  const per = round2(net / months)
  const lines: ScheduleLineSpec[] = []
  for (let i = 0; i < months; i++) {
    const amount = i < months - 1 ? per : round2(net - per * (months - 1))
    lines.push({ periodIndex: i, periodDate: addMonthsUtc(coverageStart, i), amount })
  }
  return lines
}

// ── Tax-point preparation ────────────────────────────────────────────────────

/**
 * Net (ex-GST) amount to amortise for the DRAFT path: net = sum of the draft's
 * DEBIT lines that hit the bill's expense account (a GST-split draft carries
 * its ITC line separately). Falls back to gross when the draft is missing or
 * already posted. The no-draft path derives net from the category's GST
 * settings in prepareePrepaymentAtTaxPoint instead (audit F9).
 */
async function computePrepaymentNet(
  tx: TxClient,
  draftJournalEntryId: string | null | undefined,
  expenseAccountId: string,
  grossAmount: number,
): Promise<number> {
  if (!draftJournalEntryId) return grossAmount
  const draft = await tx.financeJournalEntry.findUnique({
    where: { id: draftJournalEntryId },
    include: { lines: true },
  })
  if (!draft || draft.isPosted) return grossAmount
  const expenseDebits = draft.lines
    .filter(l => l.side === 'debit' && l.glAccountId === expenseAccountId)
    .reduce((s, l) => s + l.amount, 0)
  return expenseDebits > 0 ? round2(expenseDebits) : grossAmount
}

/**
 * Repoint a draft journal's expense DEBIT line(s) from the expense account to the
 * Prepaid Expenses account, so that when postBillAccrualJournal promotes the
 * draft as-is the net is capitalised (the GST and AP lines are untouched).
 * Returns the number of lines repointed.
 */
async function redirectDraftExpenseToPrepaid(
  tx: TxClient,
  draftJournalEntryId: string,
  expenseAccountId: string,
  prepaidAccountId: string,
): Promise<number> {
  const res = await tx.financeJournalLine.updateMany({
    where: { journalEntryId: draftJournalEntryId, side: 'debit', glAccountId: expenseAccountId },
    data: { glAccountId: prepaidAccountId },
  })
  return res.count
}

export interface PreparedPrepayment {
  prepaidAccountId: string
  net: number
  /** GST derived from the expense category for the NO-DRAFT path (audit F9).
   *  0 when a draft carries its own split or the category is not gstApplicable.
   *  The caller must post DR ITC gstAmount alongside DR Prepaid net so the ITC
   *  is claimed in full at the tax point instead of amortised. */
  gstAmount: number
  /** GST Input Tax Credits account id — set iff gstAmount > 0. */
  gstItcAccountId: string | null
  coverageStart: Date
  coverageEnd: Date
  months: number
}

/**
 * Decide whether a bill being received qualifies as a prepayment and, if so,
 * prepare the tax-point accrual to capitalise to Prepaid Expenses.
 *
 * Must run INSIDE the caller's receipt $transaction and BEFORE
 * postBillAccrualJournal, because it repoints the draft journal that
 * postBillAccrualJournal promotes. Returns null when not eligible (caller posts
 * the ordinary DR Expense / CR AP accrual).
 *
 * On eligibility the caller must:
 *   1. Pass `prepaidAccountId` as postBillAccrualJournal's expenseGlAccountId
 *      (covers the no-draft fallback path).
 *   2. After the accrual posts and the bill is updated, call
 *      createPrepaymentSchedule with the returned figures.
 */
export async function prepareePrepaymentAtTaxPoint(
  tx: TxClient,
  params: {
    familyId: string
    expenseAccountId: string
    grossAmount: number
    frequency: string
    coverageStart: Date | null | undefined
    coverageEnd: Date | null | undefined
    anchorDate: Date
    threshold: number
    draftJournalEntryId: string | null | undefined
  },
): Promise<PreparedPrepayment | null> {
  const coverage = resolveCoverage({
    coverageStart: params.coverageStart,
    coverageEnd: params.coverageEnd,
    frequency: params.frequency,
    anchorDate: params.anchorDate,
  })
  if (!coverage) return null

  let net: number
  let gstAmount = 0

  if (params.draftJournalEntryId) {
    // Draft path: the draft carries its own GST split (if any); net = its
    // expense debits. Repointing below preserves the draft's ITC line as-is.
    net = await computePrepaymentNet(
      tx, params.draftJournalEntryId, params.expenseAccountId, params.grossAmount,
    )
  } else {
    // No-draft path (audit F9): there is no draft to carry a GST split, so
    // derive it from the expense category. Without this the GST-inclusive
    // gross is capitalised to Prepaid and amortised — BAS understates ITCs,
    // which must be claimed in full at the tax point.
    const category = await tx.financeCategory.findFirst({
      where: { id: params.expenseAccountId, familyId: params.familyId },
      select: { gstApplicable: true, gstRate: true },
    })
    if (category?.gstApplicable) {
      const { exGst, gst } = calcGst(params.grossAmount, category.gstRate)
      net = exGst
      gstAmount = gst
    } else {
      net = params.grossAmount
    }
  }

  if (!isPrepaymentEligible(net, coverage.months, params.threshold)) return null

  const prepaidAccountId = await ensurePrepaidExpensesCategory(params.familyId)

  let gstItcAccountId: string | null = null
  if (params.draftJournalEntryId) {
    await redirectDraftExpenseToPrepaid(
      tx, params.draftJournalEntryId, params.expenseAccountId, prepaidAccountId,
    )
  } else if (gstAmount > 0) {
    gstItcAccountId = (await ensureGstAccounts(params.familyId)).itcId
  }

  return {
    prepaidAccountId,
    net,
    gstAmount: gstItcAccountId ? gstAmount : 0,
    gstItcAccountId,
    coverageStart: coverage.start,
    coverageEnd: coverage.end,
    months: coverage.months,
  }
}

// ── Schedule persistence ─────────────────────────────────────────────────────

/**
 * Persist the prepayment schedule header + its (unposted) amortisation lines.
 * Call after the tax-point accrual has posted and the bill has been updated.
 */
export async function createPrepaymentSchedule(
  tx: TxClient,
  params: {
    familyId: string
    billId: string | null
    prepaidAccountId: string
    expenseAccountId: string
    description: string
    totalNet: number
    coverageStart: Date
    coverageEnd: Date
    months: number
  },
): Promise<string> {
  const lines = buildAmortisationSchedule(params.totalNet, params.coverageStart, params.months)
  const schedule = await tx.financePrepaymentSchedule.create({
    data: {
      familyId: params.familyId,
      billId: params.billId,
      prepaidAccountId: params.prepaidAccountId,
      expenseAccountId: params.expenseAccountId,
      description: params.description,
      totalNet: params.totalNet,
      coverageStart: params.coverageStart,
      coverageEnd: params.coverageEnd,
      periodCount: params.months,
      status: 'active',
      lines: {
        create: lines.map(l => ({
          periodIndex: l.periodIndex,
          periodDate: l.periodDate,
          amount: l.amount,
        })),
      },
    },
    select: { id: true },
  })
  return schedule.id
}

// ── Per-period posting (manual button) ───────────────────────────────────────

/**
 * Post a single amortisation period: DR <expense GL> / CR Prepaid Expenses for
 * the line amount, dated the period date. Idempotent guard: throws if the line
 * is already posted. Marks the line posted and flips the schedule to 'completed'
 * once every line is posted. Returns the posted journal entry id.
 *
 * Accepts a TxClient so the caller controls atomicity (line flag + GL write).
 */
export async function postAmortisationPeriod(
  tx: TxClient,
  params: { familyId: string; scheduleLineId: string },
): Promise<string> {
  const line = await tx.financePrepaymentScheduleLine.findUnique({
    where: { id: params.scheduleLineId },
    include: { schedule: true },
  })
  if (!line || line.schedule.familyId !== params.familyId) {
    throw new Error('Prepayment schedule line not found')
  }
  if (line.posted) {
    throw new Error('This amortisation period has already been posted')
  }
  if (line.schedule.status === 'cancelled') {
    throw new Error('Cannot post a period of a cancelled prepayment schedule')
  }

  const { schedule } = line
  const lines = [
    {
      glAccountId: schedule.expenseAccountId,
      side: 'debit' as const,
      amount: line.amount,
      description: `Amortisation ${line.periodIndex + 1}/${schedule.periodCount}: ${schedule.description}`,
    },
    {
      glAccountId: schedule.prepaidAccountId,
      side: 'credit' as const,
      amount: line.amount,
      description: `Prepaid release: ${schedule.description}`,
    },
  ]
  // Both legs equal — balanced by construction; defence-in-depth check.
  const dr = lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
  const cr = lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
  if (Math.abs(dr - cr) > BALANCE_EPSILON) {
    throw new Error(`Amortisation journal not balanced — DR ${dr} ≠ CR ${cr}`)
  }

  const reference = await nextJournalReference(params.familyId)
  const entry = await tx.financeJournalEntry.create({
    data: {
      reference,
      date: line.periodDate,
      description: `Prepayment amortisation: ${schedule.description}`,
      type: 'auto_transaction',
      isPosted: true,
      familyId: params.familyId,
      lines: { create: lines.map(l => ({ glAccountId: l.glAccountId, side: l.side, amount: l.amount, description: l.description })) },
    },
    select: { id: true },
  })

  await tx.financePrepaymentScheduleLine.update({
    where: { id: line.id },
    data: { posted: true, journalEntryId: entry.id, postedAt: new Date() },
  })

  const remaining = await tx.financePrepaymentScheduleLine.count({
    where: { scheduleId: schedule.id, posted: false },
  })
  if (remaining === 0) {
    await tx.financePrepaymentSchedule.update({
      where: { id: schedule.id },
      data: { status: 'completed' },
    })
  }

  return entry.id
}
