import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { DEFAULT_TIMEZONE, localMidnightToUtc, monthBoundsInTz } from '@/lib/timezone'
import { sumControlAccountLines } from '@/lib/finance-subledger'

// GET /api/finance/vendor-statement?vendorId=xxx&type=ap&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Creditor Statement (type=ap)  — shows all invoices and payments for a vendor.
// Debtor Statement   (type=ar)  — shows all invoices issued to and receipts from a payer.
//
// Statement structure:
//   Opening balance  — outstanding amount as at the day before `from`
//   Transactions     — invoices (+) and payments/receipts (−) in [from, to]
//   Closing balance  — opening + in-period charges − in-period payments
//
// Data sources:
//   AP: FinanceRecurringBill (invoices) + FinanceBillPayment (payments)
//   AR: FinanceIncomeEntry   (invoices) + receivedDate/actualAmountReceived (receipts)
//
// Charge/payment figures are sourced from the POSTED journal lines on the AP/AR
// control account (sumControlAccountLines), not the nominal record amount, so
// the statement reconciles with the AP/AR aging reports and the Balance Sheet
// even when a journal carries a custom split (§12.10). The nominal amount is
// used only as a fallback for legacy records with no journal.

export async function GET(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const vendorId = searchParams.get('vendorId')
  const type     = searchParams.get('type') === 'ar' ? 'ar' : 'ap'
  const fromRaw  = searchParams.get('from')
  const toRaw    = searchParams.get('to')
  const familyId = user.familyId

  if (!vendorId) {
    return NextResponse.json({ error: 'vendorId is required' }, { status: 400 })
  }

  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { timezone: true },
  })
  const tz = family?.timezone ?? DEFAULT_TIMEZONE

  // Interpret from/to as local calendar days in the family tz:
  // from = local midnight of `fromRaw` (default: first of the current local month);
  // to   = end of the local day `toRaw`  (default: now).
  const from = fromRaw ? localMidnightToUtc(fromRaw, tz) : monthBoundsInTz(tz).start
  const to   = toRaw   ? new Date(localMidnightToUtc(toRaw, tz).getTime() + 86_400_000 - 1) : new Date()

  // Verify the vendor belongs to this family
  const vendor = await prisma.financeVendor.findFirst({
    where: { id: vendorId, familyId },
    select: { id: true, name: true },
  })
  if (!vendor) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  if (type === 'ap') {
    return buildApStatement(familyId, vendor, from, to, tz)
  } else {
    return buildArStatement(familyId, vendor, from, to, tz)
  }
}

// ── AP: Creditor statement ────────────────────────────────────────────────────

