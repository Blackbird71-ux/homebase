import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { ensureUndepositedFundsCategory } from '@/lib/finance-opening-balance'
import { recordBillPayment } from '@/lib/finance-bill-payment'

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

  // Validate user-supplied bank GL account belongs to family before writing anything
  if (glAccountId) {
    const valid = await prisma.financeCategory.count({
      where: { id: glAccountId, familyId: user.familyId },
    })
    if (!valid) {
      return NextResponse.json(
        { error: 'GL account not found. Cannot post payment.' },
        { status: 422 },
      )
    }
  }

  // PATH C/D: warn when no expense category — postBillPaymentJournal falls back to AP
  if (!wasAccrued && !bill.categoryId) {
    console.warn(
      `[payments POST] Bill ${bill.id} has no expense category — ` +
      `using AP as debit fallback. Assign a category for correct P&L reporting.`,
    )
  }

  const newTotalPaid = totalPaidSoFar + amount
  const isFullyPaid  = newTotalPaid >= bill.amount - 0.005

  // ── ATOMIC: GL journal + transaction + payment record + bill update + spawn ──
  let savedPaymentId: string
  try {
    await prisma.$transaction(async (tx) => {
      const { paymentId } = await recordBillPayment(tx, {
        bill,
        amount,
        actualDate,
        creditGlAccountId,
        usingSuspense,
        glAccountId: glAccountId ?? null,
        paymentAccountId,
        notes: notes ?? null,
        isFullyPaid,
        userId: user.id,
        familyId: user.familyId,
      })
      savedPaymentId = paymentId
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
