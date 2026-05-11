import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { ensureAccountsPayableCategory } from '@/lib/finance-opening-balance'

const PAYMENT_INCLUDE = {
  account: { select: { id: true, name: true } },
  glAccount: { select: { id: true, name: true, color: true, type: true } },
  transaction: { select: { id: true, amount: true, date: true, isCleared: true } },
} as const

/**
 * GET /api/finance/bills/[id]/payments
 * Returns all payments for a bill, ordered by paymentDate desc.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  const { id: billId } = await params

  // Verify bill belongs to this family
  const bill = await prisma.financeRecurringBill.findFirst({
    where: { id: billId, familyId: session.familyId },
    select: { id: true },
  })
  if (!bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }

  const payments = await prisma.financeBillPayment.findMany({
    where: { billId, familyId: session.familyId },
    include: PAYMENT_INCLUDE,
    orderBy: { paymentDate: 'desc' },
  })

  return NextResponse.json(payments)
}

/**
 * POST /api/finance/bills/[id]/payments
 * Record a new partial payment against a bill.
 *
 * Request body:
 * {
 *   amount: number          // Required. Amount paid this installment
 *   paymentDate: string     // Required. ISO date string
 *   accountId?: string      // Bank account the payment came from
 *   glAccountId?: string    // GL category for balance sheet tracking
 *   notes?: string
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  const { id: billId } = await params

  const { amount, paymentDate, accountId, glAccountId, notes } = await request.json()

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Payment amount must be greater than 0' }, { status: 400 })
  }
  if (!paymentDate) {
    return NextResponse.json({ error: 'Payment date is required' }, { status: 400 })
  }

  // Verify bill exists and belongs to this family
  const bill = await prisma.financeRecurringBill.findFirst({
    where: { id: billId, familyId: session.familyId },
  })
  if (!bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }

  // Calculate total paid so far
  const existingPayments = await prisma.financeBillPayment.aggregate({
    where: { billId, familyId: session.familyId },
    _sum: { amount: true },
  })
  const totalPaid = existingPayments._sum.amount ?? 0
  const remainingBalance = bill.amount - totalPaid

  // Validate payment amount doesn't exceed remaining balance
  if (amount > remainingBalance) {
    return NextResponse.json({
      error: `Payment amount (${amount}) exceeds remaining balance (${remainingBalance.toFixed(2)})`,
    }, { status: 400 })
  }

  const actualDate = new Date(paymentDate)

  // ── Re-read the bill for invoiceTxId (fresh from DB) ────────────────────────
  const freshBill = await prisma.financeRecurringBill.findFirst({
    where: { id: billId, familyId: session.familyId },
  }) as any

  let transactionId: string | null = null

  // ── Create a FinanceTransaction for this payment ────────────────────────────
  // 
  // Accounting logic:
  //   Case A — Invoice was received first (uncleared invoice tx exists for full amount):
  //     Create a new cleared transaction for this partial payment amount.
  //     The uncleared invoice tx stays at full amount (expense already on P&L).
  //     The payment tx represents cash outflow, linked to the bank account.
  //   
  //   Case B — No prior invoice (direct payment):
  //     Create a cleared expense transaction for this partial payment amount.
  //     The expense hits P&L proportionally with each payment.
  try {
    const invoiceTxId: string | null = freshBill?.invoiceTxId ?? null
    const paymentAccountId = accountId ?? freshBill?.accountId ?? null

    if (invoiceTxId) {
      // Case A: Invoice existed — create a cleared payment transaction
      // This represents the cash leaving the bank account.
      // The uncleared invoice tx stays at full amount on P&L.
      const tx = await prisma.financeTransaction.create({
        data: {
          type: 'expense',
          amount,
          accountId: paymentAccountId,
          categoryId: bill.categoryId,
          description: `${bill.name} (partial payment)`,
          date: actualDate,
          isRecurring: false,
          recurringBillId: bill.id,
          vendorId: bill.vendorId,
          notes: notes ?? bill.notes,
          memberId: bill.memberId,
          locationId: bill.locationId,
          isCleared: true,
          reconciledDate: actualDate,
          isTransfer: false,
          glAccountId: glAccountId ?? null,
          createdBy: session.id,
          familyId: session.familyId,
          entityId: bill.entityId,
          taxClassification: (bill as any).taxClassification ?? null,
        },
      })
      transactionId = tx.id
    } else {
      // Case B: No prior invoice — create a cleared expense tx for this payment
      const tx = await prisma.financeTransaction.create({
        data: {
          type: 'expense',
          amount,
          accountId: paymentAccountId,
          categoryId: bill.categoryId,
          description: bill.name,
          date: actualDate,
          isRecurring: false,
          recurringBillId: bill.id,
          vendorId: bill.vendorId,
          notes: notes ?? bill.notes,
          memberId: bill.memberId,
          locationId: bill.locationId,
          isCleared: true,
          reconciledDate: actualDate,
          isTransfer: false,
          glAccountId: glAccountId ?? null,
          createdBy: session.id,
          familyId: session.familyId,
          entityId: bill.entityId,
          taxClassification: (bill as any).taxClassification ?? null,
        },
      })
      transactionId = tx.id
    }
  } catch (err) {
    console.error('[payments POST] Failed to create transaction:', err)
    return NextResponse.json({ error: 'Failed to create payment transaction' }, { status: 500 })
  }

  // ── Create the payment record ───────────────────────────────────────────────
  const payment = await prisma.financeBillPayment.create({
    data: {
      billId: bill.id,
      amount,
      paymentDate: actualDate,
      accountId: accountId ?? null,
      glAccountId: glAccountId ?? null,
      transactionId,
      notes: notes ?? null,
      createdBy: session.id,
      familyId: session.familyId,
    },
    include: PAYMENT_INCLUDE,
  })

  // ── Update bill paid/paidDate based on cumulative payments ──────────────────
  const newTotalPaid = totalPaid + amount
  const newPaid = newTotalPaid >= bill.amount
  const newPaidDate = newPaid ? actualDate : null // Use latest payment date

  // For the paidDate, use the most recent payment date (not just the current one)
  const latestPayment = await prisma.financeBillPayment.findFirst({
    where: { billId: bill.id, familyId: session.familyId },
    orderBy: { paymentDate: 'desc' },
    select: { paymentDate: true },
  })

  await prisma.financeRecurringBill.update({
    where: { id: bill.id },
    data: {
      paid: newPaid,
      paidDate: latestPayment?.paymentDate ?? null,
    },
  })

  // ── If fully paid, spawn next occurrence for recurring bills ────────────────
  if (newPaid && bill.billType !== 'one-off') {
    try {
      const { addMonths, addWeeks } = await import('date-fns')
      const advanceNextDueDate = (date: Date, frequency: string): Date => {
        if (frequency === 'monthly')     return addMonths(date, 1)
        if (frequency === 'fortnightly') return addWeeks(date, 2)
        if (frequency === 'weekly')      return addWeeks(date, 1)
        if (frequency === 'quarterly')   return addMonths(date, 3)
        if (frequency === 'yearly')      return addMonths(date, 12)
        return addMonths(date, 1)
      }

      const newDueDate = advanceNextDueDate(bill.nextDueDate, bill.frequency)
      if (!bill.endDate || newDueDate <= bill.endDate) {
        await prisma.financeRecurringBill.create({
          data: {
            name: bill.name,
            amount: bill.amount,
            accountId: bill.accountId,
            categoryId: bill.categoryId,
            vendorId: bill.vendorId,
            frequency: bill.frequency,
            dayOfMonth: bill.dayOfMonth,
            monthOfYear: bill.monthOfYear,
            nextDueDate: newDueDate,
            endDate: bill.endDate,
            isActive: bill.isActive,
            autoPay: bill.autoPay,
            emailReminder: bill.emailReminder,
            reminderDays: bill.reminderDays,
            notes: bill.notes,
            memberId: bill.memberId,
            locationId: bill.locationId,
            billType: bill.billType,
            recurrenceInterval: bill.recurrenceInterval,
            invoiceReceived: false,
            invoiceReceivedDate: null,
            paid: false,
            paidDate: null,
            parentBillId: bill.id,
            entityId: bill.entityId,
            taxClassification: (bill as any).taxClassification ?? null,
            familyId: session.familyId,
          },
        })
      }
    } catch (err) {
      console.error('[payments POST] Failed to spawn next occurrence:', err)
    }
  }

  return NextResponse.json(payment, { status: 201 })
}
