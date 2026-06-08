// =============================================================================
// finance-bill-payment.ts
//
// Shared orchestration for recording a bill payment installment. Extracted from
// the POST /api/finance/bills/[id]/payments handler so the same proven sequence
// (GL journal → payment transaction → FinanceBillPayment subledger → bill status
// update → next-occurrence spawn) can also be driven by the AI `markBillPaid`
// tool. One fix, one place (AGENTS.md Finance rules 1 & 3).
//
// The caller owns the $transaction and performs all pre-write validation /
// GL-path determination; this function performs only the atomic body and must
// run inside a $transaction so either everything commits or nothing does.
// =============================================================================

import type { FinanceRecurringBill } from '@prisma/client'
import { addUtcMonths, addUtcWeeks } from '@/lib/timezone'
import { postBillPaymentJournal, type TxClient } from '@/lib/finance-posting'

// Advance a recurring bill's due date by one cadence step, anchored no earlier
// than today (so a long-overdue bill jumps forward to a sensible next date).
export function advanceNextDueDate(date: Date, frequency: string): Date {
  const ref = new Date(Math.max(date.getTime(), Date.now()))
  if (frequency === 'weekly')      return addUtcWeeks(ref, 1)
  if (frequency === 'fortnightly') return addUtcWeeks(ref, 2)
  if (frequency === 'monthly')     return addUtcMonths(ref, 1)
  if (frequency === 'bimonthly')   return addUtcMonths(ref, 2)
  if (frequency === 'quarterly')   return addUtcMonths(ref, 3)
  if (frequency === 'halfyearly')  return addUtcMonths(ref, 6)
  if (frequency === 'yearly')      return addUtcMonths(ref, 12)
  console.warn(`[recordBillPayment] Unknown frequency "${frequency}" — defaulting to monthly`)
  return addUtcMonths(ref, 1)
}

export interface RecordBillPaymentParams {
  /** The full bill being paid (loaded by the caller). */
  bill: FinanceRecurringBill
  /** Amount paid this installment (positive). */
  amount: number
  /** Date the payment was made. */
  actualDate: Date
  /** Resolved credit-side GL account (bank or Undeposited Funds suspense). */
  creditGlAccountId: string
  /** True when no bank GL was supplied → suspense (Undeposited Funds) was used. */
  usingSuspense: boolean
  /** The user-supplied bank GL account, or null when using suspense. */
  glAccountId: string | null
  /** FinanceAccount for the payment transaction / payment record (UI register). */
  paymentAccountId: string | null
  /** Optional payment note (falls back to the bill note on the transaction). */
  notes: string | null
  /** Whether this installment fully settles the bill. */
  isFullyPaid: boolean
  /** Acting user id (createdBy). */
  userId: string
  /** Family scope. */
  familyId: string
}

/**
 * Record a bill payment installment inside the caller's $transaction.
 * Posts the GL journal, creates the payment transaction + subledger record,
 * updates the bill's paid status, and spawns the next occurrence when the bill
 * is fully paid. Returns the new FinanceBillPayment id.
 */
export async function recordBillPayment(
  tx: TxClient,
  p: RecordBillPaymentParams,
): Promise<{ paymentId: string }> {
  const {
    bill, amount, actualDate, creditGlAccountId, usingSuspense,
    glAccountId, paymentAccountId, notes, isFullyPaid, userId, familyId,
  } = p

  // wasAccrued: stage 1 (DR Expense / CR AP) was already posted → this payment
  // clears AP. Otherwise this payment IS the expense recognition.
  const wasAccrued = bill.invoiceReceived === true

  // 1. Post GL journal entry via shared function — handles all four paths:
  //   PATH A: DR AP       / CR Bank             (accrued, bank known)
  //   PATH B: DR AP       / CR Undeposited Funds (accrued, no bank)
  //   PATH C: DR Expense  / CR Bank             (direct pay, bank known)
  //   PATH D: DR Expense  / CR Undeposited Funds (direct pay, no bank)
  const glPath = wasAccrued || !bill.categoryId ? 'clear_ap' : 'direct'
  const postResult = await postBillPaymentJournal(tx, {
    familyId,
    description: bill.name,
    amount,
    creditGlAccountId,
    entityId: bill.entityId ?? null,
    date: actualDate,
    usingSuspense,
    path: glPath,
    expenseGlAccountId: glPath === 'direct' ? bill.categoryId : undefined,
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
      createdBy: userId,
      familyId,
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
      journalEntryId: postResult.journalEntryId,
      notes: notes ?? null,
      createdBy: userId,
      familyId,
    },
    select: { id: true },
  })

  // 4. Update bill paid status
  //    paidDate = payment date when fully paid, else cleared
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
          familyId,
        },
      })
    }
  }

  return { paymentId: payment.id }
}
