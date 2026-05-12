import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { currentFyYear, fyDateRangeInTz, monthRangeInTz, quarterRangeInTz } from '@/lib/finance-fy'

// ── Helpers ──────────────────────────────────────────────────────────────

function toPeriodAmount(amount: number, frequency: string, periodMonths: number): number {
  // Used ONLY for weekly / fortnightly / monthly — frequencies that genuinely
  // recur within any given period. Lump-sum frequencies (yearly, halfyearly,
  // quarterly) must NOT be averaged; they are filtered separately.
  let timesPerMonth: number
  if (frequency === 'weekly')           timesPerMonth = 52 / 12
  else if (frequency === 'fortnightly') timesPerMonth = 26 / 12
  else                                   timesPerMonth = 1  // monthly and fallback
  return amount * timesPerMonth * periodMonths
}

/** True for frequencies that deliver a lump sum on a specific date, not every period. */
function isLumpSum(frequency: string): boolean {
  return frequency === 'yearly' || frequency === 'halfyearly' || frequency === 'quarterly'
}

/**
 * Compute period start/end using the family's IANA timezone (P2 fix #2).
 * All boundaries are UTC instants corresponding to midnight / end-of-day in
 * the family's timezone — correct regardless of the NAS system timezone.
 */
function getPeriodBounds(
  period: string,
  anchor: Date,
  fyStartMonth: number,
  tz: string,
): { start: Date; end: Date; periodMonths: number } {
  // Use the anchor date's local calendar year/month as the reference,
  // but compute the actual UTC boundaries in the family's timezone.
  const year  = anchor.getFullYear()
  const month = anchor.getMonth() + 1 // 1-based

  if (period === 'month') {
    const { start, end } = monthRangeInTz(year, month, tz)
    return { start, end, periodMonths: 1 }
  }
  if (period === 'quarter') {
    const { start, end } = quarterRangeInTz(year, month, tz)
    return { start, end, periodMonths: 3 }
  }
  // year — FY-aware using the family's timezone
  const fyYear    = currentFyYear(fyStartMonth)
  const fyOffset  = month < fyStartMonth ? 1 : 0
  const startYear = fyYear - fyOffset
  const { start, end } = fyDateRangeInTz(startYear, fyStartMonth, tz)
  return { start, end, periodMonths: 12 }
}

