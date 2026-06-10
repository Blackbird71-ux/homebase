import { prisma } from '@/lib/prisma'
import { getFamilyTimezone } from '@/lib/family'
import { todayBoundsInTz } from '@/lib/timezone'
import { deriveJournalLineBalances } from '@/lib/finance-opening-balance'

/**
 * Finance Integrity Audit — strictly READ-ONLY.
 *
 * Detects the "row ↔ GL divergence" class of bug: a finance record's row state
 * (category, paid flag, amount, voided flag) disagreeing with the posted General
 * Ledger journal that should back it. Reports read only from posted journal lines,
 * so such divergence is invisible until reconciled directly — exactly how the Apco
 * bug (bill.category = Vehicles[expense] but accrual debited Visa Card[asset]) hid
 * an expense from the P&L.
 *
 * This module performs Prisma reads only — no create/update/delete, no $transaction.
 * Running it can never mutate data. It mirrors the read-only lookups used by the
 * report routes (e.g. AP/AR control-account discovery); it never calls the
 * `ensure*` helpers, which create categories when missing.
 */

const TOL = 0.01
const r2 = (n: number) => Math.round(n * 100) / 100
const approxEq = (a: number, b: number) => Math.abs(a - b) <= TOL

export type IntegrityFinding = {
  severity: 'critical' | 'warning' | 'info'
  code: string
  recordType: 'bill' | 'income' | 'transaction' | 'journal' | 'payslip' | 'gl'
  recordId: string
  label: string
  message: string
  detail?: Record<string, unknown>
}

export type IntegrityCheck = {
  code: string
  label: string
  status: 'pass' | 'fail'
  findingCount: number
}

export type AuditResult = {
  ranAt: string
  familyId: string
  asAt: string
  checks: IntegrityCheck[]
  findings: IntegrityFinding[]
  summary: {
    critical: number
    warning: number
    info: number
    passed: number
    failed: number
  }
}

// Catalog of every check, in display order. `status` is derived after the run:
// a check fails if it produced any critical/warning finding; info-only checks
// (the "split" lists) never fail — they are review aids.
const CHECK_CATALOG: { code: string; label: string }[] = [
  { code: 'BILL_ACCRUAL_MISSING',         label: 'Received bills have a posted accrual' },
  { code: 'BILL_ACCRUAL_STALE',           label: 'Voided/un-invoiced bills have no live accrual' },
  { code: 'BILL_ACCRUAL_MISMATCH',        label: 'Bill accrual matches row (category / amount / AP / entity)' },
  { code: 'BILL_ACCRUAL_SPLIT',           label: 'Bill accruals with custom splits (review)' },
  { code: 'BILL_TAXPOINT_DIVERGENT',      label: 'Bill tax point matches its accrual journal date' },
  { code: 'INCOME_ACCRUAL_MISSING',       label: 'Invoiced income has a posted accrual' },
  { code: 'INCOME_ACCRUAL_STALE',         label: 'Voided/un-invoiced income has no live accrual' },
  { code: 'INCOME_ACCRUAL_MISMATCH',      label: 'Income accrual matches row (category / amount / AR / entity)' },
  { code: 'INCOME_ACCRUAL_SPLIT',         label: 'Income accruals with custom splits (review)' },
  { code: 'INCOME_TAXPOINT_DIVERGENT',    label: 'Income tax point matches its accrual journal date' },
  { code: 'BILL_PAID_NO_PAYMENT_GL',      label: 'Paid bills have a payment journal' },
  { code: 'INCOME_RECEIVED_NO_RECEIPT_GL', label: 'Received income has a receipt journal' },
  { code: 'TX_JOURNAL_ACCOUNT_DRIFT',     label: 'Transaction journals match the transaction account' },
  { code: 'ORPHANED_AUTO_JOURNAL',        label: 'Auto-transaction journals point to a live transaction' },
  { code: 'ORPHANED_DRAFT_JOURNAL',       label: 'Unposted auto-journals link to a live income/bill' },
  { code: 'TRIAL_BALANCE_UNBALANCED',     label: 'Trial balance: total debits = total credits' },
  { code: 'JOURNAL_ENTRY_UNBALANCED',     label: 'Every posted entry balances (DR = CR)' },
  { code: 'NONPOSITIVE_LINE_AMOUNT',      label: 'Every journal line amount is positive' },
  { code: 'REVERSAL_PAIR_BROKEN',         label: 'Reversal pairs are intact' },
  { code: 'AP_CONTROL_VS_SUBLEDGER',      label: 'AP control account reconciles to the bills subledger' },
  { code: 'AR_CONTROL_VS_SUBLEDGER',      label: 'AR control account reconciles to the income subledger' },
  { code: 'PAYSLIP_GROSS_MISMATCH',       label: 'Payslip gross = net + PAYG + super' },
  { code: 'DATE_REQUIRED_PRESENT',        label: 'Required dates present and within a plausible range' },
  { code: 'FUTURE_DATED_POSTING',         label: 'Posted journals dated after today (review)' },
]

