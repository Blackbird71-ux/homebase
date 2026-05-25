import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'

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

  const from = fromRaw ? new Date(fromRaw) : (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d })()
  const to   = toRaw   ? new Date(toRaw)   : new Date()

  // Verify the vendor belongs to this family
  const vendor = await prisma.financeVendor.findFirst({
    where: { id: vendorId, familyId },
    select: { id: true, name: true },
  })
  if (!vendor) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
  }

  if (type === 'ap') {
    return buildApStatement(familyId, vendor, from, to)
  } else {
    return buildArStatement(familyId, vendor, from, to)
  }
}

// ── AP: Creditor statement ────────────────────────────────────────────────────

async function buildApStatement(
  familyId: string,
  vendor: { id: string; name: string },
  from: Date,
  to: Date,
) {
  // All bills for this vendor that affect the period (invoiced or paid on/before `to`)
  const bills = await prisma.financeRecurringBill.findMany({
    where: {
      familyId,
      vendorId:     vendor.id,
      invoiceReceived: true,
      invoiceReceivedDate: { not: null, lte: to },
    },
    select: {
      id: true, name: true, amount: true,
      invoiceReceivedDate: true,
      journalEntry: { select: { reference: true } },
      payments: {
        select: { id: true, amount: true, paymentDate: true },
        orderBy: { paymentDate: 'asc' },
      },
    },
    orderBy: { invoiceReceivedDate: 'asc' },
  })

  // Opening balance: invoices before `from`, net of payments also before `from`
  let openingBalance = 0
  for (const bill of bills) {
    const invDate = bill.invoiceReceivedDate!
    if (invDate >= from) continue  // invoice is in-period or later — not in opening balance
    const paidBefore = bill.payments
      .filter(p => new Date(p.paymentDate) < from)
      .reduce((s, p) => s + p.amount, 0)
    const outstanding = bill.amount - paidBefore
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
        amount:      bill.amount,
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
          amount:      p.amount,
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
      from: from.toISOString().split('T')[0],
      to:   to.toISOString().split('T')[0],
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
) {
  const entries = await prisma.financeIncomeEntry.findMany({
    where: {
      familyId,
      vendorId:           vendor.id,
      invoiceReceived:    true,
      invoiceReceivedDate: { not: null, lte: to },
    },
    select: {
      id: true, name: true, amount: true, actualAmountReceived: true,
      invoiceReceivedDate: true,
      received: true, receivedDate: true,
      journalEntry: { select: { reference: true } },
    },
    orderBy: { invoiceReceivedDate: 'asc' },
  })

  // Opening balance: invoices before `from`, net of receipts also before `from`
  let openingBalance = 0
  for (const entry of entries) {
    const invDate = entry.invoiceReceivedDate!
    if (invDate >= from) continue
    if (entry.received && entry.receivedDate && new Date(entry.receivedDate) < from) continue
    // Invoice was issued before `from` and not yet received before `from`
    openingBalance += entry.amount
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
        amount:      entry.amount,
      })
    }
    if (entry.received && entry.receivedDate) {
      const rd = new Date(entry.receivedDate)
      if (rd >= from && rd <= to) {
        const receiptAmt = entry.actualAmountReceived ?? entry.amount
        events.push({
          date:        rd,
          type:        'receipt',
          id:          `${entry.id}_receipt`,
          description: `Receipt — ${entry.name}`,
          reference:   entry.journalEntry?.reference ?? null,
          amount:      receiptAmt,
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
      from: from.toISOString().split('T')[0],
      to:   to.toISOString().split('T')[0],
    },
    openingBalance,
    lines,
    closingBalance,
  })
}
