// =============================================================================
// finance-bill-receive.ts
//
// Shared Stage-1 "invoice received" orchestration for bills. Extracted from the
// bills PATCH Stage 1 handler (the proven model) so POST create-as-received and
// PUT edit-with-transition run the IDENTICAL sequence instead of drifting
// near-copies (audit F4). One fix, one place (AGENTS.md Finance rules 1 & 3).
//
// Both functions must run inside the caller's $transaction so the GL journal,
// prepayment schedule, invoice transaction and bill flags commit together or
// not at all.
// =============================================================================

import type { FinanceRecurringBill, Prisma } from '@prisma/client'
import { postBillAccrualJournal, type PostResult } from '@/lib/finance-posting'
import { prepareePrepaymentAtTaxPoint, createPrepaymentSchedule } from '@/lib/finance-prepayment'

/**
 * Post the Stage-1 accrual with the prepayment gate, exactly as bills PATCH
 * Stage 1 does: materiality check → capitalise to Prepaid (repointing the
 * draft's expense lines) → promote/post the accrual → persist the amortisation
 * schedule. Returns the posted journal id.
 *
 * Runs INSIDE the caller's $transaction (prepareePrepaymentAtTaxPoint repoints
 * the draft journal that postBillAccrualJournal then promotes).
 */
export async function postBillAccrualWithPrepayment(
  tx: Prisma.TransactionClient,
  params: {
    familyId: string
    billId: string
    description: string
    amount: number
    expenseGlAccountId: string
    entityId: string | null
    date: Date
    draftJournalEntryId: string | null
    frequency: string
    coverageStart: Date | null
    coverageEnd: Date | null
  },
): Promise<PostResult> {
  const family = await tx.family.findUnique({
    where: { id: params.familyId },
    select: { prepaymentThreshold: true },
  })
  const prepaymentThreshold = family?.prepaymentThreshold ?? 300

  const prepayment = await prepareePrepaymentAtTaxPoint(tx, {
    familyId: params.familyId,
    expenseAccountId: params.expenseGlAccountId,
    grossAmount: params.amount,
    frequency: params.frequency,
    coverageStart: params.coverageStart,
    coverageEnd: params.coverageEnd,
    anchorDate: params.date,
    threshold: prepaymentThreshold,
    draftJournalEntryId: params.draftJournalEntryId,
  })

  // When this is a prepayment, debit Prepaid Expenses instead of the expense
  // account (only affects the no-draft fallback — the draft path was already
  // repointed above). For the no-draft path on a gstApplicable category,
  // prepayment.gstAmount carries the category-derived GST so the fresh entry
  // posts DR Prepaid net / DR GST ITC gst / CR AP gross (audit F9).
  const post = await postBillAccrualJournal(tx, {
    familyId: params.familyId,
    description: params.description,
    amount: params.amount,
    expenseGlAccountId: prepayment ? prepayment.prepaidAccountId : params.expenseGlAccountId,
    entityId: params.entityId,
    date: params.date,
    draftJournalEntryId: params.draftJournalEntryId,
    gstSplit: prepayment?.gstItcAccountId
      ? { gstAmount: prepayment.gstAmount, gstItcAccountId: prepayment.gstItcAccountId }
      : null,
  })

  if (prepayment) {
    await createPrepaymentSchedule(tx, {
      familyId: params.familyId,
      billId: params.billId,
      prepaidAccountId: prepayment.prepaidAccountId,
      expenseAccountId: params.expenseGlAccountId,
      description: params.description,
      totalNet: prepayment.net,
      coverageStart: prepayment.coverageStart,
      coverageEnd: prepayment.coverageEnd,
      months: prepayment.months,
    })
  }

  return post
}

/**
 * Full Stage-1 receive: accrual (with prepayment gate) + invoice
 * FinanceTransaction + atomic bill flag update. The bill must have a
 * categoryId (callers validate and 400/422 before reaching here).
 *
 * `bill` is the CURRENT row (POST: freshly created; PUT: after the field
 * update; PATCH: existing) so name/amount/category reflect this request.
 * `draftJournalEntryId` is the draft to promote (defaults to the bill's
 * linked journal).
 */
export async function receiveBillStage1(
  tx: Prisma.TransactionClient,
  params: {
    bill: FinanceRecurringBill
    invoiceDate: Date
    userId: string
    familyId: string
    draftJournalEntryId?: string | null
  },
): Promise<{ journalEntryId: string; invoiceTxId: string }> {
  const { bill, invoiceDate, userId, familyId } = params

  const { journalEntryId } = await postBillAccrualWithPrepayment(tx, {
    familyId,
    billId: bill.id,
    description: bill.name,
    amount: bill.amount,
    expenseGlAccountId: bill.categoryId!,
    entityId: bill.entityId,
    date: invoiceDate,
    draftJournalEntryId: params.draftJournalEntryId !== undefined
      ? params.draftJournalEntryId
      : (bill.journalEntryId ?? null),
    frequency: bill.frequency,
    coverageStart: bill.coverageStart,
    coverageEnd: bill.coverageEnd,
  })

  // Invoice transaction record (for backward compat tracking)
  const invoiceTx = await tx.financeTransaction.create({
    data: {
      type: 'expense',
      amount: bill.amount,
      accountId: bill.accountId,
      categoryId: bill.categoryId,
      description: `${bill.name} (invoice received)`,
      date: invoiceDate,
      isRecurring: bill.billType !== 'one-off',
      recurringBillId: bill.id,
      vendorId: bill.vendorId,
      notes: bill.notes,
      memberId: bill.memberId,
      locationId: bill.locationId,
      isCleared: false,
      isTransfer: false,
      createdBy: userId,
      familyId,
      entityId: bill.entityId,
      taxClassification: bill.taxClassification ?? null,
    },
  })

  // Update bill status ATOMICALLY with the GL write
  await tx.financeRecurringBill.update({
    where: { id: bill.id },
    data: {
      invoiceReceived: true,
      invoiceReceivedDate: invoiceDate,
      // billDate is the GL recognition (tax-point) date the accrual posted on.
      // Record it so the row always reflects what the ledger used.
      billDate: invoiceDate,
      invoiceTxId: invoiceTx.id,
      transactionId: invoiceTx.id,
      journalEntryId,
    },
  })

  return { journalEntryId, invoiceTxId: invoiceTx.id }
}
