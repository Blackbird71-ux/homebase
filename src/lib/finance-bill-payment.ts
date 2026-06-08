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

import type { FinanceRecurringBill, Prisma } from '@prisma/client'
import { spawnNextBillOnPayment } from '@/lib/finance-draft-spawn-service'
import { postBillPaymentJournal } from '@/lib/finance-posting'

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
 * is fully paid. Returns the new FinanceBillPayment id and, for a fully-paid
 * template-less bill, the spawned successor so the caller can copy its draft
 * journal AFTER the tx (copySpawnedBillDraftJournal cannot nest a transaction).
 */
export async function recordBillPayment(
  tx: Prisma.TransactionClient,
  p: RecordBillPaymentParams,
): Promise<{ paymentId: string; spawned: { spawnedBillId: string; spawnedBillDueDate: Date } | null }> {
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

  // 5. Spawn next occurrence for recurring bills when fully paid, via the
  //    shared spawn helper — the SAME one the bills PATCH "Mark Paid" path uses
  //    — so the successor is identical no matter which path settled the bill
  //    (status='draft', templated-aware, strict-next cadence).
  //    MUST be inside this $transaction (Bug 2 fix): if the spawn fails the
  //    entire payment rolls back. A committed payment with no successor causes
  //    the bill to silently disappear — unrecoverable.
  //
  //    For a template-less bill the returned info lets the CALLER copy the
  //    parent's draft journal AFTER the tx (copySpawnedBillDraftJournal —
  //    upsertDraftJournal opens its own transaction and cannot nest here).
  let spawned: { spawnedBillId: string; spawnedBillDueDate: Date } | null = null
  if (isFullyPaid && bill.billType !== 'one-off') {
    spawned = await spawnNextBillOnPayment(tx, bill, familyId)
  }

  return { paymentId: payment.id, spawned }
}
