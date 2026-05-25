import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import {
  ensureAccountsPayableCategory,
  ensureUndepositedFundsCategory,
} from '@/lib/finance-opening-balance'
import { nextJournalReference } from '@/lib/finance-journal-ref'
import { addMonths, addWeeks, max } from 'date-fns'

// ─────────────────────────────────────────────────────────────────────────────
// GL-FIRST PAYMENT ACCOUNTING
// ─────────────────────────────────────────────────────────────────────────────
//
// Four paths — determined by (wasAccrued, bankGlAccountId):
//
//   PATH A  wasAccrued=true,  bankGl=provided  → DR AP          / CR Bank
//   PATH B  wasAccrued=true,  bankGl=null      → DR AP          / CR Undeposited Funds
//   PATH C  wasAccrued=false, bankGl=provided  → DR Expense     / CR Bank
//   PATH D  wasAccrued=false, bankGl=null      → DR Expense     / CR Undeposited Funds
//
// Paths B and D use "Undeposited Funds" (system asset category) as the credit
// account — identical to Xero/QuickBooks behaviour. This keeps the Trial
// Balance balanced and gives the accountant a visible clearing item to allocate
// to a real bank account later.
//
// All writes (GL journal, FinanceTransaction, FinanceBillPayment, bill status
// update, and next-occurrence spawn) happen inside a single $transaction so
// either everything commits or nothing does (Bug 2 fix: spawn inside tx).
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_INCLUDE = {
  account:     { select: { id: true, name: true } },
  glAccount:   { select: { id: true, name: true, color: true, type: true } },
  transaction: { select: { id: true, amount: true, date: true, isCleared: true } },
} as const

function advanceNextDueDate(date: Date, frequency: string): Date {
  const ref = max([date, new Date()])
  if (frequency === 'weekly')      return addWeeks(ref, 1)
  if (frequency === 'fortnightly') return addWeeks(ref, 2)
  if (frequency === 'monthly')     return addMonths(ref, 1)
  if (frequency === 'bimonthly')   return addMonths(ref, 2)
  if (frequency === 'quarterly')   return addMonths(ref, 3)
  if (frequency === 'halfyearly')  return addMonths(ref, 6)
  if (frequency === 'yearly')      return addMonths(ref, 12)
  console.warn(`[payments POST] Unknown frequency "${frequency}" — defaulting to monthly`)
  return addMonths(ref, 1)
}

// ── GET ───────────────────────────────────────────────────────────────────────

