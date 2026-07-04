import { withRouteErrors } from '@/lib/route-errors'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { getFamilyTimezone } from '@/lib/family'
import { todayStringInTz, endOfLocalDayUtc } from '@/lib/timezone'
import { deriveJournalLineBalances } from '@/lib/finance-opening-balance'
import { sumControlAccountLines } from '@/lib/finance-subledger'

// GET /api/finance/accounts-payable?asAt=YYYY-MM-DD
//
// AP Aging report — proper accounting approach:
//
//   GL control account  →  authoritative total (same source as Balance Sheet)
//   AP subledger        →  bills where invoiceReceived=true AND not yet paid as at date
//   Aging               →  days from invoiceReceivedDate to asAt
//   Reconciliation      →  subledger total must equal GL control account balance
//
// Aging buckets (from invoice date, not due date — standard AP practice):
//   0–30 days, 31–60 days, 61–90 days, 91+ days

type AgingBucket = '0_30' | '31_60' | '61_90' | '91_plus'

// Full days between two instants. The server runs UTC (no DST), so flooring the
// ms difference matches date-fns differenceInDays for these UTC-stored dates.
function fullDaysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000)
}

function ageBucket(invoiceDate: Date, asAt: Date): AgingBucket {
  const days = fullDaysBetween(asAt, invoiceDate)
  if (days <= 30)  return '0_30'
  if (days <= 60)  return '31_60'
  if (days <= 90)  return '61_90'
  return '91_plus'
}

