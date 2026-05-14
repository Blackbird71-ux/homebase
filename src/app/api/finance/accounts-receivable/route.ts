import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { deriveJournalLineBalances } from '@/lib/finance-opening-balance'
import { differenceInDays } from 'date-fns'

// GET /api/finance/accounts-receivable?asAt=YYYY-MM-DD
//
// AR Aging report — proper accounting approach:
//
//   GL control account  →  authoritative total (same source as Balance Sheet)
//   AR subledger        →  income entries where invoiceReceived=true AND not yet received as at date
//   Aging               →  days from invoiceReceivedDate to asAt
//   Reconciliation      →  subledger total must equal GL control account balance
//
// Aging buckets (from invoice date — standard AR practice):
//   0–30 days, 31–60 days, 61–90 days, 91+ days

type AgingBucket = '0_30' | '31_60' | '61_90' | '91_plus'

function ageBucket(invoiceDate: Date, asAt: Date): AgingBucket {
  const days = differenceInDays(asAt, invoiceDate)
  if (days <= 30)  return '0_30'
  if (days <= 60)  return '31_60'
  if (days <= 90)  return '61_90'
  return '91_plus'
}

function asAtEndOfDay(dateStr: string, tz: string): Date {
  const [year, month1, day] = dateStr.split('-').map(Number)
  if (!year || !month1 || !day) return new Date()
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
    return new Date(midnightUtc + 24 * 60 * 60 * 1000 - 1)
  } catch {
    const d = new Date(`${dateStr}T00:00:00.000Z`)
    d.setUTCHours(23, 59, 59, 999)
    return d
  }
}

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const asAtParam = searchParams.get('asAt')
  const familyId  = session.familyId

  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { timezone: true },
  })
  const tz = family?.timezone ?? 'Australia/Sydney'

  const asAt = asAtParam
    ? asAtEndOfDay(asAtParam, tz)
    : asAtEndOfDay(
        new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
        tz
      )

  // ── 1. GL control account balance ─────────────────────────────────────────
  // AR is an asset; normal balance = debit.
  // deriveJournalLineBalances returns positive netBalance when debits exceed credits.
  // The Balance Sheet shows Math.max(0, netBalance) for assets — we match that exactly
  // so the AR aging total always agrees with the Balance Sheet.
  const arCategory = await prisma.financeCategory.findFirst({
    where: { familyId, name: 'Accounts Receivable', type: 'asset', isSystem: true },
    select: { id: true },
  })

  let glArBalance = 0
  if (arCategory) {
    const journalBalances = await deriveJournalLineBalances(familyId, null, asAt)
    const netBalance = journalBalances.get(arCategory.id)?.netBalance ?? 0
    glArBalance = Math.round(Math.max(0, netBalance) * 100) / 100
  }

  // ── 2. AR subledger: income entries outstanding as at the report date ──────
  // An entry is outstanding if:
  //   • invoice was received on or before asAt (invoiceReceivedDate must be set)
  //   • it has not been received (received=false), OR was received strictly after asAt
  //     (the second branch requires received=true to avoid leaking stale data)
  // Entries with invoiceReceivedDate=null are excluded — data integrity issue —
  // surfaced via nullDateCount so the user can fix them.
  const entries = await prisma.financeIncomeEntry.findMany({
    where: {
      familyId,
      invoiceReceived: true,
      invoiceReceivedDate: { not: null, lte: asAt },
      OR: [
        { received: false },
        { received: true, receivedDate: { gt: asAt } },
      ],
    },
    select: {
      id:                  true,
      name:                true,
      amount:              true,
      invoiceReceivedDate: true,
      nextExpectedDate:    true,
      vendor:    { select: { id: true, name: true } },
      category:  { select: { id: true, name: true, color: true } },
      entity:    { select: { id: true, name: true } },
      journalEntry: { select: { reference: true } },
    },
    orderBy: { invoiceReceivedDate: 'asc' },
  })

  // Count entries with invoiceReceived=true but no date — data integrity warning.
  const nullDateCount = await prisma.financeIncomeEntry.count({
    where: {
      familyId,
      invoiceReceived: true,
      invoiceReceivedDate: null,
    },
  })

  // ── 3. Build per-item aging ───────────────────────────────────────────────
  // AR has no partial receipts — the full amount is either received or not.
  // Outstanding amount = entry.amount (no payment netting required).
  interface ArItem {
    id: string
    name: string
    amount: number
    invoiceDate: string
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

  const items: ArItem[] = entries.map(e => {
    const invoiceDate = e.invoiceReceivedDate!
    const days = differenceInDays(asAt, invoiceDate)
    return {
      id:               e.id,
      name:             e.name,
      amount:           Math.round(e.amount * 100) / 100,
      invoiceDate:      invoiceDate.toISOString(),
      daysSinceInvoice: Math.max(0, days),
      bucket:           ageBucket(invoiceDate, asAt),
      vendorId:         e.vendor?.id    ?? null,
      vendorName:       e.vendor?.name  ?? null,
      categoryId:       e.category?.id   ?? null,
      categoryName:     e.category?.name ?? null,
      categoryColor:    e.category?.color ?? null,
      entityId:         e.entity?.id   ?? null,
      entityName:       e.entity?.name ?? null,
      reference:        e.journalEntry?.reference ?? null,
    }
  })

  // ── 4. Group by payer (vendor) ────────────────────────────────────────────
  interface PayerRow {
    vendorId: string | null
    vendorName: string
    '0_30': number
    '31_60': number
    '61_90': number
    '91_plus': number
    total: number
    items: ArItem[]
  }

  const payerMap = new Map<string, PayerRow>()
  for (const item of items) {
    const key   = item.vendorId ?? '__none__'
    const label = item.vendorName ?? 'No payer'
    if (!payerMap.has(key)) {
      payerMap.set(key, { vendorId: item.vendorId, vendorName: label, '0_30': 0, '31_60': 0, '61_90': 0, '91_plus': 0, total: 0, items: [] })
    }
    const g = payerMap.get(key)!
    g[item.bucket] += item.amount
    g.total        += item.amount
    g.items.push(item)
  }

  const r = (n: number) => Math.round(n * 100) / 100
  const payers = Array.from(payerMap.values())
    .sort((a, b) => b.total - a.total)
    .map(v => ({
      ...v,
      '0_30':    r(v['0_30']),
      '31_60':   r(v['31_60']),
      '61_90':   r(v['61_90']),
      '91_plus': r(v['91_plus']),
      total:     r(v.total),
    }))

  // ── 5. Column totals ──────────────────────────────────────────────────────
  const subledgerTotal = r(items.reduce((s, i) => s + i.amount, 0))
  const totals = {
    '0_30':    r(items.filter(i => i.bucket === '0_30').reduce((s, i) => s + i.amount, 0)),
    '31_60':   r(items.filter(i => i.bucket === '31_60').reduce((s, i) => s + i.amount, 0)),
    '61_90':   r(items.filter(i => i.bucket === '61_90').reduce((s, i) => s + i.amount, 0)),
    '91_plus': r(items.filter(i => i.bucket === '91_plus').reduce((s, i) => s + i.amount, 0)),
    subledgerTotal,
  }

  const difference   = r(Math.abs(glArBalance - subledgerTotal))
  const isReconciled = difference < 0.01
  const oldestDays   = items.length > 0 ? Math.max(...items.map(i => i.daysSinceInvoice)) : 0

  return NextResponse.json({
    asAt:          asAtParam ?? new Date().toISOString().split('T')[0],
    hasArAccount:  !!arCategory,
    glArBalance,
    subledgerTotal,
    difference,
    isReconciled,
    oldestDays,
    itemCount:     items.length,
    nullDateCount,
    totals,
    payers,
  })
}
