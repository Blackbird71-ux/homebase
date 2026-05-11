import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

/**
 * DELETE /api/finance/bills/[id]/payments/[paymentId]
 * Undo a specific payment installment.
 * Deletes the payment record and its linked transaction,
 * then recalculates the bill's paid/paidDate status.
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
    select: { id: true, transactionId: true, amount: true },
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

  // ── Delete the linked transaction (if exists) ───────────────────────────────
  if (payment.transactionId) {
    await prisma.financeTransaction.deleteMany({
      where: { id: payment.transactionId, familyId: session.familyId },
    })
  }

  // ── Delete the payment record ───────────────────────────────────────────────
  await prisma.financeBillPayment.delete({
    where: { id: payment.id },
  })

  // ── Recalculate bill's paid/paidDate status ─────────────────────────────────
  const remainingPayments = await prisma.financeBillPayment.aggregate({
    where: { billId, familyId: session.familyId },
    _sum: { amount: true },
  })
  const totalPaid = remainingPayments._sum.amount ?? 0
  const isFullyPaid = totalPaid >= bill.amount

  // Find the most recent payment date, if any payments remain
  let latestPaymentDate: Date | null = null
  if (totalPaid > 0) {
    const latestPayment = await prisma.financeBillPayment.findFirst({
      where: { billId, familyId: session.familyId },
      orderBy: { paymentDate: 'desc' },
      select: { paymentDate: true },
    })
    latestPaymentDate = latestPayment?.paymentDate ?? null
  }

  await prisma.financeRecurringBill.update({
    where: { id: billId },
    data: {
      paid: isFullyPaid,
      paidDate: latestPaymentDate,
    },
  })

  return NextResponse.json({ success: true, paid: isFullyPaid, totalPaid })
}