async function _GET(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const asAtParam = searchParams.get('asAt')
  const entityId  = searchParams.get('entityId') ?? undefined
  const familyId  = user.familyId

  const tz = await getFamilyTimezone(familyId)

  const asAt = asAtParam
    ? endOfLocalDayUtc(asAtParam, tz)
    : endOfLocalDayUtc(
        new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
        tz
      )

  // ── 1. GL control account balance ─────────────────────────────────────────
  // AP is a liability; normal balance = credit.
  // deriveJournalLineBalances uses credit-positive convention for liabilities,
  // so a CR AP posting gives netBalance = +amount. No negation needed — matches
  // the Balance Sheet exactly.
  const apCandidates = await prisma.financeCategory.findMany({
    where: { familyId, type: 'liability', isSystem: true },
    select: { id: true, name: true },
  })
  const apCategory = apCandidates.find(c => c.name.toLowerCase().includes('accounts payable'))

  let glApBalance = 0
  if (apCategory) {
    const journalBalances = await deriveJournalLineBalances(familyId, null, asAt, entityId)
    const netBalance = journalBalances.get(apCategory.id)?.netBalance ?? 0
    glApBalance = Math.round(Math.max(0, netBalance) * 100) / 100
  }

  // ── 2. AP subledger: bills outstanding as at the report date ──────────────
  // A bill is outstanding if:
  //   • invoice was received on or before asAt (invoiceReceivedDate must be set)
  //   • it has not been paid (paid=false), OR was paid strictly after asAt
  //     (the second branch explicitly requires paid=true to avoid leaking bills
  //     that have a future paidDate but paid=false from stale data)
  // Bills with invoiceReceivedDate=null are excluded — they indicate a data
  // integrity issue (invoiceReceived=true but no date recorded) and will be
  // surfaced via the nullDateCount field so the user can fix them.
  const bills = await prisma.financeRecurringBill.findMany({
    where: {
      familyId,
      invoiceReceived: true,
      invoiceReceivedDate: { not: null, lte: asAt },
      isVoided: false,
      ...(entityId ? { entityId } : {}),
      OR: [
        { paid: false },
        { paid: true, paidDate: { gt: asAt } },
      ],
    },
    select: {
      id: true,
      name: true,
      amount: true,
      invoiceReceivedDate: true,
      nextDueDate: true,
      vendor:   { select: { id: true, name: true } },
      category: { select: { id: true, name: true, color: true } },
      entity:   { select: { id: true, name: true } },
      journalEntry: { select: { reference: true, lines: { select: { amount: true, glAccountId: true, side: true } } } },
      // Fetch payments so we can net off partial payments from the outstanding amount
      payments: {
        select: {
          amount: true,
          paymentDate: true,
          journalEntry: { select: { lines: { select: { amount: true, glAccountId: true, side: true } } } },
        },
      },
    },
    orderBy: { invoiceReceivedDate: 'asc' },
  })

  // Also count bills with invoiceReceived=true but no invoiceReceivedDate
  // so the UI can warn the user about data integrity issues.
  const nullDateCount = await prisma.financeRecurringBill.count({
    where: {
      familyId,
      invoiceReceived: true,
      invoiceReceivedDate: null,
      isVoided: false,
      ...(entityId ? { entityId } : {}),
    },
  })

  // ── 3. Build per-item aging ───────────────────────────────────────────────
  // Outstanding amount = original invoice amount minus any payments that were
  // made ON OR BEFORE asAt (payments after asAt don't count — the bill was
  // still open at that point in time).
  interface ApItem {
    id: string
    name: string
    originalAmount: number
    paymentsToDate: number
    amount: number          // outstanding balance = originalAmount − paymentsToDate
    invoiceDate: string
    nextDueDate: string | null
    daysSinceInvoice: number
    bucket: AgingBucket
    vendorId: string | null
    vendorName: string | null
    categoryId: string | null
    categoryName: string | null
    categoryColor: string | null
    entityId: string | null
    entityName: string | null
    reference: string | null
  }

  const items: ApItem[] = bills
    .map(b => {
      // invoiceReceivedDate is guaranteed non-null by the query filter above
      const invoiceDate = b.invoiceReceivedDate!

      // §12.10 (mirrored from AR): the AP face value is the sum of AP credit
      // lines on the accrual journal, not bill.amount — they differ when the
      // promoted journal has a custom split (e.g. CR AP + CR other). Fall back
      // to bill.amount only when no journal/AP lines exist.
      const accruedAp = sumControlAccountLines(b.journalEntry?.lines, apCategory?.id, 'credit', b.amount)

      // Sum only payments made on or before asAt. Per payment, use the AP
      // debit lines on its payment journal (what actually cleared AP); fall
      // back to the payment amount when no journal/AP lines exist (legacy
      // no-journal payments).
      const paymentsToDate = (b.payments ?? []).reduce((sum, p) => {
        const pDate = p.paymentDate instanceof Date ? p.paymentDate : new Date(p.paymentDate)
        if (pDate > asAt) return sum
        return sum + sumControlAccountLines(p.journalEntry?.lines, apCategory?.id, 'debit', p.amount)
      }, 0)

      const outstandingAmount = Math.round((accruedAp - paymentsToDate) * 100) / 100

      const days = fullDaysBetween(asAt, invoiceDate)
      return {
        id:               b.id,
        name:             b.name,
        // AP face value (keeps originalAmount − paymentsToDate = amount)
        originalAmount:   Math.round(accruedAp * 100) / 100,
        paymentsToDate:   Math.round(paymentsToDate * 100) / 100,
        amount:           outstandingAmount,
        invoiceDate:      invoiceDate.toISOString(),
        nextDueDate:      b.nextDueDate?.toISOString() ?? null,
        daysSinceInvoice: Math.max(0, days),
        bucket:           ageBucket(invoiceDate, asAt),
        vendorId:         b.vendor?.id    ?? null,
        vendorName:       b.vendor?.name  ?? null,
        categoryId:       b.category?.id   ?? null,
        categoryName:     b.category?.name ?? null,
        categoryColor:    b.category?.color ?? null,
        entityId:         b.entity?.id   ?? null,
        entityName:       b.entity?.name ?? null,
        reference:        b.journalEntry?.reference ?? null,
      }
    })
    // Exclude bills that are fully paid via partial payments (net balance ≤ 0)
    .filter(item => item.amount > 0.005)

  // ── 4. Group by vendor ────────────────────────────────────────────────────
  interface VendorRow {
    vendorId: string | null
    vendorName: string
    '0_30': number
    '31_60': number
    '61_90': number
    '91_plus': number
    total: number
    items: ApItem[]
  }

  const vendorMap = new Map<string, VendorRow>()
  for (const item of items) {
    const key   = item.vendorId ?? '__none__'
    const label = item.vendorName ?? 'No vendor'
    if (!vendorMap.has(key)) {
      vendorMap.set(key, { vendorId: item.vendorId, vendorName: label, '0_30': 0, '31_60': 0, '61_90': 0, '91_plus': 0, total: 0, items: [] })
    }
    const g = vendorMap.get(key)!
    g[item.bucket] += item.amount
    g.total        += item.amount
    g.items.push(item)
  }

  const vendors = Array.from(vendorMap.values())
    .sort((a, b) => b.total - a.total)
    .map(v => ({
      ...v,
      '0_30':    Math.round(v['0_30']    * 100) / 100,
      '31_60':   Math.round(v['31_60']   * 100) / 100,
      '61_90':   Math.round(v['61_90']   * 100) / 100,
      '91_plus': Math.round(v['91_plus'] * 100) / 100,
      total:     Math.round(v.total      * 100) / 100,
    }))

  // ── 5. Column totals ──────────────────────────────────────────────────────
  const r = (n: number) => Math.round(n * 100) / 100
  const subledgerTotal = r(items.reduce((s, i) => s + i.amount, 0))
  const totals = {
    '0_30':    r(items.filter(i => i.bucket === '0_30').reduce((s, i) => s + i.amount, 0)),
    '31_60':   r(items.filter(i => i.bucket === '31_60').reduce((s, i) => s + i.amount, 0)),
    '61_90':   r(items.filter(i => i.bucket === '61_90').reduce((s, i) => s + i.amount, 0)),
    '91_plus': r(items.filter(i => i.bucket === '91_plus').reduce((s, i) => s + i.amount, 0)),
    subledgerTotal,
  }

  const difference    = r(Math.abs(glApBalance - subledgerTotal))
  const isReconciled  = difference < 0.01

  // Oldest outstanding invoice (for summary card)
  const oldestDays = items.length > 0 ? Math.max(...items.map(i => i.daysSinceInvoice)) : 0

  return NextResponse.json({
    asAt:           asAtParam ?? todayStringInTz(tz),
    entityId:       entityId ?? null,
    hasApAccount:   !!apCategory,
    glApBalance,
    subledgerTotal,
    difference,
    isReconciled,
    oldestDays,
    itemCount:      items.length,
    nullDateCount,  // bills with invoiceReceived=true but missing invoiceReceivedDate
    totals,
    vendors,
  })
}

export const GET = withRouteErrors(_GET)