// ── Route ────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)

  const entityId = searchParams.get('entityId') ?? undefined
  const period = searchParams.get('period') ?? 'month'
  const anchorRaw = searchParams.get('anchor')

  const anchor = anchorRaw ? new Date(anchorRaw) : new Date()
  const familyId = session.familyId

  // Load family's financial year start month AND timezone (P2 fix #2)
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { financeYearStartMonth: true, timezone: true },
  })
  const fyStartMonth = family?.financeYearStartMonth ?? 7
  const tz = family?.timezone ?? 'Australia/Sydney'

  const { start, end, periodMonths } = getPeriodBounds(period, anchor, fyStartMonth, tz)

  const entityFilter = entityId ? { entityId } : {}

  // ── 1. Entities (for tabs) ─────────────────────────────────────────────
  const entities = await prisma.financeEntity.findMany({
    where: { familyId },
    select: { id: true, name: true, type: true, isDefault: true },
    orderBy: { name: 'asc' },
  })

  // ── 2. Bills (recurring planned expenses) ─────────────────────────────
  const bills = await prisma.financeRecurringBill.findMany({
    where: { familyId, isActive: true, ...entityFilter },
    include: {
      category: { select: { id: true, name: true, color: true, type: true } },
      payments: { select: { amount: true, paymentDate: true } },
    },
    // journalEntryId is a scalar field on the model — include it for dedup below
  })

  // ── 3. Income entries (recurring planned income) ──────────────────────
  // Include ALL active income entries. Entries that have a journal entry will also
  // contribute via the journal lines scan in step 5. Deduplication is handled in
  // step 6 and 7: if an income entry's linked journal entry falls in the period,
  // the entry itself is excluded from the entries pathway (it will appear via the
  // journalIncomeByCategory map instead, under the correct GL account name).
  const incomeEntries = await prisma.financeIncomeEntry.findMany({
    where: { familyId, isActive: true, ...entityFilter },
    include: { category: { select: { id: true, name: true, color: true } } },
  })

  // ── 4. Journal line balances for expense / income GL accounts ─────────
  // P0 fix: posted journal entries (e.g. depreciation, accruals) now feed the P&L.
  const journalExpenseByCategory = new Map<string, { name: string; color: string | null; total: number }>()
  const journalIncomeByCategory  = new Map<string, { name: string; color: string | null; total: number }>()

  const journalLines = await prisma.financeJournalLine.findMany({
    where: {
      journalEntry: {
        familyId,
        isPosted: true,
        date: { gte: start, lte: end },
        ...(entityId ? { entityId } : {}),
      },
      glAccount: {
        type: { in: ['expense', 'income'] },
      },
    },
    include: {
      glAccount: { select: { id: true, name: true, type: true, color: true } },
    },
  })

  for (const line of journalLines) {
    const acct = line.glAccount
    let netAmount: number
    if (acct.type === 'expense') {
      netAmount = line.side === 'debit' ? line.amount : -line.amount
    } else {
      netAmount = line.side === 'credit' ? line.amount : -line.amount
    }

    if (acct.type === 'expense') {
      const existing = journalExpenseByCategory.get(acct.id)
      if (existing) {
        existing.total += netAmount
      } else {
        journalExpenseByCategory.set(acct.id, { name: acct.name, color: (acct as any).color ?? null, total: netAmount })
      }
    } else {
      const existing = journalIncomeByCategory.get(acct.id)
      if (existing) {
        existing.total += netAmount
      } else {
        journalIncomeByCategory.set(acct.id, { name: acct.name, color: (acct as any).color ?? null, total: netAmount })
      }
    }
  }

  const startTs = start.getTime()
  const endTs   = end.getTime()

  // ── 6. Deduplication sets ─────────────────────────────────────────────
  // Bills/income entries that have a linked posted journal entry in the period
  // are handled exclusively via the journalXxxByCategory maps (step 4).
  // Exclude them from the entries/bills pathways to avoid double-counting.
  const journalEntryIdsInPeriod = new Set(
    journalLines.map(l => l.journalEntryId)
  )

  const incomeEntryIdsWithJournalInPeriod = new Set<string>()
  for (const e of incomeEntries) {
    const jeId = (e as any).journalEntryId as string | null
    if (jeId && journalEntryIdsInPeriod.has(jeId)) {
      incomeEntryIdsWithJournalInPeriod.add(e.id)
    }
  }

  const billIdsWithJournalInPeriod = new Set<string>()
  for (const b of bills) {
    const jeId = (b as any).journalEntryId as string | null
    if (jeId && journalEntryIdsInPeriod.has(jeId)) {
      billIdsWithJournalInPeriod.add(b.id)
    }
  }

  // ── 7. Filter income entries within period ────────────────────────────
  //
  // ACCRUAL BASIS: income is recognised when the invoice/remittance is received
  // (invoiceReceived=true), not when cash arrives or when it is merely scheduled.
  // Entries whose linked journal entry falls in this period are handled exclusively
  // by journalIncomeByCategory (step 4) to avoid double-counting.
  const relevantIncome = incomeEntries.filter(e => {
    if (!e.isActive) return false
    // Handled by journalIncomeByCategory — don't also count the entry
    if (incomeEntryIdsWithJournalInPeriod.has(e.id)) return false
    // Must have been invoice-received (accrual recognition point)
    if (!e.invoiceReceived || !e.invoiceReceivedDate) return false
    const recognisedTs = new Date(e.invoiceReceivedDate).getTime()
    return recognisedTs >= startTs && recognisedTs <= endTs
  })

  // ── 8. Filter bills within period ─────────────────────────────────────
  //
  // ACCRUAL BASIS: expense is recognised when the invoice is received
  // (invoiceReceived=true), not when payment is made or when the bill is
  // merely scheduled. Bills that have a cleared transaction in the period
  // are handled exclusively by journalExpenseByCategory (step 4) and excluded here.
  const relevantExpenses = bills.filter(b => {
    if (!b.isActive) return false
    if (b.category?.type === 'transfer' || b.category?.type === 'income') return false
    if (b.billType === 'transfer') return false
    // Handled by journalExpenseByCategory — don't also count the bill
    if (billIdsWithJournalInPeriod.has(b.id)) return false
    // Must have been invoice-received (accrual recognition point)
    if (!b.invoiceReceived || !b.invoiceReceivedDate) return false
    const recognisedTs = new Date(b.invoiceReceivedDate).getTime()
    return recognisedTs >= startTs && recognisedTs <= endTs
  })

  // ── 9. Group income ───────────────────────────────────────────────────
  const incomeMap = new Map<string, { key: string; label: string; color: string | null; totalPeriod: number; count: number; items: any[]; isJournal?: boolean }>()

  for (const e of relevantIncome) {
    const key   = e.category?.id ?? '__none__'
    const label = e.category?.name ?? 'Uncategorised'
    const color = e.category?.color ?? null
    if (!incomeMap.has(key)) incomeMap.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
    const g = incomeMap.get(key)!
    // Accrual basis: income is included because its invoice/remittance date falls
    // in the period. Use the actual amount — no period-spreading.
    const periodAmt = e.amount
    g.totalPeriod += periodAmt
    g.count++
    g.items.push({
      id: e.id, name: e.name, amount: e.amount, periodAmount: periodAmt,
      isOneOff: true, received: e.received ?? false,
      date: e.invoiceReceivedDate
        ? e.invoiceReceivedDate.toISOString().split('T')[0]
        : e.nextExpectedDate.toISOString().split('T')[0],
      source: 'entry',
    })
  }

  for (const [catId, data] of journalIncomeByCategory) {
    if (data.total <= 0) continue
    const key = `__journal_income_${catId}__`
    if (!incomeMap.has(key)) incomeMap.set(key, { key, label: data.name, color: data.color, totalPeriod: 0, count: 0, items: [], isJournal: true })
    const g = incomeMap.get(key)!
    g.totalPeriod += data.total
    g.count++
    g.items.push({
      id: catId, name: data.name, amount: data.total, periodAmount: data.total,
      isOneOff: true, received: true, date: start.toISOString().split('T')[0], source: 'journal',
    })
  }

  // ── 10. Group expenses ────────────────────────────────────────────────
  const expenseMap = new Map<string, { key: string; label: string; color: string | null; totalPeriod: number; count: number; items: any[]; isJournal?: boolean }>()

  for (const b of relevantExpenses) {
    const key   = b.category?.id ?? '__none__'
    const label = b.category?.name ?? 'Uncategorised'
    const color = b.category?.color ?? null
    if (!expenseMap.has(key)) expenseMap.set(key, { key, label, color, totalPeriod: 0, count: 0, items: [] })
    const g = expenseMap.get(key)!
    // Accrual basis: bill is included because its invoice date falls in the period.
    // Use the actual bill amount — no period-spreading. Each bill occurrence is one
    // discrete recognised expense at its invoice date.
    const periodAmt = b.amount
    g.totalPeriod += periodAmt
    g.count++
    g.items.push({
      id: b.id, name: b.name, amount: b.amount, periodAmount: periodAmt,
      isOneOff: true, paid: b.paid ?? false,
      date: b.invoiceReceivedDate
        ? b.invoiceReceivedDate.toISOString().split('T')[0]
        : b.nextDueDate.toISOString().split('T')[0],
      source: 'bill',
    })
  }

  for (const [catId, data] of journalExpenseByCategory) {
    if (data.total <= 0) continue
    const key = `__journal_expense_${catId}__`
    if (!expenseMap.has(key)) expenseMap.set(key, { key, label: data.name, color: data.color, totalPeriod: 0, count: 0, items: [], isJournal: true })
    const g = expenseMap.get(key)!
    g.totalPeriod += data.total
    g.count++
    g.items.push({
      id: catId, name: data.name, amount: data.total, periodAmount: data.total,
      isOneOff: true, paid: true, date: start.toISOString().split('T')[0], source: 'journal',
    })
  }

  // ── 11. Totals ─────────────────────────────────────────────────────────
  const incomeGroups  = Array.from(incomeMap.values()).sort((a, b) => b.totalPeriod - a.totalPeriod)
  const expenseGroups = Array.from(expenseMap.values()).sort((a, b) => b.totalPeriod - a.totalPeriod)

  const totalIncome   = incomeGroups.reduce((s, g) => s + g.totalPeriod, 0)
  const totalExpenses = expenseGroups.reduce((s, g) => s + g.totalPeriod, 0)

  let estimatedTax = 0
  for (const e of relevantIncome) {
    if (e.isTaxTracked && e.taxRate != null) {
      const isOneOff = e.incomeType === 'one-off'
      const periodAmt = isOneOff ? e.amount : toPeriodAmount(e.amount, e.frequency, periodMonths)
      estimatedTax += periodAmt * (e.taxRate / 100)
    }
  }

  const netProfit = totalIncome - totalExpenses - estimatedTax

  // ── 12. Label ─────────────────────────────────────────────────────────
  const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz })
  const label = `${fmt(start)} \u2013 ${fmt(end)}`

  return NextResponse.json({
    incomeGroups,
    expenseGroups,
    totalIncome,
    totalExpenses,
    estimatedTax,
    netProfit,
    period,
    label,
    from: start.toISOString().split('T')[0],
    to:   end.toISOString().split('T')[0],
    entities,
  })
}
