import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { ensureAccountsPayableCategory } from '@/lib/finance-opening-balance'
import { nextJournalReference } from '@/lib/finance-journal-ref'
import { addMonths, addWeeks, max } from 'date-fns'

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

  // bill already has all fields — no need for a separate freshBill query (Bug 5 fix)
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
    const invoiceTxId: string | null = bill.invoiceTxId ?? null
    const paymentAccountId = accountId ?? bill.accountId ?? null

    if (invoiceTxId) {
      // Case A: Invoice existed — create a cleared payment transaction
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
          taxClassification: bill.taxClassification ?? null,
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
          taxClassification: bill.taxClassification ?? null,
        },
      })
      transactionId = tx.id
    }
  } catch (err) {
    console.error('[payments POST] Failed to create transaction:', err)
    return NextResponse.json({ error: 'Failed to create payment transaction' }, { status: 500 })
  }

  // ── Post GL journal: DR AP / CR Bank (partial payment) ─────────────────────
  //
  // Accounting: each partial payment clears a portion of Accounts Payable and
  // credits the bank/cash GL account for the amount paid.
  //
  //   DR  Accounts Payable    amount   (reduces the liability)
  //   CR  Bank GL Account     amount   (reduces the asset — cash left the bank)
  //
  // This is the same double-entry as the full-payment Stage 2 path in bills/route.ts.
  // Without this journal, partial payments are invisible to the Trial Balance,
  // Balance Sheet (AP remains overstated), and AP Aging reconciliation.
  //
  // If no glAccountId is provided the journal is skipped and a warning is
  // returned to the caller so the UI can surface it to the user.
  let glWarning: string | null = null
  let postedPaymentJournalId: string | null = null
  if (glAccountId && bill.categoryId) {
    try {
      const apCategoryId = await ensureAccountsPayableCategory(session.familyId)

      // Validate both GL accounts exist for this family
      const valid = await prisma.financeCategory.findMany({
        where: { id: { in: [apCategoryId, glAccountId] }, familyId: session.familyId },
        select: { id: true },
      })
      if (valid.length === 2) {
        const MAX_RETRIES = 10
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          const reference = await nextJournalReference(session.familyId)
          try {
            const je = await prisma.financeJournalEntry.create({
              data: {
                reference,
                date: actualDate,
                description: `Partial payment: ${bill.name}`,
                type: 'auto_transaction',
                isPosted: true,
                entityId: bill.entityId ?? null,
                familyId: session.familyId,
                lines: {
                  create: [
                    {
                      glAccountId: apCategoryId,
                      side: 'debit',
                      amount,
                      description: `Clear AP (partial): ${bill.name}`,
                    },
                    {
                      glAccountId,
                      side: 'credit',
                      amount,
                      description: `Partial payment: ${bill.name}`,
                    },
                  ],
                },
              },
              select: { id: true },
            })
            postedPaymentJournalId = je.id
            break // success
          } catch (err: any) {
            if (err.code === 'P2002' && attempt < MAX_RETRIES - 1) continue
            throw err
          }
        }
      } else {
        console.warn('[payments POST] GL account(s) not found for family — skipping GL journal')
        glWarning = 'GL account not found — AP not cleared in ledger for this payment'
      }
    } catch (err) {
      console.error('[payments POST] Failed to post GL journal for partial payment:', err)
      glWarning = 'GL journal could not be posted — AP not cleared in ledger for this payment'
    }
  } else {
    // No GL account selected — AP will not be cleared in the ledger for this payment.
    // The bill is still recorded as partially paid in the subledger.
    console.warn(
      `[payments POST] No glAccountId for partial payment on bill ${bill.id} — ` +
      `AP will not be cleared in the GL. Set glAccountId to get a GL journal entry.`,
    )
    glWarning = 'No GL account selected — AP not cleared in ledger. Select a GL account to record the full double-entry.'
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
      journalEntryId: postedPaymentJournalId,
      notes: notes ?? null,
      createdBy: session.id,
      familyId: session.familyId,
    },
    include: PAYMENT_INCLUDE,
  })

  // ── Update bill paid/paidDate based on cumulative payments ──────────────────
  const newTotalPaid = totalPaid + amount
  const newPaid = newTotalPaid >= bill.amount

  // For the paidDate, use the most recent payment date
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
  let spawnWarning: string | null = null
  if (newPaid && bill.billType !== 'one-off') {
    try {
      // Use max(bill.nextDueDate, today) to prevent spawning an already-overdue bill (Bug 4 fix)
      const referenceDate = max([bill.nextDueDate, new Date()])
      const advanceNextDueDate = (date: Date, frequency: string): Date => {
        if (frequency === 'monthly')     return addMonths(date, 1)
        if (frequency === 'fortnightly') return addWeeks(date, 2)
        if (frequency === 'weekly')      return addWeeks(date, 1)
        if (frequency === 'quarterly')   return addMonths(date, 3)
        if (frequency === 'halfyearly')  return addMonths(date, 6)
        if (frequency === 'yearly')      return addMonths(date, 12)
        return addMonths(date, 1)
      }

      const newDueDate = advanceNextDueDate(referenceDate, bill.frequency)
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
            taxClassification: bill.taxClassification ?? null,
            familyId: session.familyId,
          },
        })
      }
    } catch (err) {
      // Bug 3 fix: don't silently swallow — surface warning to caller
      console.error('[payments POST] Failed to spawn next occurrence:', err)
      spawnWarning = 'Payment recorded, but failed to create next bill occurrence. Please check recurring bills.'
    }
  }

  return NextResponse.json(
    {
      ...payment,
      ...(glWarning ? { glWarning } : {}),
      ...(spawnWarning ? { spawnWarning } : {}),
    },
    { status: 201 },
  )
}