/**
 * GET /api/finance/bills/[id]/payments
 * Returns all payments for a bill, ordered by paymentDate desc.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: billId } = await params

  const bill = await prisma.financeRecurringBill.findFirst({
    where: { id: billId, familyId: user.familyId },
    select: { id: true },
  })
  if (!bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }

  const payments = await prisma.financeBillPayment.findMany({
    where: { billId, familyId: user.familyId },
    include: PAYMENT_INCLUDE,
    orderBy: { paymentDate: 'desc' },
  })

  return NextResponse.json(payments)
}

// ── POST ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/finance/bills/[id]/payments
 *
 * Record a payment installment (full or partial) against a bill.
 *
 * Body:
 *   amount       number   Required. Amount paid this installment.
 *   paymentDate  string   Required. ISO date string.
 *   glAccountId  string?  GL asset category for the bank/cash account.
 *                         If omitted, credits "Undeposited Funds" (suspense).
 *   accountId    string?  FinanceAccount for UI display / balance tracking.
 *   notes        string?
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: billId } = await params

  const body = await request.json()
  const { amount, paymentDate, glAccountId, accountId, notes } = body

  // ── Input validation ────────────────────────────────────────────────────────
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Payment amount must be greater than 0' }, { status: 400 })
  }
  if (!paymentDate) {
    return NextResponse.json({ error: 'Payment date is required' }, { status: 400 })
  }

  // ── Load bill ───────────────────────────────────────────────────────────────
  const bill = await prisma.financeRecurringBill.findFirst({
    where: { id: billId, familyId: user.familyId },
  })
  if (!bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }
  if (bill.isVoided) {
    return NextResponse.json({ error: 'Cannot add payments to a voided bill' }, { status: 400 })
  }

  // ── Check remaining balance ─────────────────────────────────────────────────
  const existingAggregate = await prisma.financeBillPayment.aggregate({
    where: { billId, familyId: user.familyId },
    _sum: { amount: true },
  })
  const totalPaidSoFar = existingAggregate._sum.amount ?? 0
  const remainingBalance = bill.amount - totalPaidSoFar

  if (amount > remainingBalance + 0.005) {
    return NextResponse.json({
      error: `Payment amount (${amount.toFixed(2)}) exceeds remaining balance (${remainingBalance.toFixed(2)})`,
    }, { status: 400 })
  }

  const actualDate = new Date(paymentDate)
  const paymentAccountId: string | null = accountId ?? bill.accountId ?? null

  // ── Determine GL path ───────────────────────────────────────────────────────
  //
  // wasAccrued: stage 1 (DR Expense / CR AP) was already posted.
  //   true  → this payment clears AP (DR AP / CR Bank-or-Suspense)
  //   false → no AP outstanding; this payment IS the expense recognition
  //           (DR Expense / CR Bank-or-Suspense)
  const wasAccrued = bill.invoiceReceived === true

  // Resolve the credit-side GL account (bank or suspense).
  // Suspense account is auto-created on first use — no migration required.
  const creditGlAccountId: string = glAccountId
    ? glAccountId
    : await ensureUndepositedFundsCategory(user.familyId)

  const usingSuspense = !glAccountId

  // Resolve the debit-side GL account (AP or Expense).
  let debitGlAccountId: string
  if (wasAccrued) {
    debitGlAccountId = await ensureAccountsPayableCategory(user.familyId)
  } else {
    // PATH C / D: expense category required for correct P&L impact.
    // If the bill has no category, fall back to AP so the journal still balances
    // (accountant can fix the category later).
    if (bill.categoryId) {
      debitGlAccountId = bill.categoryId
    } else {
      debitGlAccountId = await ensureAccountsPayableCategory(user.familyId)
      console.warn(
        `[payments POST] Bill ${bill.id} has no expense category — ` +
        `using AP as debit fallback. Assign a category for correct P&L reporting.`,
      )
    }
  }

  // Validate both resolved GL accounts belong to this family before writing anything
  const validCount = await prisma.financeCategory.count({
    where: {
      id: { in: [debitGlAccountId, creditGlAccountId] },
      familyId: user.familyId,
    },
  })
  if (validCount < 2) {
    return NextResponse.json(
      { error: 'One or more GL accounts not found. Cannot post payment.' },
      { status: 422 },
    )
  }

  // ── Build journal description ───────────────────────────────────────────────
  const pathLabel = wasAccrued
    ? (usingSuspense ? 'PATH B: DR AP / CR Undeposited Funds' : 'PATH A: DR AP / CR Bank')
    : (usingSuspense ? 'PATH D: DR Expense / CR Undeposited Funds' : 'PATH C: DR Expense / CR Bank')
  const journalDesc = usingSuspense
    ? `Payment (undeposited): ${bill.name}`
    : `Payment: ${bill.name}`

  // Pre-generate journal reference OUTSIDE the $transaction.
  // nextJournalReference reads committed MAX; inside a transaction uncommitted
  // creates are invisible so sequential calls return the same value.
  const MAX_REF_RETRIES = 10
  let journalReference: string | null = null
  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    const candidate = await nextJournalReference(user.familyId)
    const conflict = await prisma.financeJournalEntry.findFirst({
      where: { familyId: user.familyId, reference: candidate },
      select: { id: true },
    })
    if (!conflict) { journalReference = candidate; break }
  }
  if (!journalReference) {
    return NextResponse.json(
      { error: 'Could not generate a unique journal reference. Please retry.' },
      { status: 500 },
    )
  }

  const newTotalPaid = totalPaidSoFar + amount
  const isFullyPaid  = newTotalPaid >= bill.amount - 0.005

  // ── ATOMIC: GL journal + transaction + payment record + bill update + spawn ──
  let savedPaymentId: string
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Post GL journal entry — the canonical financial record
      //
      //   PATH A: DR Accounts Payable    / CR Bank             (accrued, bank known)
      //   PATH B: DR Accounts Payable    / CR Undeposited Funds (accrued, no bank)
      //   PATH C: DR Expense Category    / CR Bank             (direct pay, bank known)
      //   PATH D: DR Expense Category    / CR Undeposited Funds (direct pay, no bank)
      //
      // All four paths produce a balanced, posted journal entry. The debit
      // description includes the path label so auditors can trace the logic.
      const journalEntry = await tx.financeJournalEntry.create({
        data: {
          reference: journalReference!,
          date: actualDate,
          description: journalDesc,
          type: 'auto_transaction',
          isPosted: true,
          entityId: bill.entityId ?? null,
          familyId: user.familyId,
          lines: {
            create: [
              {
                glAccountId: debitGlAccountId,
                side: 'debit',
                amount,
                description: `${pathLabel} — ${bill.name}`,
              },
              {
                glAccountId: creditGlAccountId,
                side: 'credit',
                amount,
                description: usingSuspense
                  ? `Undeposited — ${bill.name}`
                  : `Payment: ${bill.name}`,
              },
            ],
          },
        },
        select: { id: true },
      })

      // 2. Create FinanceTransaction (UI cache / bank register)
      const paymentTx = await tx.financeTransaction.create({
        data: {
          type: 'expense',
          amount,
          accountId: paymentAccountId,
          categoryId: bill.categoryId,
          description: usingSuspense
            ? `${bill.name} (payment — undeposited)`
            : `${bill.name} (payment)`,
          date: actualDate,
          isRecurring: false,
          recurringBillId: bill.id,
          vendorId: bill.vendorId,
          notes: notes ?? bill.notes,
          memberId: bill.memberId,
          locationId: bill.locationId,
          isCleared: !usingSuspense,        // undeposited = not yet cleared to a bank
          reconciledDate: usingSuspense ? null : actualDate,
          isTransfer: false,
          glAccountId: glAccountId ?? null, // null when using suspense — cleared later
          createdBy: user.id,
          familyId: user.familyId,
          entityId: bill.entityId,
          taxClassification: bill.taxClassification ?? null,
        },
        select: { id: true },
      })

      // 3. Create FinanceBillPayment subledger record
      //    journalEntryId links back to the GL entry for reversal on undo
      const payment = await tx.financeBillPayment.create({
        data: {
          billId: bill.id,
          amount,
          paymentDate: actualDate,
          accountId: paymentAccountId ?? null,
          glAccountId: glAccountId ?? null,
          transactionId: paymentTx.id,
          journalEntryId: journalEntry.id,
          notes: notes ?? null,
          createdBy: user.id,
          familyId: user.familyId,
        },
        select: { id: true },
      })
      savedPaymentId = payment.id

      // 4. Update bill paid status
      //    paidDate = most recent payment date (set to actualDate when fully paid)
      await tx.financeRecurringBill.update({
        where: { id: bill.id },
        data: {
          paid: isFullyPaid,
          paidDate: isFullyPaid ? actualDate : null,
        },
      })

      // 5. Spawn next occurrence for recurring bills when fully paid.
      //    MUST be inside this $transaction (Bug 2 fix): if spawn fails the
      //    entire payment rolls back. A committed payment with no next
      //    occurrence causes the bill to silently disappear — unrecoverable.
      if (isFullyPaid && bill.billType !== 'one-off') {
        const newDueDate = advanceNextDueDate(bill.nextDueDate, bill.frequency)
        if (!bill.endDate || newDueDate <= bill.endDate) {
          await tx.financeRecurringBill.create({
            data: {
              name:               bill.name,
              amount:             bill.amount,
              accountId:          bill.accountId,
              categoryId:         bill.categoryId,
              vendorId:           bill.vendorId,
              frequency:          bill.frequency,
              dayOfMonth:         bill.dayOfMonth,
              monthOfYear:        bill.monthOfYear,
              nextDueDate:        newDueDate,
              endDate:            bill.endDate,
              isActive:           bill.isActive,
              autoPay:            bill.autoPay,
              emailReminder:      bill.emailReminder,
              reminderDays:       bill.reminderDays,
              notes:              bill.notes,
              memberId:           bill.memberId,
              locationId:         bill.locationId,
              billType:           bill.billType,
              recurrenceInterval: bill.recurrenceInterval,
              invoiceReceived:    false,
              invoiceReceivedDate: null,
              paid:               false,
              paidDate:           null,
              parentBillId:       bill.id,
              entityId:           bill.entityId,
              taxClassification:  bill.taxClassification ?? null,
              familyId:           user.familyId,
            },
          })
        }
      }
    })
  } catch (err) {
    console.error('[payments POST] ATOMIC write failed:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to record payment. No changes were saved. (${msg})` },
      { status: 422 },
    )
  }

  // ── Return the saved payment with includes ──────────────────────────────────
  const savedPayment = await prisma.financeBillPayment.findFirst({
    where: { id: savedPaymentId!, familyId: user.familyId },
    include: PAYMENT_INCLUDE,
  })

  return NextResponse.json(
    {
      ...savedPayment,
      ...(usingSuspense ? { glWarning: 'No bank account selected — payment posted to Undeposited Funds. Allocate to a bank account when deposited.' } : {}),
    },
    { status: 201 },
  )
}
