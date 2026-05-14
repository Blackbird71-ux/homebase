import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { nextJournalReference } from '@/lib/finance-journal-ref'

/**
 * DELETE /api/finance/bills/[id]/payments/[paymentId]
 *
 * Undo a specific payment installment.
 *
 * GL-FIRST: the payment journal (DR AP / CR Bank) created at payment time is
 * REVERSED (not deleted) — the original stays in the ledger with isReversed=true,
 * and a balanced reversal entry posts with DR/CR swapped. This preserves the
 * audit trail in the Xero/GnuCash standard.
 *
 * All writes happen inside a single $transaction so a failure leaves nothing
 * partially undone.
 *
 * Backwards-compat: legacy FinanceBillPayment rows from before migration
 * 20260543 have journalEntryId=NULL. In that case the reversal step is skipped
 * — existing behaviour preserved, no regression for old data.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const session = await requireSession()
  const { id: billId, paymentId } = await params

  // Verify the payment exists and belongs to this family
  const payment = await prisma.financeBillPayment.findFirst({
    where: { id: paymentId, billId, familyId: session.familyId },
    select: {
      id: true,
      transactionId: true,
      journalEntryId: true,
      amount: true,
    },
  })
  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  // Verify the bill belongs to this family
  const bill = await prisma.financeRecurringBill.findFirst({
    where: { id: billId, familyId: session.familyId },
  })
  if (!bill) {
    return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
  }

  // Pre-fetch the journal we'll need to reverse (if any). Must happen OUTSIDE
  // the $transaction so we can compute the reversal lines.
  const journalToReverse = payment.journalEntryId
    ? await prisma.financeJournalEntry.findFirst({
        where: { id: payment.journalEntryId, familyId: session.familyId },
        include: { lines: true },
      })
    : null

  // Pre-generate the reversal reference OUTSIDE the transaction.
  // nextJournalReference reads committed DB state; inside a $transaction the
  // create won't be visible to a second call, so generating it once avoids
  // the P2002 race.
  const reversalReference =
    journalToReverse?.isPosted && !journalToReverse.isReversed
      ? await nextJournalReference(session.familyId)
      : null

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Reverse the GL journal if one exists and is posted/unreversed
      if (
        journalToReverse?.isPosted &&
        !journalToReverse.isReversed &&
        reversalReference
      ) {
        await tx.financeJournalEntry.create({
          data: {
            reference: reversalReference,
            date: new Date(),
            description: `VOID partial payment: ${journalToReverse.description}`,
            type: 'reversal',
            isPosted: true,
            reversalOfId: journalToReverse.id,
            entityId: journalToReverse.entityId,
            familyId: session.familyId,
            lines: {
              create: journalToReverse.lines.map((l) => ({
                glAccountId: l.glAccountId,
                side: l.side === 'debit' ? 'credit' : 'debit',
                amount: l.amount,
                description: l.description,
              })),
            },
          },
        })
        await tx.financeJournalEntry.update({
          where: { id: journalToReverse.id },
          data: { isReversed: true },
        })
      }

      // 2. Delete the linked FinanceTransaction (if exists)
      if (payment.transactionId) {
        await tx.financeTransaction.deleteMany({
          where: { id: payment.transactionId, familyId: session.familyId },
        })
      }

      // 3. Delete the payment record
      await tx.financeBillPayment.delete({ where: { id: payment.id } })

      // 4. Recalculate bill's paid/paidDate status
      const remainingPayments = await tx.financeBillPayment.aggregate({
        where: { billId, familyId: session.familyId },
        _sum: { amount: true },
      })
      const totalPaid = remainingPayments._sum.amount ?? 0
      const isFullyPaid = totalPaid >= bill.amount - 0.005

      let latestPaymentDate: Date | null = null
      if (totalPaid > 0) {
        const latestPayment = await tx.financeBillPayment.findFirst({
          where: { billId, familyId: session.familyId },
          orderBy: { paymentDate: 'desc' },
          select: { paymentDate: true },
        })
        latestPaymentDate = latestPayment?.paymentDate ?? null
      }

      await tx.financeRecurringBill.update({
        where: { id: billId },
        data: { paid: isFullyPaid, paidDate: latestPaymentDate },
      })
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[payments DELETE] ATOMIC undo failed:', err)
    return NextResponse.json(
      { error: 'Failed to undo payment. No changes were saved.' },
      { status: 422 },
    )
  }
}
