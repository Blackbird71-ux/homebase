/**
 * Accountant-grade lifecycle invariant harness — automates QA.md §2 / §5 / §6.
 *
 * Drives the REAL posting pipeline (approveBillDraft / recordBillPayment /
 * approveIncomeDraft / MODE A+B receipt orchestration) through every core
 * lifecycle on a throwaway self-seeded DB, and after every step asserts the
 * properties a chartered accountant would demand:
 *
 *   §2.1/§6.1 — every posted journal balances (DR=CR), no nonpositive lines,
 *               trial balance sums to zero
 *   §2.3      — exact journal templates:
 *                 bill accrual   = DR Expense / CR AP
 *                 bill payment   = DR AP / CR Bank            (clear_ap)
 *                 income accrual = DR AR / CR Income
 *                 income receipt = DR Bank / CR AR
 *                 payslip receipt = CR Gross / DR Bank(net) / DR PAYG /
 *                                   DR deductions / DR+CR SGC pair
 *   §6.2      — subledger ↔ GL agreement: AP control = Σ open bill accruals
 *               (→ 0 once paid), AR control = Σ open income accruals (→ 0
 *               once received), bank = Σ receipts − Σ payments
 *   §6.4      — payslip identity: gross = net + PAYG + deductions; journal
 *               totals each = gross + SGC; PAYG DR lines reconcile to
 *               paygWithheld
 *   §5/§6     — the read-only integrity audit stays fully green (summary
 *               unchanged from baseline + every named check code 'pass')
 *
 * Amounts are deliberately adversarial (0.01, repeating-decimal .33/.45,
 * boundary .99, split installments, off-cent payslips) to catch float drift.
 * All bills < $300 (prepayment threshold) and one-off (spawn covered by its
 * own suite); all dates in the past (FUTURE_DATED_POSTING).
 *
 * Standing rule honoured: never touches data/homebase.db — setupFinanceTestDb
 * builds its own database from prisma/schema.prisma.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SessionUser } from '@/types'
import { setupFinanceTestDb, FINANCE_TEST_FAMILY, type FinanceTestDb } from './_finance-test-db'
import {
  BALANCE_EPSILON,
  assertPostedLedgerInvariants,
  assertJournalPosts,
  glNetBalance,
  findControlAccount,
  assertAuditCodesPass,
} from './_finance-invariants'

const FAMILY = FINANCE_TEST_FAMILY

const USER: SessionUser = {
  id: 'qa-user',
  email: 'qa@test.local',
  name: 'QA User',
  role: 'admin',
  familyId: FAMILY,
  weekStartsOn: 1,
  timezone: 'Australia/Sydney',
}

// All dates in the past relative to any plausible run date (FUTURE_DATED_POSTING).
const ACCRUAL_DATE = new Date('2026-05-05T00:00:00Z')
const SETTLE_DATE = new Date('2026-05-20T00:00:00Z')

// Adversarial amounts: minimum cent, repeating decimals, boundary, and an
// installment-split total none of whose parts round cleanly together.
const BILL_AMOUNTS = [0.01, 33.33, 99.99, 107.53]
const INSTALLMENTS: [number, number] = [40.0, 67.53] // for the 107.53 bill
const INCOME_AMOUNTS = [0.01, 45.45, 1234.56]

// Payslip P1: gross = net + PAYG + GL'd deduction (identity), plus SGC pair.
const P1 = { gross: 2500.0, payg: 634.0, deduction: 45.27, net: 1820.73, sgc: 287.5 }
// Payslip P2: off-cent identity, no SGC, no deductions.
const P2 = { gross: 1234.56, payg: 123.46, net: 1111.1 }

const r2 = (n: number) => Math.round(n * 100) / 100

describe('finance lifecycle invariants (QA.md §2/§5/§6)', () => {
  let fx: FinanceTestDb
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  let bankGl: string

  // Chart seeded in beforeAll (AP/AR are created on demand by the posting layer)
  let expenseGl: string
  let incomeGl: string
  let grossIncomeGl: string
  let paygGl: string
  let sgcAssetGl: string
  let sgcIncomeGl: string
  let deductionGl: string

  // Drivers (dynamically imported AFTER the DB is bound)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let approveBillDraft: any, approveIncomeDraft: any, recordBillPayment: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let postIncomeReceiptJournal: any, postPayslipReceiptJournal: any, runFinanceIntegrityAudit: any

  // Cross-test state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let baseline: any
  let apControl: string
  let arControl: string
  let billIds: string[] = []
  let incomeIds: string[] = []
  let payslipEntryIds: string[] = []

  beforeAll(async () => {
    fx = await setupFinanceTestDb('hb-lifecycle-')
    prisma = fx.prisma
    bankGl = fx.accounts.assetA

    ;({ approveBillDraft, approveIncomeDraft } = await import('../finance-draft-approval-service'))
    ;({ recordBillPayment } = await import('../finance-bill-payment'))
    ;({ postIncomeReceiptJournal, postPayslipReceiptJournal } = await import('../finance-posting'))
    ;({ runFinanceIntegrityAudit } = await import('../finance-integrity'))

    const mk = (name: string, type: string) =>
      prisma.financeCategory.create({ data: { familyId: FAMILY, name, type }, select: { id: true } })
    expenseGl = (await mk('QA Groceries', 'expense')).id
    incomeGl = (await mk('QA Consulting Income', 'income')).id
    grossIncomeGl = (await mk('QA Gross Wages', 'income')).id
    paygGl = (await mk('QA PAYG Withheld Receivable', 'asset')).id
    sgcAssetGl = (await mk('QA Accrued SGC', 'asset')).id
    sgcIncomeGl = (await mk('QA SGC Super Income', 'income')).id
    deductionGl = (await mk('QA Salary Deductions', 'expense')).id
  }, 120_000)

  afterAll(async () => {
    await fx?.cleanup()
  })

  it('baseline: seeded ledger satisfies posted-ledger invariants and a clean audit', async () => {
    await assertPostedLedgerInvariants(prisma, FAMILY)
    baseline = await runFinanceIntegrityAudit(FAMILY)
    expect(baseline.summary.critical, 'baseline audit must have zero critical findings').toBe(0)
  }, 30_000)

  // ── Bill lifecycle ─────────────────────────────────────────────────────────

  it('bill approval posts DR Expense / CR AP for every adversarial amount', async () => {
    for (const amount of BILL_AMOUNTS) {
      const bill = await prisma.financeRecurringBill.create({
        data: {
          name: `QA Bill ${amount.toFixed(2)}`,
          amount,
          frequency: 'monthly',
          billType: 'one-off',
          status: 'draft',
          nextDueDate: ACCRUAL_DATE,
          billDate: ACCRUAL_DATE,
          categoryId: expenseGl,
          familyId: FAMILY,
        },
        select: { id: true },
      })
      billIds.push(bill.id)

      const result = await approveBillDraft(USER, bill.id)
      expect(result.journalEntryId, `approval of ${amount} bill posted no journal`).toBeTruthy()

      const ap = await findControlAccount(prisma, FAMILY, 'liability', 'accounts payable')
      expect(ap, 'posting layer must create/resolve exactly one AP control account').toBeTruthy()
      apControl = ap!

      await assertJournalPosts(prisma, result.journalEntryId, [
        { glAccountId: expenseGl, side: 'debit', amount },
        { glAccountId: apControl, side: 'credit', amount },
      ])
    }

    // §6.2 AP subledger↔GL: AP control credit balance = Σ open accruals
    const apTotal = r2(BILL_AMOUNTS.reduce((s, a) => s + a, 0))
    expect(Math.abs((await glNetBalance(prisma, apControl)) - -apTotal)).toBeLessThanOrEqual(BALANCE_EPSILON)
    await assertPostedLedgerInvariants(prisma, FAMILY)
  }, 60_000)

  it('bill payments (full + split installments) clear AP to exactly zero', async () => {
    const payBill = async (billId: string, amount: number, isFullyPaid: boolean) => {
      const bill = await prisma.financeRecurringBill.findUniqueOrThrow({ where: { id: billId } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return prisma.$transaction(async (tx: any) =>
        recordBillPayment(tx, {
          bill,
          amount,
          actualDate: SETTLE_DATE,
          creditGlAccountId: bankGl,
          usingSuspense: false,
          glAccountId: bankGl,
          paymentAccountId: null,
          notes: null,
          isFullyPaid,
          userId: USER.id,
          familyId: FAMILY,
        }),
      )
    }

    // Three full payments + one bill settled in two installments.
    const payments: { paymentId: string; amount: number }[] = []
    for (let i = 0; i < 3; i++) {
      const { paymentId } = await payBill(billIds[i], BILL_AMOUNTS[i], true)
      payments.push({ paymentId, amount: BILL_AMOUNTS[i] })
    }
    const splitBillId = billIds[3]
    const first = await payBill(splitBillId, INSTALLMENTS[0], false)
    payments.push({ paymentId: first.paymentId, amount: INSTALLMENTS[0] })
    const midBill = await prisma.financeRecurringBill.findUniqueOrThrow({ where: { id: splitBillId } })
    expect(midBill.paid, 'partial installment must not mark the bill paid').toBe(false)
    const second = await payBill(splitBillId, INSTALLMENTS[1], true)
    payments.push({ paymentId: second.paymentId, amount: INSTALLMENTS[1] })

    // §2.3: every payment journal is exactly DR AP / CR Bank at its amount.
    for (const p of payments) {
      const rec = await prisma.financeBillPayment.findUniqueOrThrow({
        where: { id: p.paymentId },
        select: { journalEntryId: true },
      })
      expect(rec.journalEntryId, 'payment must link its GL journal (BILL_PAID_NO_PAYMENT_GL)').toBeTruthy()
      await assertJournalPosts(prisma, rec.journalEntryId, [
        { glAccountId: apControl, side: 'debit', amount: p.amount },
        { glAccountId: bankGl, side: 'credit', amount: p.amount },
      ])
    }

    // All bills terminal 'paid'; AP control clears to zero (§6.2).
    for (const id of billIds) {
      const b = await prisma.financeRecurringBill.findUniqueOrThrow({ where: { id } })
      expect(b.paid).toBe(true)
      expect(b.status).toBe('paid')
    }
    expect(Math.abs(await glNetBalance(prisma, apControl))).toBeLessThanOrEqual(BALANCE_EPSILON)
    await assertPostedLedgerInvariants(prisma, FAMILY)
  }, 60_000)

  // ── Simple income lifecycle ────────────────────────────────────────────────

  it('income approval posts DR AR / CR Income for every adversarial amount', async () => {
    for (const amount of INCOME_AMOUNTS) {
      const entry = await prisma.financeIncomeEntry.create({
        data: {
          name: `QA Income ${amount.toFixed(2)}`,
          amount,
          incomeType: 'one-off',
          status: 'draft',
          nextExpectedDate: ACCRUAL_DATE,
          categoryId: incomeGl,
          familyId: FAMILY,
        },
        select: { id: true },
      })
      incomeIds.push(entry.id)

      const result = await approveIncomeDraft(USER, entry.id)
      expect(result.journalEntryId, `approval of ${amount} income posted no journal`).toBeTruthy()

      const ar = await findControlAccount(prisma, FAMILY, 'asset', 'accounts receivable')
      expect(ar, 'posting layer must create/resolve exactly one AR control account').toBeTruthy()
      arControl = ar!

      await assertJournalPosts(prisma, result.journalEntryId, [
        { glAccountId: arControl, side: 'debit', amount },
        { glAccountId: incomeGl, side: 'credit', amount },
      ])
    }

    // §6.2 AR subledger↔GL: AR control debit balance = Σ open accruals
    const arTotal = r2(INCOME_AMOUNTS.reduce((s, a) => s + a, 0))
    expect(Math.abs((await glNetBalance(prisma, arControl)) - arTotal)).toBeLessThanOrEqual(BALANCE_EPSILON)
    await assertPostedLedgerInvariants(prisma, FAMILY)
  }, 60_000)

  it('income receipts post DR Bank / CR AR and clear AR to exactly zero', async () => {
    for (let i = 0; i < incomeIds.length; i++) {
      const id = incomeIds[i]
      const amount = INCOME_AMOUNTS[i]
      const entry = await prisma.financeIncomeEntry.findUniqueOrThrow({ where: { id } })

      // Mirror income PATCH Stage 2 MODE B exactly (BUG B open-AR match, receipt
      // journal, receipt FinanceTransaction, status flip) inside one $transaction.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.$transaction(async (tx: any) => {
        const arLines = await tx.financeJournalLine.findMany({
          where: { journalEntryId: entry.journalEntryId, glAccountId: arControl },
          select: { side: true, amount: true },
        })
        const openAr = arLines.reduce(
          (sum: number, l: { side: string; amount: number }) => sum + (l.side === 'debit' ? l.amount : -l.amount),
          0,
        )
        expect(Math.abs(openAr - amount), 'BUG B: receipt must equal open AR').toBeLessThanOrEqual(BALANCE_EPSILON)

        const receipt = await postIncomeReceiptJournal(tx, {
          familyId: FAMILY,
          description: entry.name,
          amount,
          bankGlAccountId: bankGl,
          entityId: null,
          date: SETTLE_DATE,
        })
        const newTx = await tx.financeTransaction.create({
          data: {
            type: 'income', amount,
            accountId: null, categoryId: entry.categoryId,
            description: entry.name, date: SETTLE_DATE,
            isRecurring: false,
            isCleared: true, reconciledDate: SETTLE_DATE,
            isTransfer: false,
            glAccountId: bankGl,
            createdBy: USER.id, familyId: FAMILY,
          },
          select: { id: true },
        })
        await tx.financeIncomeEntry.update({
          where: { id },
          data: {
            received: true,
            receivedDate: SETTLE_DATE,
            receiptJournalEntryId: receipt.journalEntryId,
            actualAmountReceived: amount,
            status: 'received',
            receiptTxId: newTx.id,
            transactionId: newTx.id,
          },
        })
      })

      const updated = await prisma.financeIncomeEntry.findUniqueOrThrow({ where: { id } })
      await assertJournalPosts(prisma, updated.receiptJournalEntryId, [
        { glAccountId: bankGl, side: 'debit', amount },
        { glAccountId: arControl, side: 'credit', amount },
      ])
    }

    // §6.2: AR control clears to zero once all receipts land.
    expect(Math.abs(await glNetBalance(prisma, arControl))).toBeLessThanOrEqual(BALANCE_EPSILON)
    await assertPostedLedgerInvariants(prisma, FAMILY)
  }, 60_000)

  // ── Payslip lifecycle ──────────────────────────────────────────────────────

  it('payslip approval posts NO journal (recognition waits for the receipt)', async () => {
    const specs = [
      { name: 'QA Salary P1', gross: P1.gross, net: P1.net, payg: P1.payg, sgc: P1.sgc,
        deductions: [{ label: 'Health fund', amount: P1.deduction, glAccountId: deductionGl }] },
      { name: 'QA Salary P2', gross: P2.gross, net: P2.net, payg: P2.payg, sgc: 0,
        deductions: [] as { label: string; amount: number; glAccountId: string }[] },
    ]
    const journalsBefore = await prisma.financeJournalEntry.count({ where: { familyId: FAMILY } })

    for (const s of specs) {
      const entry = await prisma.financeIncomeEntry.create({
        data: {
          name: s.name,
          amount: s.net,
          incomeType: 'one-off',
          status: 'draft',
          nextExpectedDate: ACCRUAL_DATE,
          categoryId: grossIncomeGl,
          familyId: FAMILY,
        },
        select: { id: true },
      })
      payslipEntryIds.push(entry.id)
      await prisma.financePayslip.create({
        data: {
          incomeEntryId: entry.id,
          familyId: FAMILY,
          grossPay: s.gross,
          netPay: s.net,
          paygWithheld: s.payg,
          sgcAmount: s.sgc,
          grossIncomeGlAccountId: grossIncomeGl,
          bankGlAccountId: bankGl,
          paygGlAccountId: paygGl,
          sgcGlAccountId: s.sgc > 0 ? sgcAssetGl : null,
          sgcIncomeGlAccountId: s.sgc > 0 ? sgcIncomeGl : null,
          deductions: JSON.stringify(s.deductions),
        },
      })

      const result = await approveIncomeDraft(USER, entry.id)
      expect(result.status).toBe('awaiting_receipt')
      expect(result.journalEntryId, 'payslip approval must not post an accrual').toBeNull()

      const approved = await prisma.financeIncomeEntry.findUniqueOrThrow({ where: { id: entry.id } })
      expect(approved.journalEntryId).toBeNull()
      expect(approved.postedAt).toBeNull()
    }

    const journalsAfter = await prisma.financeJournalEntry.count({ where: { familyId: FAMILY } })
    expect(journalsAfter, 'payslip approval created a journal entry').toBe(journalsBefore)
  }, 60_000)

  it('payslip receipts post the exact multi-line decomposition (gross/net/PAYG/deductions/SGC)', async () => {
    const receive = async (
      id: string,
      s: { gross: number; net: number; payg: number; sgc: number; deductions: { label: string; amount: number; glAccountId: string }[] },
    ) => {
      const entry = await prisma.financeIncomeEntry.findUniqueOrThrow({ where: { id } })
      // Mirror income PATCH Stage 2 MODE A exactly inside one $transaction.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.$transaction(async (tx: any) => {
        const receipt = await postPayslipReceiptJournal(tx, {
          familyId: FAMILY,
          description: entry.name,
          grossPay: s.gross,
          netPay: s.net,
          grossIncomeGlAccountId: grossIncomeGl,
          bankGlAccountId: bankGl,
          paygWithheld: s.payg,
          paygGlAccountId: paygGl,
          sgcAmount: s.sgc,
          sgcGlAccountId: s.sgc > 0 ? sgcAssetGl : null,
          sgcIncomeGlAccountId: s.sgc > 0 ? sgcIncomeGl : null,
          deductions: s.deductions,
          entityId: null,
          memberId: null,
          date: SETTLE_DATE,
        })
        await tx.financePayslip.deleteMany({ where: { incomeEntryId: id } })
        await tx.financePayslip.create({
          data: {
            incomeEntryId: id,
            familyId: FAMILY,
            grossPay: s.gross,
            netPay: s.net,
            paygWithheld: s.payg,
            sgcAmount: s.sgc,
            grossIncomeGlAccountId: grossIncomeGl,
            bankGlAccountId: bankGl,
            paygGlAccountId: paygGl,
            sgcGlAccountId: s.sgc > 0 ? sgcAssetGl : null,
            sgcIncomeGlAccountId: s.sgc > 0 ? sgcIncomeGl : null,
            deductions: JSON.stringify(s.deductions),
          },
        })
        const newTx = await tx.financeTransaction.create({
          data: {
            type: 'income', amount: s.net,
            accountId: null, categoryId: entry.categoryId,
            description: entry.name, date: SETTLE_DATE,
            isRecurring: false,
            isCleared: true, reconciledDate: SETTLE_DATE,
            isTransfer: false,
            glAccountId: bankGl,
            createdBy: USER.id, familyId: FAMILY,
          },
          select: { id: true },
        })
        await tx.financeIncomeEntry.update({
          where: { id },
          data: {
            received: true,
            receivedDate: SETTLE_DATE,
            receiptJournalEntryId: receipt.journalEntryId,
            actualAmountReceived: s.net,
            status: 'received',
            receiptTxId: newTx.id,
            transactionId: newTx.id,
          },
        })
      })
      return prisma.financeIncomeEntry.findUniqueOrThrow({ where: { id } })
    }

    // P1: full decomposition including the self-balancing SGC pair.
    const e1 = await receive(payslipEntryIds[0], {
      gross: P1.gross, net: P1.net, payg: P1.payg, sgc: P1.sgc,
      deductions: [{ label: 'Health fund', amount: P1.deduction, glAccountId: deductionGl }],
    })
    await assertJournalPosts(prisma, e1.receiptJournalEntryId, [
      { glAccountId: grossIncomeGl, side: 'credit', amount: P1.gross },
      { glAccountId: bankGl, side: 'debit', amount: P1.net },
      { glAccountId: paygGl, side: 'debit', amount: P1.payg },
      { glAccountId: deductionGl, side: 'debit', amount: P1.deduction },
      { glAccountId: sgcAssetGl, side: 'debit', amount: P1.sgc },
      { glAccountId: sgcIncomeGl, side: 'credit', amount: P1.sgc },
    ])

    // P2: off-cent identity, no SGC, no deductions — exactly three lines.
    const e2 = await receive(payslipEntryIds[1], {
      gross: P2.gross, net: P2.net, payg: P2.payg, sgc: 0, deductions: [],
    })
    await assertJournalPosts(prisma, e2.receiptJournalEntryId, [
      { glAccountId: grossIncomeGl, side: 'credit', amount: P2.gross },
      { glAccountId: bankGl, side: 'debit', amount: P2.net },
      { glAccountId: paygGl, side: 'debit', amount: P2.payg },
    ])

    // §6.4 PAYG reconciliation: PAYG receivable carries exactly the withheld total.
    const paygTotal = r2(P1.payg + P2.payg)
    expect(Math.abs((await glNetBalance(prisma, paygGl)) - paygTotal)).toBeLessThanOrEqual(BALANCE_EPSILON)
    await assertPostedLedgerInvariants(prisma, FAMILY)
  }, 60_000)

  // ── Final reconciliation ───────────────────────────────────────────────────

  it('final: subledgers reconcile to the GL, P&L accounts carry the right totals, audit fully green', async () => {
    // Control accounts fully cleared (§6.2).
    expect(Math.abs(await glNetBalance(prisma, apControl))).toBeLessThanOrEqual(BALANCE_EPSILON)
    expect(Math.abs(await glNetBalance(prisma, arControl))).toBeLessThanOrEqual(BALANCE_EPSILON)

    // Bank = seed DR 100 + income receipts + payslip nets − bill payments.
    const billTotal = BILL_AMOUNTS.reduce((s, a) => s + a, 0)
    const incomeTotal = INCOME_AMOUNTS.reduce((s, a) => s + a, 0)
    const expectedBank = r2(100 + incomeTotal + P1.net + P2.net - billTotal)
    expect(Math.abs((await glNetBalance(prisma, bankGl)) - expectedBank)).toBeLessThanOrEqual(BALANCE_EPSILON)

    // P&L: expenses net-debit at their posted totals; income net-credit.
    expect(Math.abs((await glNetBalance(prisma, expenseGl)) - r2(billTotal))).toBeLessThanOrEqual(BALANCE_EPSILON)
    expect(Math.abs((await glNetBalance(prisma, incomeGl)) - -r2(incomeTotal))).toBeLessThanOrEqual(BALANCE_EPSILON)
    expect(Math.abs((await glNetBalance(prisma, grossIncomeGl)) - -r2(P1.gross + P2.gross))).toBeLessThanOrEqual(BALANCE_EPSILON)
    expect(Math.abs((await glNetBalance(prisma, deductionGl)) - P1.deduction)).toBeLessThanOrEqual(BALANCE_EPSILON)
    // SGC pair: accrued asset DR / SGC income CR at the same figure.
    expect(Math.abs((await glNetBalance(prisma, sgcAssetGl)) - P1.sgc)).toBeLessThanOrEqual(BALANCE_EPSILON)
    expect(Math.abs((await glNetBalance(prisma, sgcIncomeGl)) - -P1.sgc)).toBeLessThanOrEqual(BALANCE_EPSILON)

    await assertPostedLedgerInvariants(prisma, FAMILY)

    // The read-only audit is the independent oracle: no new findings of any
    // severity vs the pre-lifecycle baseline, and every check named in QA.md
    // §2/§5/§6 reports 'pass'.
    const after = await runFinanceIntegrityAudit(FAMILY)
    expect(after.summary.critical, 'lifecycles introduced critical audit findings').toBe(baseline.summary.critical)
    expect(after.summary.warning, 'lifecycles introduced warning audit findings').toBe(baseline.summary.warning)
    assertAuditCodesPass(after, [
      'BILL_ACCRUAL_MISSING', 'BILL_ACCRUAL_STALE', 'BILL_ACCRUAL_MISMATCH', 'BILL_ACCRUAL_SPLIT',
      'BILL_TAXPOINT_DIVERGENT', 'BILL_PAID_NO_PAYMENT_GL',
      'INCOME_ACCRUAL_MISSING', 'INCOME_ACCRUAL_STALE', 'INCOME_ACCRUAL_MISMATCH', 'INCOME_ACCRUAL_SPLIT',
      'INCOME_TAXPOINT_DIVERGENT', 'INCOME_RECEIVED_NO_RECEIPT_GL',
      'TX_JOURNAL_ACCOUNT_DRIFT', 'ORPHANED_AUTO_JOURNAL', 'ORPHANED_DRAFT_JOURNAL',
      'TRIAL_BALANCE_UNBALANCED', 'JOURNAL_ENTRY_UNBALANCED', 'NONPOSITIVE_LINE_AMOUNT',
      'REVERSAL_PAIR_BROKEN',
      'AP_CONTROL_VS_SUBLEDGER', 'AR_CONTROL_VS_SUBLEDGER',
      'AP_CONTROL_UNRESOLVED', 'AR_CONTROL_UNRESOLVED',
      'NORMAL_BALANCE_VIOLATION', 'MEMBER_ATTRIBUTION_DANGLING', 'DUPLICATE_DRAFT_SPAWN',
      'GST_SPLIT_DIVERGENT',
      'PAYSLIP_GROSS_MISMATCH', 'PAYSLIP_JOURNAL_TOTAL', 'PAYSLIP_SGC_ACCOUNTS_PRESENT',
      'PAYSLIP_NET_EXCEEDS_GROSS', 'PAYG_WITHHELD_RECONCILIATION',
      'DATE_REQUIRED_PRESENT', 'FUTURE_DATED_POSTING',
    ])
  }, 30_000)
})
