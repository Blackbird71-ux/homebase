/**
 * Integrity-audit RED tests — prove the auditor's green is reachable-to-red. (WI-0b)
 *
 * The integration suites that exercise the real posting helpers assert the audit
 * stays GREEN. That only means something if the same audit actually turns RED when a
 * known bug class is present — otherwise a check that never fires (a dead assertion)
 * reads as a permanent pass. This suite injects each known divergence directly into a
 * self-seeded throwaway DB and asserts the corresponding check flips pass→fail with a
 * finding of the expected severity, then cleans the injection back out so the next
 * case starts from the same clean baseline (each case's "clean before" assertion is
 * therefore also proof the previous case cleaned up).
 *
 * Standing rule: the live DB (data/homebase.db) may be READ but never mutated. This
 * never touches it — `setupFinanceTestDb` builds its own database from
 * prisma/schema.prisma. Run locally: `npx vitest run finance-integrity-red`.
 *
 * Bug class → check proven here:
 *   • unbalanced fallback      → JOURNAL_ENTRY_UNBALANCED + TRIAL_BALANCE_UNBALANCED
 *   • non-positive line        → NONPOSITIVE_LINE_AMOUNT
 *   • voided-still-aging (bill)→ BILL_ACCRUAL_STALE
 *   • voided-still-aging (inc) → INCOME_ACCRUAL_STALE  (bills↔income parity)
 *   • stranded receipt JE      → AR_CONTROL_VS_SUBLEDGER
 *   • payslip double-count     → PAYSLIP_JOURNAL_TOTAL
 *   • short/incomplete amort.  → PREPAYMENT_AMORTISATION_INCOMPLETE
 *   • 3-line GST category drift→ TX_JOURNAL_ACCOUNT_DRIFT
 *   • dangling member (account) → MEMBER_ATTRIBUTION_DANGLING
 *   • dangling member (income)  → MEMBER_ATTRIBUTION_DANGLING (parity)
 *   • duplicate draft (bill)    → DUPLICATE_DRAFT_SPAWN
 *   • duplicate draft (income)  → DUPLICATE_DRAFT_SPAWN (parity)
 *
 * DUPLICATE SPAWN (two draft successors for one occurrence) produces no GL anomaly —
 * each draft's journal is unposted (so ORPHANED_DRAFT_JOURNAL ignores it while linked),
 * and once paid both the AP/AR control and subledger double together, so they still
 * reconcile. DUPLICATE_DRAFT_SPAWN is the only check that sees it; the invariant is per
 * (template, occurrence-day), NOT per parent (catch-up legitimately spawns several drafts
 * across different days). Proven RED below. P10-G1 (3-line GST drift on cash-leg) remains
 * the only logged auditor gap without a check.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupFinanceTestDb, FINANCE_TEST_FAMILY, type FinanceTestDb } from './_finance-test-db'

const FAMILY = FINANCE_TEST_FAMILY
const DAY = 86_400_000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Audit = any
const status = (a: Audit, code: string): string | undefined =>
  a.checks.find((c: { code: string }) => c.code === code)?.status
const findings = (a: Audit, code: string) =>
  a.findings.filter((f: { code: string }) => f.code === code)

describe('Integrity audit — RED reachability (injected bugs flip the audit)', () => {
  let fx: FinanceTestDb
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let runFinanceIntegrityAudit: any
  let A: string // assetA (QA Bank)
  let B: string // assetB (QA Savings)
  let C: string // assetC (QA Petty Cash)
  let ref = 9000
  const nextRef = () => `JE-RED${ref++}`

  beforeAll(async () => {
    fx = await setupFinanceTestDb('hb-red-')
    prisma = fx.prisma
    ;({ runFinanceIntegrityAudit } = await import('../finance-integrity'))
    A = fx.accounts.assetA
    B = fx.accounts.assetB
    C = fx.accounts.assetC
  }, 120_000)

  afterAll(async () => {
    await fx?.cleanup()
  })

  it('seeded baseline is clean (every target check passes, no critical/warning)', async () => {
    const a = await runFinanceIntegrityAudit(FAMILY)
    expect(a.summary.critical).toBe(0)
    expect(a.summary.warning).toBe(0)
    for (const code of [
      'JOURNAL_ENTRY_UNBALANCED', 'TRIAL_BALANCE_UNBALANCED', 'NONPOSITIVE_LINE_AMOUNT',
      'BILL_ACCRUAL_STALE', 'INCOME_ACCRUAL_STALE', 'AR_CONTROL_VS_SUBLEDGER', 'PAYSLIP_JOURNAL_TOTAL',
    ]) {
      expect(status(a, code), code).toBe('pass')
    }
  })

  it('unbalanced posted entry → JOURNAL_ENTRY_UNBALANCED + TRIAL_BALANCE_UNBALANCED critical', async () => {
    const before = await runFinanceIntegrityAudit(FAMILY)
    expect(status(before, 'JOURNAL_ENTRY_UNBALANCED')).toBe('pass')
    expect(status(before, 'TRIAL_BALANCE_UNBALANCED')).toBe('pass')

    const je = await prisma.financeJournalEntry.create({
      data: {
        reference: nextRef(), date: new Date('2026-02-01T00:00:00Z'),
        description: 'RED unbalanced entry', type: 'manual', isPosted: true, familyId: FAMILY,
        lines: { create: [
          { glAccountId: A, side: 'debit', amount: 100 },
          { glAccountId: B, side: 'credit', amount: 90 }, // DR 100 ≠ CR 90
        ] },
      },
      select: { id: true },
    })
    try {
      const after = await runFinanceIntegrityAudit(FAMILY)
      expect(status(after, 'JOURNAL_ENTRY_UNBALANCED')).toBe('fail')
      expect(status(after, 'TRIAL_BALANCE_UNBALANCED')).toBe('fail')
      expect(findings(after, 'JOURNAL_ENTRY_UNBALANCED').some((f: { severity: string }) => f.severity === 'critical')).toBe(true)
      expect(findings(after, 'TRIAL_BALANCE_UNBALANCED').some((f: { severity: string }) => f.severity === 'critical')).toBe(true)
    } finally {
      await prisma.financeJournalEntry.delete({ where: { id: je.id } })
    }
  })

  it('zero-amount line on a balanced posted entry → NONPOSITIVE_LINE_AMOUNT critical', async () => {
    const before = await runFinanceIntegrityAudit(FAMILY)
    expect(status(before, 'NONPOSITIVE_LINE_AMOUNT')).toBe('pass')

    const je = await prisma.financeJournalEntry.create({
      data: {
        reference: nextRef(), date: new Date('2026-02-02T00:00:00Z'),
        description: 'RED zero-amount line', type: 'manual', isPosted: true, familyId: FAMILY,
        lines: { create: [
          { glAccountId: A, side: 'debit', amount: 100 },
          { glAccountId: B, side: 'credit', amount: 100 }, // entry stays balanced (TB unaffected)
          { glAccountId: C, side: 'debit', amount: 0 },    // non-positive line
        ] },
      },
      select: { id: true },
    })
    try {
      const after = await runFinanceIntegrityAudit(FAMILY)
      expect(status(after, 'NONPOSITIVE_LINE_AMOUNT')).toBe('fail')
      // Isolated: the entry balances, so the unbalanced checks must stay green.
      expect(status(after, 'JOURNAL_ENTRY_UNBALANCED')).toBe('pass')
      expect(status(after, 'TRIAL_BALANCE_UNBALANCED')).toBe('pass')
    } finally {
      await prisma.financeJournalEntry.delete({ where: { id: je.id } })
    }
  })

  it('voided bill still carrying a live accrual → BILL_ACCRUAL_STALE critical', async () => {
    const before = await runFinanceIntegrityAudit(FAMILY)
    expect(status(before, 'BILL_ACCRUAL_STALE')).toBe('pass')

    const accrual = await prisma.financeJournalEntry.create({
      data: {
        reference: nextRef(), date: new Date('2026-02-03T00:00:00Z'),
        description: 'RED voided-bill accrual', type: 'auto_transaction', isPosted: true, familyId: FAMILY,
        lines: { create: [
          { glAccountId: A, side: 'debit', amount: 50 },
          { glAccountId: B, side: 'credit', amount: 50 },
        ] },
      },
      select: { id: true },
    })
    const bill = await prisma.financeRecurringBill.create({
      data: {
        name: 'RED Voided Bill', amount: 50, nextDueDate: new Date('2026-02-03T00:00:00Z'),
        invoiceReceived: true, isVoided: true, journalEntryId: accrual.id, familyId: FAMILY,
      },
      select: { id: true },
    })
    try {
      const after = await runFinanceIntegrityAudit(FAMILY)
      expect(status(after, 'BILL_ACCRUAL_STALE')).toBe('fail')
      expect(findings(after, 'BILL_ACCRUAL_STALE').some((f: { severity: string; recordId: string }) =>
        f.severity === 'critical' && f.recordId === bill.id)).toBe(true)
    } finally {
      await prisma.financeRecurringBill.delete({ where: { id: bill.id } })
      await prisma.financeJournalEntry.delete({ where: { id: accrual.id } })
    }
  })

  it('voided income still carrying a live accrual → INCOME_ACCRUAL_STALE critical (parity)', async () => {
    const before = await runFinanceIntegrityAudit(FAMILY)
    expect(status(before, 'INCOME_ACCRUAL_STALE')).toBe('pass')

    const accrual = await prisma.financeJournalEntry.create({
      data: {
        reference: nextRef(), date: new Date('2026-02-04T00:00:00Z'),
        description: 'RED voided-income accrual', type: 'auto_transaction', isPosted: true, familyId: FAMILY,
        lines: { create: [
          { glAccountId: A, side: 'debit', amount: 70 },
          { glAccountId: B, side: 'credit', amount: 70 },
        ] },
      },
      select: { id: true },
    })
    const income = await prisma.financeIncomeEntry.create({
      data: {
        name: 'RED Voided Income', amount: 70, nextExpectedDate: new Date('2026-02-04T00:00:00Z'),
        invoiceReceived: true, isVoided: true, journalEntryId: accrual.id, familyId: FAMILY,
      },
      select: { id: true },
    })
    try {
      const after = await runFinanceIntegrityAudit(FAMILY)
      expect(status(after, 'INCOME_ACCRUAL_STALE')).toBe('fail')
      expect(findings(after, 'INCOME_ACCRUAL_STALE').some((f: { severity: string; recordId: string }) =>
        f.severity === 'critical' && f.recordId === income.id)).toBe(true)
    } finally {
      await prisma.financeIncomeEntry.delete({ where: { id: income.id } })
      await prisma.financeJournalEntry.delete({ where: { id: accrual.id } })
    }
  })

  it('stranded receipt JE (AR cleared in GL but income still outstanding) → AR_CONTROL_VS_SUBLEDGER critical', async () => {
    const before = await runFinanceIntegrityAudit(FAMILY)
    expect(status(before, 'AR_CONTROL_VS_SUBLEDGER')).toBe('pass')

    // A system AR control account (asset) + a revenue account, so the AR reconciliation
    // actually runs (it is skipped when no control account resolves).
    const ar = await prisma.financeCategory.create({
      data: { familyId: FAMILY, name: 'Accounts Receivable', type: 'asset', isSystem: true }, select: { id: true },
    })
    const rev = await prisma.financeCategory.create({
      data: { familyId: FAMILY, name: 'RED Revenue', type: 'income' }, select: { id: true },
    })
    const taxPoint = new Date(Date.now() - 30 * DAY)
    // Accrual: DR AR / CR Revenue — income still outstanding (received=false).
    const accrual = await prisma.financeJournalEntry.create({
      data: {
        reference: nextRef(), date: taxPoint, description: 'RED AR accrual',
        type: 'auto_transaction', isPosted: true, familyId: FAMILY,
        lines: { create: [
          { glAccountId: ar.id, side: 'debit', amount: 100 },
          { glAccountId: rev.id, side: 'credit', amount: 100 },
        ] },
      },
      select: { id: true },
    })
    // The STRANDED receipt: CR AR / DR Bank clears the AR control in the GL, but the
    // income row was never marked received — so subledger (100) ≠ control (0).
    const stranded = await prisma.financeJournalEntry.create({
      data: {
        reference: nextRef(), date: new Date(Date.now() - 20 * DAY), description: 'RED stranded receipt',
        type: 'manual', isPosted: true, familyId: FAMILY,
        lines: { create: [
          { glAccountId: A, side: 'debit', amount: 100 },
          { glAccountId: ar.id, side: 'credit', amount: 100 },
        ] },
      },
      select: { id: true },
    })
    const income = await prisma.financeIncomeEntry.create({
      data: {
        name: 'RED AR Income', amount: 100, nextExpectedDate: taxPoint,
        invoiceReceived: true, invoiceReceivedDate: taxPoint, received: false, isVoided: false,
        categoryId: rev.id, journalEntryId: accrual.id, familyId: FAMILY,
      },
      select: { id: true },
    })
    try {
      const after = await runFinanceIntegrityAudit(FAMILY)
      expect(status(after, 'AR_CONTROL_VS_SUBLEDGER')).toBe('fail')
      expect(findings(after, 'AR_CONTROL_VS_SUBLEDGER').some((f: { severity: string }) => f.severity === 'critical')).toBe(true)
      // Sanity: the AR control resolved (no UNRESOLVED skip) and the accrual matched
      // the row (no accrual-mismatch noise) — the failure is the reconciliation only.
      expect(status(after, 'AR_CONTROL_UNRESOLVED')).toBe('pass')
      expect(status(after, 'INCOME_ACCRUAL_MISMATCH')).toBe('pass')
    } finally {
      await prisma.financeIncomeEntry.delete({ where: { id: income.id } })
      await prisma.financeJournalEntry.delete({ where: { id: stranded.id } })
      await prisma.financeJournalEntry.delete({ where: { id: accrual.id } })
      await prisma.financeCategory.delete({ where: { id: rev.id } })
      await prisma.financeCategory.delete({ where: { id: ar.id } })
    }
  })

  it('payslip whose receipt journal double-counts (DR/CR = 2× gross) → PAYSLIP_JOURNAL_TOTAL critical', async () => {
    const before = await runFinanceIntegrityAudit(FAMILY)
    expect(status(before, 'PAYSLIP_JOURNAL_TOTAL')).toBe('pass')

    // Receipt journal that balances (so JOURNAL_ENTRY_UNBALANCED stays green) but
    // totals 200 each side — twice the payslip's 100 gross.
    const receipt = await prisma.financeJournalEntry.create({
      data: {
        reference: nextRef(), date: new Date('2026-02-06T00:00:00Z'), description: 'RED payslip receipt',
        type: 'auto_transaction', isPosted: true, familyId: FAMILY,
        lines: { create: [
          { glAccountId: A, side: 'debit', amount: 200 },
          { glAccountId: B, side: 'credit', amount: 200 },
        ] },
      },
      select: { id: true },
    })
    // invoiceReceived=false keeps the accrual checks out of it; the income exists only
    // to host the receipt journal and label the payslip.
    const income = await prisma.financeIncomeEntry.create({
      data: {
        name: 'RED Payslip Income', amount: 100, nextExpectedDate: new Date('2026-02-06T00:00:00Z'),
        invoiceReceived: false, received: false, isVoided: false,
        receiptJournalEntryId: receipt.id, familyId: FAMILY,
      },
      select: { id: true },
    })
    const payslip = await prisma.financePayslip.create({
      data: { incomeEntryId: income.id, familyId: FAMILY, grossPay: 100, netPay: 100 },
      select: { id: true },
    })
    try {
      const after = await runFinanceIntegrityAudit(FAMILY)
      expect(status(after, 'PAYSLIP_JOURNAL_TOTAL')).toBe('fail')
      expect(findings(after, 'PAYSLIP_JOURNAL_TOTAL').some((f: { severity: string; recordId: string }) =>
        f.severity === 'critical' && f.recordId === payslip.id)).toBe(true)
      // The receipt balances, so the magnitude check is what fired — not DR≠CR.
      expect(status(after, 'JOURNAL_ENTRY_UNBALANCED')).toBe('pass')
    } finally {
      await prisma.financePayslip.delete({ where: { id: payslip.id } })
      await prisma.financeIncomeEntry.delete({ where: { id: income.id } })
      await prisma.financeJournalEntry.delete({ where: { id: receipt.id } })
    }
  })

  it('prepayment whose amortisation lines do not total the capitalised net → PREPAYMENT_AMORTISATION_INCOMPLETE critical', async () => {
    const before = await runFinanceIntegrityAudit(FAMILY)
    expect(status(before, 'PREPAYMENT_AMORTISATION_INCOMPLETE')).toBe('pass')

    // totalNet 120 but the three lines sum to 100 — the schedule can never release
    // Prepaid Expenses back to zero. A/B stand in as the prepaid/expense accounts;
    // the check inspects the schedule rows only, not account type.
    const schedule = await prisma.financePrepaymentSchedule.create({
      data: {
        familyId: FAMILY, prepaidAccountId: A, expenseAccountId: B,
        description: 'RED short-amortisation prepayment', totalNet: 120,
        coverageStart: new Date('2026-02-01T00:00:00Z'), coverageEnd: new Date('2026-04-30T00:00:00Z'),
        periodCount: 3, status: 'active',
        lines: { create: [
          { periodIndex: 0, periodDate: new Date('2026-02-01T00:00:00Z'), amount: 40 },
          { periodIndex: 1, periodDate: new Date('2026-03-01T00:00:00Z'), amount: 40 },
          { periodIndex: 2, periodDate: new Date('2026-04-01T00:00:00Z'), amount: 20 }, // sums to 100, not 120
        ] },
      },
      select: { id: true },
    })
    try {
      const after = await runFinanceIntegrityAudit(FAMILY)
      expect(status(after, 'PREPAYMENT_AMORTISATION_INCOMPLETE')).toBe('fail')
      expect(findings(after, 'PREPAYMENT_AMORTISATION_INCOMPLETE').some((f: { severity: string; recordId: string }) =>
        f.severity === 'critical' && f.recordId === schedule.id)).toBe(true)
    } finally {
      await prisma.financePrepaymentSchedule.delete({ where: { id: schedule.id } })
    }
  })

  it('completed prepayment with an unposted period → PREPAYMENT_AMORTISATION_INCOMPLETE critical', async () => {
    const before = await runFinanceIntegrityAudit(FAMILY)
    expect(status(before, 'PREPAYMENT_AMORTISATION_INCOMPLETE')).toBe('pass')

    // Lines sum to totalNet (60), but the schedule is flagged completed while one
    // period is still unposted — Prepaid Expenses retains 20 that should be zero.
    const schedule = await prisma.financePrepaymentSchedule.create({
      data: {
        familyId: FAMILY, prepaidAccountId: A, expenseAccountId: B,
        description: 'RED completed-but-unreleased prepayment', totalNet: 60,
        coverageStart: new Date('2026-02-01T00:00:00Z'), coverageEnd: new Date('2026-04-30T00:00:00Z'),
        periodCount: 3, status: 'completed',
        lines: { create: [
          { periodIndex: 0, periodDate: new Date('2026-02-01T00:00:00Z'), amount: 20, posted: true },
          { periodIndex: 1, periodDate: new Date('2026-03-01T00:00:00Z'), amount: 20, posted: true },
          { periodIndex: 2, periodDate: new Date('2026-04-01T00:00:00Z'), amount: 20, posted: false }, // not released
        ] },
      },
      select: { id: true },
    })
    try {
      const after = await runFinanceIntegrityAudit(FAMILY)
      expect(status(after, 'PREPAYMENT_AMORTISATION_INCOMPLETE')).toBe('fail')
      expect(findings(after, 'PREPAYMENT_AMORTISATION_INCOMPLETE').some((f: { severity: string; recordId: string }) =>
        f.severity === 'critical' && f.recordId === schedule.id)).toBe(true)
    } finally {
      await prisma.financePrepaymentSchedule.delete({ where: { id: schedule.id } })
    }
  })

  it('3-line transaction-sourced GST journal whose category leg drifts → TX_JOURNAL_ACCOUNT_DRIFT warning', async () => {
    const before = await runFinanceIntegrityAudit(FAMILY)
    expect(status(before, 'TX_JOURNAL_ACCOUNT_DRIFT')).toBe('pass')

    // System ITC account so the auditor can identify the GST leg read-only.
    const itc = await prisma.financeCategory.create({
      data: { name: 'GST Input Tax Credits', type: 'liability', isSystem: true, level: 0, familyId: FAMILY },
      select: { id: true },
    })
    // Expense transaction: cash = A, correct category = B.
    const tx = await prisma.financeTransaction.create({
      data: {
        type: 'expense', amount: 110, date: new Date('2026-02-10T00:00:00Z'),
        description: 'RED GST drift', glAccountId: A, categoryId: B,
        createdBy: 'red', familyId: FAMILY,
      },
      select: { id: true },
    })
    // 3-line GST journal that BALANCES (DR 110 = CR 110) but posts the category
    // leg to C instead of the transaction's category B — the drift.
    const journal = await prisma.financeJournalEntry.create({
      data: {
        reference: nextRef(), date: new Date('2026-02-10T00:00:00Z'), description: 'GST: RED GST drift',
        type: 'auto_transaction', isPosted: true, isReversed: false,
        sourceTransactionId: tx.id, familyId: FAMILY,
        lines: { create: [
          { glAccountId: C, side: 'debit', amount: 100 },   // category leg → wrong account (should be B)
          { glAccountId: itc.id, side: 'debit', amount: 10 }, // GST ITC leg
          { glAccountId: A, side: 'credit', amount: 110 },   // cash leg (correct)
        ] },
      },
      select: { id: true },
    })
    try {
      const after = await runFinanceIntegrityAudit(FAMILY)
      expect(status(after, 'TX_JOURNAL_ACCOUNT_DRIFT')).toBe('fail')
      expect(findings(after, 'TX_JOURNAL_ACCOUNT_DRIFT').some((f: { severity: string; recordId: string }) =>
        f.severity === 'warning' && f.recordId === tx.id)).toBe(true)
      // The journal balances, so it's the account-identity check that fired.
      expect(status(after, 'JOURNAL_ENTRY_UNBALANCED')).toBe('pass')
    } finally {
      await prisma.financeJournalEntry.delete({ where: { id: journal.id } })
      await prisma.financeTransaction.delete({ where: { id: tx.id } })
      await prisma.financeCategory.delete({ where: { id: itc.id } })
    }
  })

  it('account attributed to a non-existent member → MEMBER_ATTRIBUTION_DANGLING warning', async () => {
    const before = await runFinanceIntegrityAudit(FAMILY)
    expect(status(before, 'MEMBER_ATTRIBUTION_DANGLING')).toBe('pass')

    // memberId is a loose String? (no FK) — a deleted member leaves this id behind.
    const cat = await prisma.financeCategory.create({
      data: { familyId: FAMILY, name: 'RED Member Income', type: 'income', memberId: 'ghost-member-red' },
      select: { id: true },
    })
    try {
      const after = await runFinanceIntegrityAudit(FAMILY)
      expect(status(after, 'MEMBER_ATTRIBUTION_DANGLING')).toBe('fail')
      expect(findings(after, 'MEMBER_ATTRIBUTION_DANGLING').some((f: { severity: string; recordId: string }) =>
        f.severity === 'warning' && f.recordId === cat.id)).toBe(true)
    } finally {
      await prisma.financeCategory.delete({ where: { id: cat.id } })
    }
  })

  it('income attributed to a non-existent member → MEMBER_ATTRIBUTION_DANGLING warning (parity)', async () => {
    const before = await runFinanceIntegrityAudit(FAMILY)
    expect(status(before, 'MEMBER_ATTRIBUTION_DANGLING')).toBe('pass')

    const income = await prisma.financeIncomeEntry.create({
      data: {
        name: 'RED Member-attributed Income', amount: 80, nextExpectedDate: new Date('2026-02-12T00:00:00Z'),
        invoiceReceived: false, received: false, isVoided: false,
        memberId: 'ghost-member-red', familyId: FAMILY,
      },
      select: { id: true },
    })
    try {
      const after = await runFinanceIntegrityAudit(FAMILY)
      expect(status(after, 'MEMBER_ATTRIBUTION_DANGLING')).toBe('fail')
      expect(findings(after, 'MEMBER_ATTRIBUTION_DANGLING').some((f: { severity: string; recordId: string }) =>
        f.severity === 'warning' && f.recordId === income.id)).toBe(true)
    } finally {
      await prisma.financeIncomeEntry.delete({ where: { id: income.id } })
    }
  })

  it('two live bill drafts for one template occurrence → DUPLICATE_DRAFT_SPAWN warning', async () => {
    const before = await runFinanceIntegrityAudit(FAMILY)
    expect(status(before, 'DUPLICATE_DRAFT_SPAWN')).toBe('pass')

    const tpl = await prisma.financeRecurringTemplate.create({
      data: {
        familyId: FAMILY, kind: 'bill', name: 'RED Dup Bill Template', frequency: 'monthly', createdBy: 'red',
        startDate: new Date('2026-03-01T00:00:00Z'), nextOccurrenceDate: new Date('2026-03-01T00:00:00Z'),
      },
      select: { id: true },
    })
    const occ = new Date('2026-03-01T00:00:00Z')
    // Two non-cancelled, non-voided draft bills for the SAME (template, occurrence-day).
    const d1 = await prisma.financeRecurringBill.create({
      data: { name: 'RED Dup Bill', amount: 50, nextDueDate: occ, billDate: occ, templateId: tpl.id, status: 'draft', familyId: FAMILY },
      select: { id: true },
    })
    const d2 = await prisma.financeRecurringBill.create({
      data: { name: 'RED Dup Bill', amount: 50, nextDueDate: occ, billDate: occ, templateId: tpl.id, status: 'draft', familyId: FAMILY },
      select: { id: true },
    })
    try {
      const after = await runFinanceIntegrityAudit(FAMILY)
      expect(status(after, 'DUPLICATE_DRAFT_SPAWN')).toBe('fail')
      expect(findings(after, 'DUPLICATE_DRAFT_SPAWN').some((f: { severity: string; recordId: string }) =>
        f.severity === 'warning' && f.recordId === tpl.id)).toBe(true)
    } finally {
      await prisma.financeRecurringBill.delete({ where: { id: d1.id } })
      await prisma.financeRecurringBill.delete({ where: { id: d2.id } })
      await prisma.financeRecurringTemplate.delete({ where: { id: tpl.id } })
    }
  })

  it('two live income drafts for one template occurrence → DUPLICATE_DRAFT_SPAWN warning (parity)', async () => {
    const before = await runFinanceIntegrityAudit(FAMILY)
    expect(status(before, 'DUPLICATE_DRAFT_SPAWN')).toBe('pass')

    const tpl = await prisma.financeRecurringTemplate.create({
      data: {
        familyId: FAMILY, kind: 'income', name: 'RED Dup Income Template', frequency: 'monthly', createdBy: 'red',
        startDate: new Date('2026-03-15T00:00:00Z'), nextOccurrenceDate: new Date('2026-03-15T00:00:00Z'),
      },
      select: { id: true },
    })
    const occ = new Date('2026-03-15T00:00:00Z')
    const d1 = await prisma.financeIncomeEntry.create({
      data: { name: 'RED Dup Income', amount: 80, nextExpectedDate: occ, templateId: tpl.id, status: 'draft', familyId: FAMILY },
      select: { id: true },
    })
    const d2 = await prisma.financeIncomeEntry.create({
      data: { name: 'RED Dup Income', amount: 80, nextExpectedDate: occ, templateId: tpl.id, status: 'draft', familyId: FAMILY },
      select: { id: true },
    })
    try {
      const after = await runFinanceIntegrityAudit(FAMILY)
      expect(status(after, 'DUPLICATE_DRAFT_SPAWN')).toBe('fail')
      expect(findings(after, 'DUPLICATE_DRAFT_SPAWN').some((f: { severity: string; recordId: string }) =>
        f.severity === 'warning' && f.recordId === tpl.id)).toBe(true)
    } finally {
      await prisma.financeIncomeEntry.delete({ where: { id: d1.id } })
      await prisma.financeIncomeEntry.delete({ where: { id: d2.id } })
      await prisma.financeRecurringTemplate.delete({ where: { id: tpl.id } })
    }
  })

  it('baseline is clean again after every injection was cleaned up', async () => {
    const a = await runFinanceIntegrityAudit(FAMILY)
    expect(a.summary.critical).toBe(0)
    expect(a.summary.warning).toBe(0)
  })
})
