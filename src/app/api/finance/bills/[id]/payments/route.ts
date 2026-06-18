import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { ensureUndepositedFundsCategory, resolveAccountGlCategoryId } from '@/lib/finance-opening-balance'
import { recordBillPayment } from '@/lib/finance-bill-payment'
import { copySpawnedBillDraftJournal } from '@/lib/finance-draft-spawn-service'

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
 *   accountId    string?  FinanceAccount the cash came from (Xero 1:1 model).
 *                         The credit side posts to that account's bound GL
 *                         category. If omitted, credits "Undeposited Funds"
 *                         (suspense) to allocate to a real account later.
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
  const { amount, paymentDate, accountId, notes } = body

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

  // Resolve the credit-side cash GL account from the SELECTED FinanceAccount's
  // bound 1:1 GL category (Xero model). Users pick an account, never a raw GL
  // category, so cash can never be routed to a non-account category — which is
  // exactly the divergence that made balances and reports disagree. No account
  // selected → post to Undeposited Funds suspense and allocate later.
  let creditGlAccountId: string
  let usingSuspense: boolean
  if (paymentAccountId) {
    const resolved = await resolveAccountGlCategoryId(paymentAccountId, user.familyId)
    if (!resolved) {
      return NextResponse.json(
        { error: 'Selected account not found. Cannot post payment.' },
        { status: 422 },
      )
    }
    creditGlAccountId = resolved
    usingSuspense = false
  } else {
    creditGlAccountId = await ensureUndepositedFundsCategory(user.familyId)
    usingSuspense = true
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
  let spawnedInfo: { spawnedBillId: string; spawnedBillDueDate: Date } | null = null
  try {
    const txResult = await prisma.$transaction(async (tx) => {
      return await recordBillPayment(tx, {
        bill,
        amount,
        actualDate,
        creditGlAccountId,
        usingSuspense,
        glAccountId: usingSuspense ? null : creditGlAccountId,
        paymentAccountId,
        notes: notes ?? null,
        isFullyPaid,
        userId: user.id,
        familyId: user.familyId,
      })
    })
    savedPaymentId = txResult.paymentId
    spawnedInfo = txResult.spawned
  } catch (err) {
    console.error('[payments POST] ATOMIC write failed:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to record payment. No changes were saved. (${msg})` },
      { status: 422 },
    )
  }

  // Copy the parent bill's draft journal onto a freshly-spawned template-less
  // successor — OUTSIDE the tx (upsertDraftJournal opens its own). Shared with
  // the bills PATCH path so both produce identical successors. Non-fatal.
  if (spawnedInfo && bill.journalEntryId) {
    await copySpawnedBillDraftJournal(
      spawnedInfo.spawnedBillId, bill.journalEntryId, bill.name,
      spawnedInfo.spawnedBillDueDate, user.familyId, bill.entityId ?? null,
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