async function buildApStatement(
  familyId: string,
  vendor: { id: string; name: string },
  from: Date,
  to: Date,
  tz: string,
) {
  // Accounts Payable control account — charge/payment figures come from its
  // journal lines (see §12.10 note above).
  const apCandidates = await prisma.financeCategory.findMany({
    where: { familyId, type: 'liability', isSystem: true },
    select: { id: true, name: true },
  })
  const apCategory = apCandidates.find(c => c.name.toLowerCase().includes('accounts payable'))

  // All bills for this vendor that affect the period (invoiced or paid on/before `to`)
  const bills = await prisma.financeRecurringBill.findMany({
    where: {
      familyId,
      vendorId:     vendor.id,
      isVoided:     false,   // voided bills carry a reversed journal and must not appear (mirrors AP aging)
      invoiceReceived: true,
      invoiceReceivedDate: { not: null, lte: to },
    },
    select: {
      id: true, name: true, amount: true,
      invoiceReceivedDate: true,
      journalEntry: { select: { reference: true, lines: { select: { glAccountId: true, side: true, amount: true } } } },
      payments: {
        select: {
          id: true, amount: true, paymentDate: true,
          journalEntry: { select: { lines: { select: { glAccountId: true, side: true, amount: true } } } },
        },
        orderBy: { paymentDate: 'asc' },
      },
    },
    orderBy: { invoiceReceivedDate: 'asc' },
  })

  // Charge = CR AP lines on the accrual journal (fallback bill.amount).
  // Payment = DR AP lines on each payment's journal (fallback payment.amount).
  const billCharge = (bill: typeof bills[number]) =>
    sumControlAccountLines(bill.journalEntry?.lines, apCategory?.id, 'credit', bill.amount)
  const paymentCleared = (p: typeof bills[number]['payments'][number]) =>
    sumControlAccountLines(p.journalEntry?.lines, apCategory?.id, 'debit', p.amount)

  // Opening balance: invoices before `from`, net of payments also before `from`
  let openingBalance = 0
  for (const bill of bills) {
    const invDate = bill.invoiceReceivedDate!
    if (invDate >= from) continue  // invoice is in-period or later — not in opening balance
    const paidBefore = bill.payments
      .filter(p => new Date(p.paymentDate) < from)
      .reduce((s, p) => s + paymentCleared(p), 0)
    const outstanding = billCharge(bill) - paidBefore
    if (outstanding > 0.005) openingBalance += outstanding
  }
  openingBalance = Math.round(openingBalance * 100) / 100

  interface StatementLine {
    id:          string
    date:        string
    type:        'invoice' | 'payment'
    description: string
    reference:   string | null
    charges:     number | null   // invoice amount (increases balance)
    payments:    number | null   // payment amount (decreases balance)
    balance:     number
  }

  const lines: StatementLine[] = []
  let runningBalance = openingBalance

  // Collect all in-period events (invoices and payments) into a flat list, then sort by date
  interface RawEvent {
    date:        Date
    type:        'invoice' | 'payment'
    id:          string
    description: string
    reference:   string | null
    amount:      number
  }
  const events: RawEvent[] = []

  for (const bill of bills) {
    const invDate = bill.invoiceReceivedDate!
    // In-period invoices
    if (invDate >= from && invDate <= to) {
      events.push({
        date:        invDate,
        type:        'invoice',
        id:          bill.id,
        description: bill.name,
        reference:   bill.journalEntry?.reference ?? null,
        amount:      billCharge(bill),
      })
    }
    // In-period payments (for any bill, including pre-period invoices)
    for (const p of bill.payments) {
      const pd = new Date(p.paymentDate)
      if (pd >= from && pd <= to) {
        events.push({
          date:        pd,
          type:        'payment',
          id:          p.id,
          description: `Payment — ${bill.name}`,
          reference:   bill.journalEntry?.reference ?? null,
          amount:      paymentCleared(p),
        })
      }
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime())

  for (const ev of events) {
    if (ev.type === 'invoice') {
      runningBalance += ev.amount
      lines.push({
        id:          ev.id,
        date:        ev.date.toISOString().split('T')[0],
        type:        'invoice',
        description: ev.description,
        reference:   ev.reference,
        charges:     Math.round(ev.amount * 100) / 100,
        payments:    null,
        balance:     Math.round(runningBalance * 100) / 100,
      })
    } else {
      runningBalance -= ev.amount
      lines.push({
        id:          ev.id,
        date:        ev.date.toISOString().split('T')[0],
        type:        'payment',
        description: ev.description,
        reference:   ev.reference,
        charges:     null,
        payments:    Math.round(ev.amount * 100) / 100,
        balance:     Math.round(runningBalance * 100) / 100,
      })
    }
  }

  const closingBalance = Math.round(runningBalance * 100) / 100

  return NextResponse.json({
    vendor,
    type: 'ap',
    period: {
      from: from.toLocaleDateString('en-CA', { timeZone: tz }),
      to:   to.toLocaleDateString('en-CA', { timeZone: tz }),
    },
    openingBalance,
    lines,
    closingBalance,
  })
}

// ── AR: Debtor statement ──────────────────────────────────────────────────────

async function buildArStatement(
  familyId: string,
  vendor: { id: string; name: string },
  from: Date,
  to: Date,
  tz: string,
) {
  // Accounts Receivable control account — charge/receipt figures come from its
  // journal lines (see §12.10 note above).
  const arCandidates = await prisma.financeCategory.findMany({
    where: { familyId, type: 'asset', isSystem: true },
    select: { id: true, name: true },
  })
  const arCategory = arCandidates.find(c => c.name.toLowerCase().includes('accounts receivable'))

  const entries = await prisma.financeIncomeEntry.findMany({
    where: {
      familyId,
      vendorId:           vendor.id,
      isVoided:           false,   // voided entries carry a reversed journal and must not appear (mirrors AR aging)
      invoiceReceived:    true,
      invoiceReceivedDate: { not: null, lte: to },
    },
    select: {
      id: true, name: true, amount: true, actualAmountReceived: true,
      invoiceReceivedDate: true,
      received: true, receivedDate: true,
      journalEntry:        { select: { reference: true, lines: { select: { glAccountId: true, side: true, amount: true } } } },
      receiptJournalEntry: { select: { lines: { select: { glAccountId: true, side: true, amount: true } } } },
    },
    orderBy: { invoiceReceivedDate: 'asc' },
  })

  // Charge = DR AR lines on the accrual journal (fallback entry.amount).
  // Receipt = CR AR lines on the receipt journal (fallback actualAmountReceived
  // ?? entry.amount). AR has no partial receipts — an entry is open or cleared.
  const entryCharge = (entry: typeof entries[number]) =>
    sumControlAccountLines(entry.journalEntry?.lines, arCategory?.id, 'debit', entry.amount)
  const entryReceipt = (entry: typeof entries[number]) =>
    sumControlAccountLines(
      entry.receiptJournalEntry?.lines, arCategory?.id, 'credit',
      entry.actualAmountReceived ?? entry.amount,
    )

  // Opening balance: invoices before `from`, net of receipts also before `from`
  let openingBalance = 0
  for (const entry of entries) {
    const invDate = entry.invoiceReceivedDate!
    if (invDate >= from) continue
    if (entry.received && entry.receivedDate && new Date(entry.receivedDate) < from) continue
    // Invoice was issued before `from` and not yet received before `from`
    openingBalance += entryCharge(entry)
  }
  openingBalance = Math.round(openingBalance * 100) / 100

  interface StatementLine {
    id:          string
    date:        string
    type:        'invoice' | 'receipt'
    description: string
    reference:   string | null
    charges:     number | null
    payments:    number | null
    balance:     number
  }

  const lines: StatementLine[] = []
  let runningBalance = openingBalance

  interface RawEvent {
    date:        Date
    type:        'invoice' | 'receipt'
    id:          string
    description: string
    reference:   string | null
    amount:      number
  }
  const events: RawEvent[] = []

  for (const entry of entries) {
    const invDate = entry.invoiceReceivedDate!
    if (invDate >= from && invDate <= to) {
      events.push({
        date:        invDate,
        type:        'invoice',
        id:          entry.id,
        description: entry.name,
        reference:   entry.journalEntry?.reference ?? null,
        amount:      entryCharge(entry),
      })
    }
    if (entry.received && entry.receivedDate) {
      const rd = new Date(entry.receivedDate)
      if (rd >= from && rd <= to) {
        events.push({
          date:        rd,
          type:        'receipt',
          id:          `${entry.id}_receipt`,
          description: `Receipt — ${entry.name}`,
          reference:   entry.journalEntry?.reference ?? null,
          amount:      entryReceipt(entry),
        })
      }
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime())

  for (const ev of events) {
    if (ev.type === 'invoice') {
      runningBalance += ev.amount
      lines.push({
        id:          ev.id,
        date:        ev.date.toISOString().split('T')[0],
        type:        'invoice',
        description: ev.description,
        reference:   ev.reference,
        charges:     Math.round(ev.amount * 100) / 100,
        payments:    null,
        balance:     Math.round(runningBalance * 100) / 100,
      })
    } else {
      runningBalance -= ev.amount
      lines.push({
        id:          ev.id,
        date:        ev.date.toISOString().split('T')[0],
        type:        'receipt',
        description: ev.description,
        reference:   ev.reference,
        charges:     null,
        payments:    Math.round(ev.amount * 100) / 100,
        balance:     Math.round(runningBalance * 100) / 100,
      })
    }
  }

  const closingBalance = Math.round(runningBalance * 100) / 100

  return NextResponse.json({
    vendor,
    type: 'ar',
    period: {
      from: from.toLocaleDateString('en-CA', { timeZone: tz }),
      to:   to.toLocaleDateString('en-CA', { timeZone: tz }),
    },
    openingBalance,
    lines,
    closingBalance,
  })
}
