// =============================================================================
// finance-income-receive.ts
//
// Shared Stage-1 "invoice/remittance received" orchestration for income.
// Extracted from the income PATCH Stage 1 handler (the proven model) so POST
// create-as-received and PUT edit-with-transition run the IDENTICAL sequence
// instead of force-posting the accrual the moment journal lines exist. This is
// the income mirror of finance-bill-receive.ts (audit P4-A1): bills and income
// now recognise on the SAME trigger — the invoiceReceived false→true
// transition — never on draft creation. One fix, one place (AGENTS.md Finance
// rules 1 & 3).
//
// Income has no prepayment gate (that is an expense-side concept), so this is
// the simpler counterpart to receiveBillStage1: accrual + invoice
// FinanceTransaction + atomic flag update.
//
// Must run inside the caller's $transaction so the GL journal, invoice
// transaction and income flags commit together or not at all.
// =============================================================================

import type { FinanceIncomeEntry, Prisma } from '@prisma/client'
import { postIncomeAccrualJournal } from '@/lib/finance-posting'

/**
 * Full Stage-1 receive for income: post (or promote a balanced draft to) the
 * DR Accounts Receivable / CR Income accrual, create the remittance
 * FinanceTransaction, and atomically set the income flags. The entry must have
 * a categoryId (callers validate and 400/422 before reaching here).
 *
 * `entry` is the CURRENT row (POST: freshly created; PUT: after the field
 * update; PATCH: existing) so name/amount/category reflect this request.
 * `draftJournalEntryId` is the draft to promote (defaults to the entry's linked
 * journal). When the linked journal is ALREADY posted (legacy rows), it is
 * re-used as-is rather than posting a duplicate accrual.
 */
export async function receiveIncomeStage1(
  tx: Prisma.TransactionClient,
  params: {
    entry: FinanceIncomeEntry
    remittanceDate: Date
    userId: string
    familyId: string
    draftJournalEntryId?: string | null
  },
): Promise<{ journalEntryId: string; invoiceTxId: string }> {
  const { entry, remittanceDate, userId, familyId } = params

  if (!entry.categoryId) {
    throw new Error('receiveIncomeStage1: income entry must have a category before posting')
  }

  const draftJournalEntryId = params.draftJournalEntryId !== undefined
    ? params.draftJournalEntryId
    : (entry.journalEntryId ?? null)

  // Post the Stage-1 accrual (DR AR / CR Income) via the shared helper — it
  // promotes a balanced unposted draft as-is (preserving any GST split) or
  // creates a fresh 2-line entry. If the linked journal is ALREADY posted
  // (legacy data), re-use it to avoid a duplicate that would double revenue/AR.
  let journalEntryId: string
  const alreadyPosted = draftJournalEntryId
    ? (await tx.financeJournalEntry.findFirst({
        where: { id: draftJournalEntryId, familyId },
        select: { isPosted: true },
      }))?.isPosted ?? false
    : false

  if (draftJournalEntryId && alreadyPosted) {
    journalEntryId = draftJournalEntryId
  } else {
    const posted = await postIncomeAccrualJournal(tx, {
      familyId,
      description: entry.name,
      amount: entry.amount,
      incomeGlAccountId: entry.categoryId,
      entityId: entry.entityId ?? null,
      date: remittanceDate,
      draftJournalEntryId,
    })
    journalEntryId = posted.journalEntryId
  }

  // Invoice/remittance transaction record (for tracking)
  const remittanceTx = await tx.financeTransaction.create({
    data: {
      type: 'income',
      amount: entry.amount,
      accountId: entry.accountId,
      categoryId: entry.categoryId,
      description: `${entry.name} (remittance received)`,
      date: remittanceDate,
      isRecurring: entry.incomeType !== 'one-off',
      vendorId: entry.vendorId,
      notes: entry.notes,
      memberId: entry.memberId,
      locationId: entry.locationId,
      isCleared: false,
      isTransfer: false,
      createdBy: userId,
      familyId,
      entityId: entry.entityId,
    },
  })

  // Update income status ATOMICALLY with the GL write
  await tx.financeIncomeEntry.update({
    where: { id: entry.id },
    data: {
      invoiceReceived: true,
      invoiceReceivedDate: remittanceDate,
      invoiceTxId: remittanceTx.id,
      transactionId: remittanceTx.id,
      journalEntryId,
    },
  })

  return { journalEntryId, invoiceTxId: remittanceTx.id }
}