export async function runFinanceIntegrityAudit(familyId: string): Promise<AuditResult> {
  const findings: IntegrityFinding[] = []
  const add = (f: IntegrityFinding) => findings.push(f)

  const tz = await getFamilyTimezone(familyId)
  // "As at" the end of today in the family's timezone — matches the AP/AR reports,
  // which default their asAt to end-of-today so the reconciliation totals tie out.
  const asAt = new Date(todayBoundsInTz(tz).end.getTime() - 1)

  // Local calendar day (YYYY-MM-DD) in the family timezone. Used to compare a record's
  // tax point (invoiceReceivedDate — the AP/AR *subledger* boundary) against its posted
  // accrual's journal date (the GL *control* boundary). The reports key the subledger on
  // `invoiceReceivedDate <= asAt` and the control on `je.date <= asAt`, both at tz-local
  // end-of-day — so a same-day match means no end-of-day boundary can fall between them.
  const localDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)

  // Category id → name/type map for human-readable messages.
  const categories = await prisma.financeCategory.findMany({
    where: { familyId },
    select: { id: true, name: true, type: true, isSystem: true },
  })
  const catName = new Map(categories.map(c => [c.id, c.name]))
  const catType = new Map(categories.map(c => [c.id, c.type]))
  const acct = (id: string | null | undefined) =>
    id ? `${catName.get(id) ?? '(unknown)'} (${catType.get(id) ?? '?'})` : '(none)'

  // Read-only AP/AR control-account discovery — mirrors accounts-payable/route.ts
  // and accounts-receivable/route.ts. Does NOT call ensureAccounts*Category.
  const apCategory = categories.find(c => c.isSystem && c.type === 'liability' && c.name.toLowerCase().includes('accounts payable'))
  const arCategory = categories.find(c => c.isSystem && c.type === 'asset' && c.name.toLowerCase().includes('accounts receivable'))

  // ── A + B — Bills: accrual divergence + payment-journal presence ────────────
  const bills = await prisma.financeRecurringBill.findMany({
    where: { familyId },
    select: {
      id: true, name: true, amount: true, categoryId: true, entityId: true,
      invoiceReceived: true, invoiceReceivedDate: true, isVoided: true, paid: true, paymentTxId: true,
      journalEntry: {
        select: {
          isPosted: true, isReversed: true, entityId: true, date: true,
          lines: { select: { glAccountId: true, side: true, amount: true } },
        },
      },
      payments: { select: { journalEntry: { select: { isPosted: true, isReversed: true } } } },
    },
  })

  for (const b of bills) {
    const liveAccrual = b.journalEntry && b.journalEntry.isPosted && !b.journalEntry.isReversed

    // A — received & active bill must have a live posted accrual that matches the row.
    if (b.invoiceReceived && !b.isVoided) {
      if (!liveAccrual) {
        add({
          severity: 'critical', code: 'BILL_ACCRUAL_MISSING', recordType: 'bill',
          recordId: b.id, label: b.name,
          message: `Bill is marked invoice-received but has no posted accrual journal.`,
        })
      } else {
        const lines = b.journalEntry!.lines
        if (lines.length === 2) {
          const debit = lines.find(l => l.side === 'debit')
          const credit = lines.find(l => l.side === 'credit')
          if (debit && credit) {
            const problems: string[] = []
            if (debit.glAccountId !== b.categoryId)
              problems.push(`debit posted to ${acct(debit.glAccountId)} but bill category is ${acct(b.categoryId)}`)
            if (!approxEq(debit.amount, b.amount))
              problems.push(`debit amount ${r2(debit.amount)} ≠ bill amount ${r2(b.amount)}`)
            if (apCategory && credit.glAccountId !== apCategory.id)
              problems.push(`credit posted to ${acct(credit.glAccountId)} but should be Accounts Payable`)
            if ((b.journalEntry!.entityId ?? null) !== (b.entityId ?? null))
              problems.push(`accrual entity differs from bill entity`)
            if (problems.length > 0) {
              add({
                severity: 'critical', code: 'BILL_ACCRUAL_MISMATCH', recordType: 'bill',
                recordId: b.id, label: b.name,
                message: `Accrual disagrees with the bill row: ${problems.join('; ')}.`,
                detail: {
                  billCategory: acct(b.categoryId), debitAccount: acct(debit.glAccountId),
                  billAmount: r2(b.amount), debitAmount: r2(debit.amount),
                  creditAccount: acct(credit.glAccountId),
                },
              })
            }
          }
        } else {
          add({
            severity: 'info', code: 'BILL_ACCRUAL_SPLIT', recordType: 'bill',
            recordId: b.id, label: b.name,
            message: `Accrual has ${lines.length} lines (custom/GST split) — verify manually.`,
          })
        }
        // Tax point ↔ accrual date. The AP subledger keys on invoiceReceivedDate while
        // the GL control keys on the accrual journal date; when they fall on different
        // local days the control and subledger diverge for as-at dates between them
        // (the F7 Charity bug). A legitimately pre-recorded future bill has tax point ==
        // accrual date, so this never false-positives on future-dated scheduling.
        const billJeDay = localDay(b.journalEntry!.date)
        if (b.invoiceReceivedDate && localDay(b.invoiceReceivedDate) !== billJeDay) {
          add({
            severity: 'warning', code: 'BILL_TAXPOINT_DIVERGENT', recordType: 'bill',
            recordId: b.id, label: b.name,
            message: `Tax point ${localDay(b.invoiceReceivedDate)} differs from the accrual journal date ${billJeDay} — AP control and subledger diverge for as-at dates between them.`,
            detail: { invoiceReceivedDate: localDay(b.invoiceReceivedDate), accrualDate: billJeDay },
          })
        }
      }
    }

    // A — a voided or un-invoiced bill should NOT still carry a live accrual.
    if ((!b.invoiceReceived || b.isVoided) && liveAccrual) {
      add({
        severity: 'critical', code: 'BILL_ACCRUAL_STALE', recordType: 'bill',
        recordId: b.id, label: b.name,
        message: b.isVoided
          ? `Bill is voided but its accrual journal is still posted (should be reversed).`
          : `Bill is not invoice-received but a posted accrual journal exists (should be reversed).`,
      })
    }

    // B — a paid, active bill with no payment artifact at all leaves AP open in the GL.
    if (b.paid && !b.isVoided) {
      const hasPaymentJournal = b.payments.some(p => p.journalEntry && p.journalEntry.isPosted && !p.journalEntry.isReversed)
      if (!hasPaymentJournal && !b.paymentTxId) {
        add({
          severity: 'critical', code: 'BILL_PAID_NO_PAYMENT_GL', recordType: 'bill',
          recordId: b.id, label: b.name,
          message: `Bill is marked paid but has no payment journal or payment transaction — Accounts Payable is never cleared.`,
        })
      }
    }
  }

  // ── A + B — Income: accrual divergence + receipt-journal presence ───────────
  const incomes = await prisma.financeIncomeEntry.findMany({
    where: { familyId },
    select: {
      id: true, name: true, amount: true, categoryId: true, entityId: true,
      invoiceReceived: true, invoiceReceivedDate: true, isVoided: true, received: true, receiptJournalEntryId: true,
      journalEntry: {
        select: {
          isPosted: true, isReversed: true, entityId: true, date: true,
          lines: { select: { glAccountId: true, side: true, amount: true } },
        },
      },
      receiptJournalEntry: { select: { isPosted: true, isReversed: true } },
    },
  })

  for (const e of incomes) {
    const liveAccrual = e.journalEntry && e.journalEntry.isPosted && !e.journalEntry.isReversed

    if (e.invoiceReceived && !e.isVoided) {
      if (!liveAccrual) {
        add({
          severity: 'critical', code: 'INCOME_ACCRUAL_MISSING', recordType: 'income',
          recordId: e.id, label: e.name,
          message: `Income is marked invoice-received but has no posted accrual journal.`,
        })
      } else {
        const lines = e.journalEntry!.lines
        if (lines.length === 2) {
          const debit = lines.find(l => l.side === 'debit')
          const credit = lines.find(l => l.side === 'credit')
          if (debit && credit) {
            const problems: string[] = []
            if (credit.glAccountId !== e.categoryId)
              problems.push(`credit posted to ${acct(credit.glAccountId)} but income category is ${acct(e.categoryId)}`)
            if (!approxEq(credit.amount, e.amount))
              problems.push(`credit amount ${r2(credit.amount)} ≠ income amount ${r2(e.amount)}`)
            if (arCategory && debit.glAccountId !== arCategory.id)
              problems.push(`debit posted to ${acct(debit.glAccountId)} but should be Accounts Receivable`)
            if ((e.journalEntry!.entityId ?? null) !== (e.entityId ?? null))
              problems.push(`accrual entity differs from income entity`)
            if (problems.length > 0) {
              add({
                severity: 'critical', code: 'INCOME_ACCRUAL_MISMATCH', recordType: 'income',
                recordId: e.id, label: e.name,
                message: `Accrual disagrees with the income row: ${problems.join('; ')}.`,
                detail: {
                  incomeCategory: acct(e.categoryId), creditAccount: acct(credit.glAccountId),
                  incomeAmount: r2(e.amount), creditAmount: r2(credit.amount),
                  debitAccount: acct(debit.glAccountId),
                },
              })
            }
          }
        } else {
          add({
            severity: 'info', code: 'INCOME_ACCRUAL_SPLIT', recordType: 'income',
            recordId: e.id, label: e.name,
            message: `Accrual has ${lines.length} lines (payslip/custom split) — verify manually.`,
          })
        }
        // Tax point ↔ accrual date (income-side mirror of BILL_TAXPOINT_DIVERGENT). The
        // AR subledger keys on invoiceReceivedDate while the GL control keys on the
        // accrual journal date; different local days diverge the control and subledger
        // for as-at dates between them (the Michelle SGC bug).
        const incomeJeDay = localDay(e.journalEntry!.date)
        if (e.invoiceReceivedDate && localDay(e.invoiceReceivedDate) !== incomeJeDay) {
          add({
            severity: 'warning', code: 'INCOME_TAXPOINT_DIVERGENT', recordType: 'income',
            recordId: e.id, label: e.name,
            message: `Tax point ${localDay(e.invoiceReceivedDate)} differs from the accrual journal date ${incomeJeDay} — AR control and subledger diverge for as-at dates between them.`,
            detail: { invoiceReceivedDate: localDay(e.invoiceReceivedDate), accrualDate: incomeJeDay },
          })
        }
      }
    }

    if ((!e.invoiceReceived || e.isVoided) && liveAccrual) {
      add({
        severity: 'critical', code: 'INCOME_ACCRUAL_STALE', recordType: 'income',
        recordId: e.id, label: e.name,
        message: e.isVoided
          ? `Income is voided but its accrual journal is still posted (should be reversed).`
          : `Income is not invoice-received but a posted accrual journal exists (should be reversed).`,
      })
    }

    // B — invoiced income marked received must have a posted receipt journal to clear AR.
    if (e.received && !e.isVoided && e.invoiceReceived) {
      const liveReceipt = e.receiptJournalEntry && e.receiptJournalEntry.isPosted && !e.receiptJournalEntry.isReversed
      if (!liveReceipt) {
        add({
          severity: 'critical', code: 'INCOME_RECEIVED_NO_RECEIPT_GL', recordType: 'income',
          recordId: e.id, label: e.name,
          message: `Income is invoiced and marked received but has no posted receipt journal — Accounts Receivable is never cleared.`,
        })
      }
    }
  }

  // ── C — Transaction ↔ auto-journal account drift / orphans ──────────────────
  const autoJournals = await prisma.financeJournalEntry.findMany({
    where: { familyId, type: 'auto_transaction', isPosted: true, isReversed: false, sourceTransactionId: { not: null } },
    select: {
      id: true, reference: true, sourceTransactionId: true,
      lines: { select: { glAccountId: true, side: true, amount: true } },
    },
  })
  const txIds = Array.from(new Set(autoJournals.map(j => j.sourceTransactionId!).filter(Boolean)))
  const txs = txIds.length
    ? await prisma.financeTransaction.findMany({
        where: { id: { in: txIds }, familyId },
        select: { id: true, description: true, categoryId: true, glAccountId: true },
      })
    : []
  const txMap = new Map(txs.map(t => [t.id, t]))

  for (const j of autoJournals) {
    const tx = txMap.get(j.sourceTransactionId!)
    if (!tx) {
      add({
        severity: 'warning', code: 'ORPHANED_AUTO_JOURNAL', recordType: 'journal',
        recordId: j.id, label: j.reference ?? j.id,
        message: `Auto-transaction journal references transaction ${j.sourceTransactionId} which no longer exists.`,
      })
      continue
    }
    // Only the clean 2-line case (bank line + category line) is checked; GST splits
    // (3 lines) are skipped to avoid false positives.
    if (j.lines.length === 2 && tx.glAccountId && tx.categoryId) {
      const categoryLine = j.lines.find(l => l.glAccountId !== tx.glAccountId)
      if (categoryLine && categoryLine.glAccountId !== tx.categoryId) {
        add({
          severity: 'warning', code: 'TX_JOURNAL_ACCOUNT_DRIFT', recordType: 'transaction',
          recordId: tx.id, label: tx.description || tx.id,
          message: `Journal posts to ${acct(categoryLine.glAccountId)} but the transaction's category is ${acct(tx.categoryId)}.`,
          detail: { journalAccount: acct(categoryLine.glAccountId), transactionCategory: acct(tx.categoryId), reference: j.reference },
        })
      }
    }
  }

  // ── C.2 — Orphaned unposted draft journals ──────────────────────────────────
  // Spawned drafts (type=auto_transaction, isPosted=false) are linked from the
  // income/bill/payment side. Deleting that parent used to strand the draft as an
  // orphan: invisible to the Journals UI (which never lists unposted auto_transaction
  // rows) yet lingering in the ledger. Zero GL impact (unposted) → warning, not critical.
  const draftAutoJournals = await prisma.financeJournalEntry.findMany({
    where: { familyId, type: 'auto_transaction', isPosted: false },
    select: { id: true, reference: true, description: true },
  })
  if (draftAutoJournals.length > 0) {
    const [incAccrual, incReceipt, billAccrual, billPay] = await Promise.all([
      prisma.financeIncomeEntry.findMany({ where: { familyId, journalEntryId: { not: null } }, select: { journalEntryId: true } }),
      prisma.financeIncomeEntry.findMany({ where: { familyId, receiptJournalEntryId: { not: null } }, select: { receiptJournalEntryId: true } }),
      prisma.financeRecurringBill.findMany({ where: { familyId, journalEntryId: { not: null } }, select: { journalEntryId: true } }),
      prisma.financeBillPayment.findMany({ where: { familyId, journalEntryId: { not: null } }, select: { journalEntryId: true } }),
    ])
    const linkedJeIds = new Set<string>([
      ...incAccrual.map(r => r.journalEntryId!),
      ...incReceipt.map(r => r.receiptJournalEntryId!),
      ...billAccrual.map(r => r.journalEntryId!),
      ...billPay.map(r => r.journalEntryId!),
    ])
    for (const j of draftAutoJournals) {
      if (!linkedJeIds.has(j.id)) {
        add({
          severity: 'warning', code: 'ORPHANED_DRAFT_JOURNAL', recordType: 'journal',
          recordId: j.id, label: j.reference ?? j.description ?? j.id,
          message: `Unposted auto-transaction journal is not linked to any income, bill, or payment — it was stranded when its source was deleted and should be removed.`,
        })
      }
    }
  }

  // ── D — GL self-consistency ─────────────────────────────────────────────────
  const allEntries = await prisma.financeJournalEntry.findMany({
    where: { familyId },
    select: {
      id: true, reference: true, isPosted: true, isReversed: true, reversalOfId: true,
      lines: { select: { side: true, amount: true } },
    },
  })

  let totalDebit = 0
  let totalCredit = 0
  for (const e of allEntries) {
    if (!e.isPosted) continue
    let entryDebit = 0
    let entryCredit = 0
    let hasNonPositive = false
    for (const l of e.lines) {
      if (l.side === 'debit') entryDebit += l.amount
      else if (l.side === 'credit') entryCredit += l.amount
      if (l.amount <= 0) hasNonPositive = true
    }
    totalDebit += entryDebit
    totalCredit += entryCredit
    if (!approxEq(entryDebit, entryCredit)) {
      add({
        severity: 'critical', code: 'JOURNAL_ENTRY_UNBALANCED', recordType: 'journal',
        recordId: e.id, label: e.reference ?? e.id,
        message: `Posted entry is unbalanced: debits ${r2(entryDebit)} ≠ credits ${r2(entryCredit)}.`,
      })
    }
    if (hasNonPositive) {
      add({
        severity: 'critical', code: 'NONPOSITIVE_LINE_AMOUNT', recordType: 'journal',
        recordId: e.id, label: e.reference ?? e.id,
        message: `Posted entry has a journal line with a zero or negative amount.`,
      })
    }
  }
  if (!approxEq(totalDebit, totalCredit)) {
    add({
      severity: 'critical', code: 'TRIAL_BALANCE_UNBALANCED', recordType: 'gl',
      recordId: 'trial-balance', label: 'Trial balance',
      message: `Posted ledger is out of balance: total debits ${r2(totalDebit)} ≠ total credits ${r2(totalCredit)} (difference ${r2(Math.abs(totalDebit - totalCredit))}).`,
      detail: { totalDebit: r2(totalDebit), totalCredit: r2(totalCredit) },
    })
  }

  // Reversal-pair integrity (over all entries, posted or not).
  const allIds = new Set(allEntries.map(e => e.id))
  const reversalTargets = new Set(allEntries.map(e => e.reversalOfId).filter((x): x is string => !!x))
  for (const e of allEntries) {
    if (e.isReversed && !reversalTargets.has(e.id)) {
      add({
        severity: 'warning', code: 'REVERSAL_PAIR_BROKEN', recordType: 'journal',
        recordId: e.id, label: e.reference ?? e.id,
        message: `Entry is flagged reversed but no reversing entry points back to it.`,
      })
    }
    if (e.reversalOfId && !allIds.has(e.reversalOfId)) {
      add({
        severity: 'warning', code: 'REVERSAL_PAIR_BROKEN', recordType: 'journal',
        recordId: e.id, label: e.reference ?? e.id,
        message: `Reversal entry points to a missing original entry (${e.reversalOfId}).`,
      })
    }
  }

  // ── E — Subledger reconciliation (mirrors the AP/AR aging reports) ──────────
  const balances = await deriveJournalLineBalances(familyId, null, asAt)

  if (apCategory) {
    const apControl = r2(Math.max(0, balances.get(apCategory.id)?.netBalance ?? 0))
    const apBills = await prisma.financeRecurringBill.findMany({
      where: {
        familyId, invoiceReceived: true, invoiceReceivedDate: { not: null, lte: asAt },
        OR: [{ paid: false }, { paid: true, paidDate: { gt: asAt } }],
      },
      select: { amount: true, payments: { select: { amount: true, paymentDate: true } } },
    })
    const apSubledger = r2(apBills.reduce((sum, b) => {
      const paidToDate = b.payments.reduce((s, p) => (p.paymentDate <= asAt ? s + p.amount : s), 0)
      const outstanding = r2(b.amount - paidToDate)
      return outstanding > 0.005 ? sum + outstanding : sum
    }, 0))
    if (!approxEq(apControl, apSubledger)) {
      add({
        severity: 'critical', code: 'AP_CONTROL_VS_SUBLEDGER', recordType: 'gl',
        recordId: apCategory.id, label: 'Accounts Payable',
        message: `AP control account ${r2(apControl)} does not reconcile to the bills subledger ${r2(apSubledger)} (difference ${r2(Math.abs(apControl - apSubledger))}).`,
        detail: { glControl: apControl, subledger: apSubledger },
      })
    }
  }

  if (arCategory) {
    const arControl = r2(Math.max(0, balances.get(arCategory.id)?.netBalance ?? 0))
    const arEntries = await prisma.financeIncomeEntry.findMany({
      where: {
        familyId, invoiceReceived: true, invoiceReceivedDate: { not: null, lte: asAt },
        OR: [{ received: false }, { received: true, receivedDate: { gt: asAt } }],
      },
      select: {
        amount: true,
        journalEntry: { select: { lines: { select: { amount: true, glAccountId: true, side: true } } } },
      },
    })
    const arSubledger = r2(arEntries.reduce((sum, e) => {
      const arLines = (e.journalEntry?.lines ?? []).filter(l => l.glAccountId === arCategory.id && l.side === 'debit')
      const outstanding = arLines.length > 0 ? arLines.reduce((s, l) => s + l.amount, 0) : e.amount
      return sum + outstanding
    }, 0))
    if (!approxEq(arControl, arSubledger)) {
      add({
        severity: 'critical', code: 'AR_CONTROL_VS_SUBLEDGER', recordType: 'gl',
        recordId: arCategory.id, label: 'Accounts Receivable',
        message: `AR control account ${r2(arControl)} does not reconcile to the income subledger ${r2(arSubledger)} (difference ${r2(Math.abs(arControl - arSubledger))}).`,
        detail: { glControl: arControl, subledger: arSubledger },
      })
    }
  }

  // ── F — Payslip math: gross = net + PAYG + deductions ───────────────────────
  // SGC is employer super paid ON TOP of gross (memo-only, never a journal
  // line) and must NOT be in this identity — including it flags correct
  // payslips as broken (audit F8; QA.md §2.3).
  const payslips = await prisma.financePayslip.findMany({
    where: { familyId },
    select: {
      id: true, grossPay: true, netPay: true, paygWithheld: true, deductions: true,
      incomeEntry: { select: { name: true } },
    },
  })
  for (const p of payslips) {
    let deductionsTotal = 0
    try {
      const parsed = JSON.parse(p.deductions || '[]') as { amount?: number }[]
      if (Array.isArray(parsed)) {
        deductionsTotal = parsed.reduce((s, d) => s + (typeof d?.amount === 'number' ? d.amount : 0), 0)
      }
    } catch { /* malformed JSON → treat as no deductions */ }
    const expected = r2(p.netPay + p.paygWithheld + deductionsTotal)
    if (!approxEq(p.grossPay, expected)) {
      add({
        severity: 'critical', code: 'PAYSLIP_GROSS_MISMATCH', recordType: 'payslip',
        recordId: p.id, label: p.incomeEntry?.name ?? p.id,
        message: `Gross ${r2(p.grossPay)} ≠ net ${r2(p.netPay)} + PAYG ${r2(p.paygWithheld)} + deductions ${r2(deductionsTotal)} (= ${expected}). SGC is memo-only and excluded.`,
      })
    }
  }

  // ── G — Date presence & plausibility ────────────────────────────────────────
  // Prisma guarantees stored datetimes parse and that non-nullable columns are set,
  // so this catches the two failure modes it cannot: (1) a record whose *state* implies
  // a date (invoice-received / paid / received) while the nullable date column is NULL,
  // leaving the tax point or settlement date undefined; and (2) a stored date that
  // parses yet is implausible — before 2000 or more than ~10 years out — the signature
  // of a typo or a 1970-epoch fallback. Both are warnings. Future-dated *posted*
  // journals are surfaced separately as info, since this app legitimately pre-records
  // future-dated bills and those must still affect the ledger.
  const MIN_DATE = Date.UTC(2000, 0, 1)
  const MAX_DATE = asAt.getTime() + 10 * 365 * 86_400_000 // ~10 years past today
  const plausible = (d: Date) => d.getTime() >= MIN_DATE && d.getTime() <= MAX_DATE

  const billDates = await prisma.financeRecurringBill.findMany({
    where: { familyId },
    select: { id: true, name: true, isVoided: true, invoiceReceived: true, invoiceReceivedDate: true, paid: true, paidDate: true },
  })
  for (const b of billDates) {
    if (b.isVoided) continue
    if (b.invoiceReceived && !b.invoiceReceivedDate)
      add({ severity: 'warning', code: 'DATE_REQUIRED_PRESENT', recordType: 'bill', recordId: b.id, label: b.name,
        message: `Bill is marked invoice-received but has no invoice date — its tax point is undefined.` })
    if (b.paid && !b.paidDate)
      add({ severity: 'warning', code: 'DATE_REQUIRED_PRESENT', recordType: 'bill', recordId: b.id, label: b.name,
        message: `Bill is marked paid but has no paid date.` })
    if (b.invoiceReceivedDate && !plausible(b.invoiceReceivedDate))
      add({ severity: 'warning', code: 'DATE_REQUIRED_PRESENT', recordType: 'bill', recordId: b.id, label: b.name,
        message: `Bill invoice date ${localDay(b.invoiceReceivedDate)} is outside the plausible range (before 2000 or >10 years out) — likely a typo.` })
    if (b.paidDate && !plausible(b.paidDate))
      add({ severity: 'warning', code: 'DATE_REQUIRED_PRESENT', recordType: 'bill', recordId: b.id, label: b.name,
        message: `Bill paid date ${localDay(b.paidDate)} is outside the plausible range (before 2000 or >10 years out) — likely a typo.` })
  }

  const incomeDates = await prisma.financeIncomeEntry.findMany({
    where: { familyId },
    select: { id: true, name: true, isVoided: true, invoiceReceived: true, invoiceReceivedDate: true, received: true, receivedDate: true },
  })
  for (const e of incomeDates) {
    if (e.isVoided) continue
    if (e.invoiceReceived && !e.invoiceReceivedDate)
      add({ severity: 'warning', code: 'DATE_REQUIRED_PRESENT', recordType: 'income', recordId: e.id, label: e.name,
        message: `Income is marked invoice-received but has no invoice date — its tax point is undefined.` })
    if (e.received && !e.receivedDate)
      add({ severity: 'warning', code: 'DATE_REQUIRED_PRESENT', recordType: 'income', recordId: e.id, label: e.name,
        message: `Income is marked received but has no received date.` })
    if (e.invoiceReceivedDate && !plausible(e.invoiceReceivedDate))
      add({ severity: 'warning', code: 'DATE_REQUIRED_PRESENT', recordType: 'income', recordId: e.id, label: e.name,
        message: `Income invoice date ${localDay(e.invoiceReceivedDate)} is outside the plausible range (before 2000 or >10 years out) — likely a typo.` })
    if (e.receivedDate && !plausible(e.receivedDate))
      add({ severity: 'warning', code: 'DATE_REQUIRED_PRESENT', recordType: 'income', recordId: e.id, label: e.name,
        message: `Income received date ${localDay(e.receivedDate)} is outside the plausible range (before 2000 or >10 years out) — likely a typo.` })
  }

  // Posted, non-reversed journals: implausible date is a warning; merely future-dated
  // (after end-of-today, family-local) is info — it already affects reports, but legitimate
  // for pre-recorded future bills, so it is surfaced for review rather than flagged.
  const postedJournalDates = await prisma.financeJournalEntry.findMany({
    where: { familyId, isPosted: true, isReversed: false },
    select: { id: true, reference: true, description: true, date: true },
  })
  for (const j of postedJournalDates) {
    const label = j.reference ?? j.description ?? j.id
    if (!plausible(j.date)) {
      add({ severity: 'warning', code: 'DATE_REQUIRED_PRESENT', recordType: 'journal', recordId: j.id, label,
        message: `Posted journal date ${localDay(j.date)} is outside the plausible range (before 2000 or >10 years out) — likely a typo.` })
    } else if (j.date.getTime() > asAt.getTime()) {
      add({ severity: 'info', code: 'FUTURE_DATED_POSTING', recordType: 'journal', recordId: j.id, label,
        message: `Posted journal is dated ${localDay(j.date)}, after today (${localDay(asAt)}) — it already affects the ledger. Expected for a pre-recorded future bill; confirm it is not a typo.` })
    }
  }

  // ── Build per-check status + summary ────────────────────────────────────────
  const checks: IntegrityCheck[] = CHECK_CATALOG.map(({ code, label }) => {
    const own = findings.filter(f => f.code === code)
    const failing = own.some(f => f.severity === 'critical' || f.severity === 'warning')
    return { code, label, status: failing ? 'fail' : 'pass', findingCount: own.length }
  })

  const summary = {
    critical: findings.filter(f => f.severity === 'critical').length,
    warning: findings.filter(f => f.severity === 'warning').length,
    info: findings.filter(f => f.severity === 'info').length,
    passed: checks.filter(c => c.status === 'pass').length,
    failed: checks.filter(c => c.status === 'fail').length,
  }

  return {
    ranAt: new Date().toISOString(),
    familyId,
    asAt: asAt.toISOString(),
    checks,
    findings,
    summary,
  }
}
