// =============================================================================
// finance-posting.ts
//
// GL posting helpers used by the draft-approval service (Block 2b).
//
// Each function in this module writes a balanced, posted FinanceJournalEntry to
// the GL — and ONLY does that. It does not update bill/income status, does not
// mutate transactions, does not spawn occurrences. The caller wraps these in a
// $transaction and orchestrates the surrounding state changes.
//
// These helpers are PARALLEL to the in-route posting code in
//   src/app/api/finance/bills/route.ts        (postBillToGL, postBillPaymentToGL)
//   src/app/api/finance/income/route.ts       (PATCH Stage 1 / Stage 2 blocks)
//
// They use the same primitives and produce equivalent journal entries.
// They exist as a separate, fresh module so the audited posting logic in the
// existing routes is not touched. (Block 2 / Approach 2 decision.)
//
// GL-first invariants (Agent Guide §1.1 / §8.2):
//   - Every function writes a balanced FinanceJournalEntry with isPosted=true.
//   - Every function validates balance (debits = credits within 0.005) before
//     touching the DB. If unbalanced, throws — caller's $transaction rolls back.
//   - Every function validates that all referenced FinanceCategory GL accounts
//     belong to the family. Cross-family references throw.
//   - Helpers accept a Prisma transaction client (tx) so the caller controls
//     atomicity of the surrounding write (status flip, transaction creation,
//     etc.). When called outside a $transaction, pass `prisma` directly.
// =============================================================================

import type { Prisma, PrismaClient } from '@prisma/client'
import {
  ensureAccountsPayableCategory,
  ensureAccountsReceivableCategory,
} from '@/lib/finance-opening-balance'
import { nextJournalReference } from '@/lib/finance-journal-ref'

// Prisma transaction client (also accepts a regular PrismaClient).
// All helpers accept either so they can be called inside or outside a $transaction.
export type TxClient = Prisma.TransactionClient | PrismaClient

// ── Shared types ─────────────────────────────────────────────────────────────

export interface JournalLine {
  glAccountId: string
  side: 'debit' | 'credit'
  amount: number
  description?: string
  memberId?: string | null
}

export interface PostResult {
  journalEntryId: string
  reference: string
  /** Total DR (= total CR after balance check). */
  amount: number
}

// ── Balance tolerance ────────────────────────────────────────────────────────
// Same value used throughout the existing routes (bills/route.ts upsertBillDraftJournal
// and income/route.ts upsertIncomeJournalEntry). Floating-point cents rounding
// can produce sub-half-cent differences that are not real imbalance.
const BALANCE_EPSILON = 0.005

/**
 * Validates that debits and credits balance within BALANCE_EPSILON.
 * Throws with a clear message if not. Returns the validated total.
 */
function assertBalanced(lines: JournalLine[]): number {
  if (lines.length < 2) {
    throw new Error('A journal entry requires at least 2 lines')
  }
  const totalDR = lines
    .filter(l => l.side === 'debit')
    .reduce((s, l) => s + l.amount, 0)
  const totalCR = lines
    .filter(l => l.side === 'credit')
    .reduce((s, l) => s + l.amount, 0)
  if (Math.abs(totalDR - totalCR) > BALANCE_EPSILON) {
    throw new Error(
      `Journal lines are not balanced — debits ${totalDR.toFixed(2)} ≠ credits ${totalCR.toFixed(2)}`,
    )
  }
  return totalDR
}

/**
 * Validates that every glAccountId in the lines belongs to the given family.
 * Throws if any reference cannot be resolved. Returns silently on success.
 */
async function assertGlAccountsBelongToFamily(
  tx: TxClient,
  lines: JournalLine[],
  familyId: string,
): Promise<void> {
  const glIds = [...new Set(lines.map(l => l.glAccountId))]
  const valid = await tx.financeCategory.findMany({
    where: { id: { in: glIds }, familyId },
    select: { id: true },
  })
  if (valid.length !== glIds.length) {
    throw new Error(
      `One or more GL accounts not found for family ${familyId} ` +
      `(referenced ${glIds.length}, found ${valid.length})`,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// postBillAccrualJournal
//
// Called by the draft-approval service when a user approves a BILL draft.
//
// Accounting (accrual, Xero-standard): a bill is recognised as an expense and
// a liability when the invoice is approved, not when cash leaves the bank.
//
//   Simple case (no GST split provided):
//     DR  <expense GL>           amount
//     CR  Accounts Payable       amount
//
//   GST-split case (lines provided by caller, e.g. Q1 spawn-time GST split):
//     DR  <expense GL>           ex-GST amount
//     DR  GST Input Tax Credits  GST amount
//     CR  Accounts Payable       gross amount
//
// The function supports three sources of journal lines:
//
//   (a) draftJournalEntryId is provided AND points to a balanced unposted
//       FinanceJournalEntry → promote it to isPosted=true. Lines are kept
//       verbatim, preserving any GST split or custom split the user authored.
//       (Mirrors postBillToGL's "promote draft as-is" branch.)
//
//   (b) draftJournalEntryId is provided but points to an unbalanced or
//       posted/missing entry → fall back to the simple 2-line DR Expense /
//       CR AP entry using expenseGlAccountId and amount.
//
//   (c) draftJournalEntryId is null → create the simple 2-line entry directly.
//
// In all cases the returned journalEntryId is the ID of the posted GL entry.
//
// Pre-conditions enforced (throws on violation):
//   - expenseGlAccountId belongs to family (when used)
//   - if lines come from a draft, they must balance within BALANCE_EPSILON
//   - amount > 0
//
// Idempotency: the caller is responsible for not calling this twice for the
// same draft. The function does not deduplicate; calling it twice will produce
// two posted journal entries.
// ─────────────────────────────────────────────────────────────────────────────

export interface PostBillAccrualParams {
  /** The family ID. */
  familyId: string
  /** Human-readable name for the journal description (e.g. bill name). */
  description: string
  /** Total amount (positive). For GST-split drafts this is the gross/inclusive amount. */
  amount: number
  /** The expense GL account (FinanceCategory.id of type='expense'). Used for the simple 2-line fallback. */
  expenseGlAccountId: string
  /** Optional entity scope. Null = unscoped. */
  entityId: string | null
  /** Accounting date for the journal entry. */
  date: Date
  /**
   * Optional ID of a pre-existing unposted FinanceJournalEntry (e.g. a draft
   * with a GST split written at spawn time). If present and balanced, it is
   * promoted to posted as-is. If missing/unbalanced/posted, a fresh 2-line
   * entry is created instead.
   */
  draftJournalEntryId?: string | null
}

export async function postBillAccrualJournal(
  tx: TxClient,
  params: PostBillAccrualParams,
): Promise<PostResult> {
  const {
    familyId,
    description,
    amount,
    expenseGlAccountId,
    entityId,
    date,
    draftJournalEntryId,
  } = params

  if (!(amount > 0)) {
    throw new Error(`postBillAccrualJournal: amount must be positive, got ${amount}`)
  }

  const apCategoryId = await ensureAccountsPayableCategory(familyId)

  // ── Branch (a): promote a pre-existing balanced draft journal ────────────
  if (draftJournalEntryId) {
    const draft = await tx.financeJournalEntry.findFirst({
      where: { id: draftJournalEntryId, familyId },
      include: { lines: true },
    })

    if (draft && !draft.isPosted && draft.lines.length >= 2) {
      // Recompute balance from the actual stored lines (not caller-supplied)
      const dr = draft.lines
        .filter(l => l.side === 'debit')
        .reduce((s, l) => s + l.amount, 0)
      const cr = draft.lines
        .filter(l => l.side === 'credit')
        .reduce((s, l) => s + l.amount, 0)

      if (Math.abs(dr - cr) <= BALANCE_EPSILON) {
        // Balanced draft (e.g. user-configured GST split). Promote as-is.
        await tx.financeJournalEntry.update({
          where: { id: draftJournalEntryId },
          data: { isPosted: true, date },
        })
        return {
          journalEntryId: draftJournalEntryId,
          reference: draft.reference ?? '',
          amount: dr,
        }
      }
      // Unbalanced — fall through to create a fresh 2-line auto journal.
      // We deliberately do NOT throw here to mirror postBillToGL's recovery
      // behaviour; the draft is left in place (unposted) and a fresh posted
      // entry is created from the canonical amount.
    }
    // Posted, missing, or single-line — fall through to create fresh entry.
  }

  // ── Branches (b) and (c): create fresh 2-line DR Expense / CR AP ─────────
  const lines: JournalLine[] = [
    { glAccountId: expenseGlAccountId, side: 'debit',  amount, description },
    { glAccountId: apCategoryId,       side: 'credit', amount, description: `AP: ${description}` },
  ]

  // Validate GL accounts belong to family (apCategoryId is guaranteed by
  // ensureAccountsPayableCategory, but expenseGlAccountId is user-supplied)
  await assertGlAccountsBelongToFamily(tx, lines, familyId)

  // Balance check is mathematically redundant here (both lines are `amount`)
  // but kept for defence-in-depth — assertBalanced returns the total.
  assertBalanced(lines)

  const reference = await nextJournalReference(familyId)
  const entry = await tx.financeJournalEntry.create({
    data: {
      reference,
      date,
      description,
      type: 'auto_transaction',
      isPosted: true,
      entityId: entityId ?? null,
      familyId,
      lines: { create: lines.map(l => ({
        glAccountId: l.glAccountId,
        side: l.side,
        amount: l.amount,
        description: l.description ?? null,
      })) },
    },
    select: { id: true },
  })

  return {
    journalEntryId: entry.id,
    reference,
    amount,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// postBillPaymentJournal
//
// Called by the draft-approval service (or any flow) when a previously
// approved bill is paid. Posts the cash leg of the bill lifecycle.
//
// Two accounting paths depending on whether the bill was accrued first.
// The caller chooses via the `path` parameter; defaults to 'clear_ap' which
// matches the canonical lifecycle (draft → approve → AP → pay).
//
//   PATH 'clear_ap' — bill was accrued first (Stage 1 ran, AP balance exists):
//     DR  Accounts Payable    amount   (clear the liability)
//     CR  <bank GL>            amount   (cash leaves)
//     Net combined with Stage 1: DR Expense / CR Bank ✓
//
//   PATH 'direct' — direct payment with NO prior accrual (cash basis):
//     DR  <expense GL>         amount   (expense hits P&L now)
//     CR  <bank GL>            amount   (cash leaves)
//     Use when invoiceReceived was never set true; expense must hit P&L
//     somewhere or it never appears.
//
// In the draft-approval flow this is always called AFTER postBillAccrualJournal,
// so 'clear_ap' is the path you want. 'direct' is provided for completeness and
// for ad-hoc payment flows that bypass approval (not used by Block 2b today).
//
// Pre-conditions enforced (throws on violation):
//   - bankGlAccountId belongs to family
//   - if path='direct', expenseGlAccountId is required and belongs to family
//   - amount > 0
//
// Idempotency: the caller is responsible for not calling this twice for the
// same payment.
// ─────────────────────────────────────────────────────────────────────────────

export interface PostBillPaymentParams {
  /** The family ID. */
  familyId: string
  /** Human-readable name for the journal description (e.g. bill name). */
  description: string
  /** Amount being paid (positive). May be less than the bill total for partial payments. */
  amount: number
  /** The bank GL account (FinanceCategory.id of type='asset', e.g. cheque account). */
  bankGlAccountId: string
  /** Optional entity scope. Null = unscoped. */
  entityId: string | null
  /** Date cash actually left the bank. */
  date: Date
  /**
   * Posting path:
   *   - 'clear_ap' (default): DR AP / CR Bank. Use after postBillAccrualJournal.
   *   - 'direct':              DR Expense / CR Bank. Requires expenseGlAccountId.
   */
  path?: 'clear_ap' | 'direct'
  /**
   * Required when path='direct'. The expense GL account for the cash-basis
   * single-journal entry. Ignored when path='clear_ap'.
   */
  expenseGlAccountId?: string | null
}

export async function postBillPaymentJournal(
  tx: TxClient,
  params: PostBillPaymentParams,
): Promise<PostResult> {
  const {
    familyId,
    description,
    amount,
    bankGlAccountId,
    entityId,
    date,
    path = 'clear_ap',
    expenseGlAccountId,
  } = params

  if (!(amount > 0)) {
    throw new Error(`postBillPaymentJournal: amount must be positive, got ${amount}`)
  }

  let lines: JournalLine[]

  if (path === 'clear_ap') {
    const apCategoryId = await ensureAccountsPayableCategory(familyId)
    lines = [
      { glAccountId: apCategoryId,    side: 'debit',  amount, description: `Clear AP: ${description}` },
      { glAccountId: bankGlAccountId, side: 'credit', amount, description: `Payment: ${description}` },
    ]
  } else {
    // path === 'direct'
    if (!expenseGlAccountId) {
      throw new Error(
        `postBillPaymentJournal: path='direct' requires expenseGlAccountId`,
      )
    }
    lines = [
      { glAccountId: expenseGlAccountId, side: 'debit',  amount, description },
      { glAccountId: bankGlAccountId,    side: 'credit', amount, description: `Payment: ${description}` },
    ]
  }

  await assertGlAccountsBelongToFamily(tx, lines, familyId)
  assertBalanced(lines)

  const reference = await nextJournalReference(familyId)
  const entry = await tx.financeJournalEntry.create({
    data: {
      reference,
      date,
      description: `Payment: ${description}`,
      type: 'auto_transaction',
      isPosted: true,
      entityId: entityId ?? null,
      familyId,
      lines: { create: lines.map(l => ({
        glAccountId: l.glAccountId,
        side: l.side,
        amount: l.amount,
        description: l.description ?? null,
      })) },
    },
    select: { id: true },
  })

  return {
    journalEntryId: entry.id,
    reference,
    amount,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// postIncomeAccrualJournal
//
// Called by the draft-approval service when a user approves an INCOME draft
// (simple income — not payslip-mode salary; that uses postPayslipReceiptJournal).
//
// Accounting (accrual, Xero-standard): income is recognised when the
// remittance advice is approved, not when cash arrives in the bank.
//
//   Simple case (no GST split provided):
//     DR  Accounts Receivable    amount
//     CR  <income GL>            amount
//
//   GST-split case (lines provided by caller, e.g. Q1 spawn-time GST split):
//     DR  Accounts Receivable    gross amount
//     CR  <income GL>            ex-GST amount
//     CR  GST Collected         GST amount
//
// The function supports three sources of journal lines:
//
//   (a) draftJournalEntryId is provided AND points to a balanced unposted
//       FinanceJournalEntry → promote it to isPosted=true. Lines are kept
//       verbatim, preserving any GST split the spawn worker wrote.
//
//   (b) draftJournalEntryId is provided but points to an unbalanced or
//       posted/missing entry → fall back to the simple 2-line DR AR /
//       CR Income entry using incomeGlAccountId and amount.
//
//   (c) draftJournalEntryId is null → create the simple 2-line entry directly.
//
// In all cases the returned journalEntryId is the ID of the posted GL entry.
//
// Pre-conditions enforced (throws on violation):
//   - incomeGlAccountId belongs to family (when used)
//   - if lines come from a draft, they must balance within BALANCE_EPSILON
//   - amount > 0
//
// Idempotency: the caller is responsible for not calling this twice for the
// same draft.
// ─────────────────────────────────────────────────────────────────────────────

export interface PostIncomeAccrualParams {
  /** The family ID. */
  familyId: string
  /** Human-readable name for the journal description (e.g. income entry name). */
  description: string
  /** Total amount (positive). For GST-split drafts this is the gross/inclusive amount. */
  amount: number
  /** The income GL account (FinanceCategory.id of type='income'). Used for the simple 2-line fallback. */
  incomeGlAccountId: string
  /** Optional entity scope. Null = unscoped. */
  entityId: string | null
  /** Accounting date for the journal entry. */
  date: Date
  /**
   * Optional ID of a pre-existing unposted FinanceJournalEntry (e.g. a draft
   * with a GST-collected split written at spawn time). If present and balanced,
   * it is promoted to posted as-is. If missing/unbalanced/posted, a fresh
   * 2-line entry is created instead.
   */
  draftJournalEntryId?: string | null
}

export async function postIncomeAccrualJournal(
  tx: TxClient,
  params: PostIncomeAccrualParams,
): Promise<PostResult> {
  const {
    familyId,
    description,
    amount,
    incomeGlAccountId,
    entityId,
    date,
    draftJournalEntryId,
  } = params

  if (!(amount > 0)) {
    throw new Error(`postIncomeAccrualJournal: amount must be positive, got ${amount}`)
  }

  const arCategoryId = await ensureAccountsReceivableCategory(familyId)

  // ── Branch (a): promote a pre-existing balanced draft journal ────────────
  if (draftJournalEntryId) {
    const draft = await tx.financeJournalEntry.findFirst({
      where: { id: draftJournalEntryId, familyId },
      include: { lines: true },
    })

    if (draft && !draft.isPosted && draft.lines.length >= 2) {
      // Recompute balance from the actual stored lines (not caller-supplied)
      const dr = draft.lines
        .filter(l => l.side === 'debit')
        .reduce((s, l) => s + l.amount, 0)
      const cr = draft.lines
        .filter(l => l.side === 'credit')
        .reduce((s, l) => s + l.amount, 0)

      if (Math.abs(dr - cr) <= BALANCE_EPSILON) {
        // Balanced draft (e.g. user-configured GST split). Promote as-is.
        await tx.financeJournalEntry.update({
          where: { id: draftJournalEntryId },
          data: { isPosted: true, date },
        })
        return {
          journalEntryId: draftJournalEntryId,
          reference: draft.reference ?? '',
          amount: dr,
        }
      }
      // Unbalanced — fall through to create a fresh 2-line auto journal.
      // Mirrors the existing income PATCH Stage 1 recovery behaviour.
    }
    // Posted, missing, or single-line — fall through to create fresh entry.
  }

  // ── Branches (b) and (c): create fresh 2-line DR AR / CR Income ──────────
  const lines: JournalLine[] = [
    { glAccountId: arCategoryId,       side: 'debit',  amount, description: `AR: ${description}` },
    { glAccountId: incomeGlAccountId,  side: 'credit', amount, description },
  ]

  // Validate GL accounts belong to family (arCategoryId is guaranteed by
  // ensureAccountsReceivableCategory, but incomeGlAccountId is user-supplied)
  await assertGlAccountsBelongToFamily(tx, lines, familyId)
  assertBalanced(lines)

  const reference = await nextJournalReference(familyId)
  const entry = await tx.financeJournalEntry.create({
    data: {
      reference,
      date,
      description,
      type: 'auto_transaction',
      isPosted: true,
      entityId: entityId ?? null,
      familyId,
      lines: { create: lines.map(l => ({
        glAccountId: l.glAccountId,
        side: l.side,
        amount: l.amount,
        description: l.description ?? null,
      })) },
    },
    select: { id: true },
  })

  return {
    journalEntryId: entry.id,
    reference,
    amount,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// postIncomeReceiptJournal
//
// Called by the draft-approval service (or any flow) when a previously-accrued
// SIMPLE income draft transitions to "cash received" (non-payslip path).
//
// Accounting (Stage 2 simple mode):
//   DR  <bank GL>             amount   (cash arrives)
//   CR  Accounts Receivable   amount   (AR cleared)
//
// In the canonical lifecycle this is always called AFTER postIncomeAccrualJournal,
// so AR has a debit balance ready to clear. The result is the standard combined
// effect: DR Bank / CR Income (via the two stages netting).
//
// Short-payment / write-off note:
//   This function clears AR by exactly `amount`. If the cash received differs
//   from the accrued AR balance (e.g. customer short-paid by 50c), AR retains
//   a residual. Handling residuals is OUT OF SCOPE for this helper — the
//   caller should record a write-off journal separately. This mirrors the
//   existing income PATCH Stage 2 simple-mode behaviour, which posts a single
//   2-line journal of the actual receipt amount and leaves AR adjustment to
//   the user.
//
// Pre-conditions enforced (throws on violation):
//   - bankGlAccountId belongs to family
//   - amount > 0
//
// Idempotency: caller's responsibility.
// ─────────────────────────────────────────────────────────────────────────────

export interface PostIncomeReceiptParams {
  /** The family ID. */
  familyId: string
  /** Human-readable name for the journal description (e.g. income entry name). */
  description: string
  /** Amount actually received (positive). May differ from the accrued amount. */
  amount: number
  /** The bank GL account where cash landed (FinanceCategory.id of type='asset'). */
  bankGlAccountId: string
  /** Optional entity scope. Null = unscoped. */
  entityId: string | null
  /** Date cash actually hit the bank. */
  date: Date
}

export async function postIncomeReceiptJournal(
  tx: TxClient,
  params: PostIncomeReceiptParams,
): Promise<PostResult> {
  const {
    familyId,
    description,
    amount,
    bankGlAccountId,
    entityId,
    date,
  } = params

  if (!(amount > 0)) {
    throw new Error(`postIncomeReceiptJournal: amount must be positive, got ${amount}`)
  }

  const arCategoryId = await ensureAccountsReceivableCategory(familyId)

  const lines: JournalLine[] = [
    { glAccountId: bankGlAccountId, side: 'debit',  amount, description: `Bank receipt: ${description}` },
    { glAccountId: arCategoryId,    side: 'credit', amount, description: `AR clear: ${description}` },
  ]

  // bankGlAccountId is user-supplied; arCategoryId is guaranteed by helper.
  await assertGlAccountsBelongToFamily(tx, lines, familyId)
  assertBalanced(lines)

  const reference = await nextJournalReference(familyId)
  const entry = await tx.financeJournalEntry.create({
    data: {
      reference,
      date,
      description: `${description} (cash received)`,
      type: 'auto_transaction',
      isPosted: true,
      entityId: entityId ?? null,
      familyId,
      lines: { create: lines.map(l => ({
        glAccountId: l.glAccountId,
        side: l.side,
        amount: l.amount,
        description: l.description ?? null,
      })) },
    },
    select: { id: true },
  })

  return {
    journalEntryId: entry.id,
    reference,
    amount,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// postPayslipReceiptJournal
//
// Called by the draft-approval service when a PAYSLIP income draft transitions
// to "received". Posts a multi-line journal that decomposes the gross pay into
// its constituent debits (take-home + PAYG + deductions) and one credit (gross).
//
// Accounting (mirrors income PATCH Stage 2 MODE A — payslip mode):
//
//   CR  <gross income GL>      grossPay        (e.g. Gross Wages - <member>)
//   DR  <bank GL>              netPay          (take-home into bank)
//   DR  <PAYG GL>              paygWithheld    (if > 0 and paygGlAccountId set)
//   DR  <deduction[i] GL>      ded[i].amount   (one per deduction with a GL)
//
// Balance invariant:  netPay + paygWithheld + sum(deductions with GL)  ≈  grossPay
//
// SGC (Super Guarantee Contribution) note:
//   SGC is an employer-side cost. The existing income PATCH explicitly does
//   NOT include SGC in the journal — it is stored on FinancePayslip for
//   record-keeping but does not affect the employee's gross/net split. This
//   function preserves that behaviour and ignores any SGC fields in the
//   params (the caller is responsible for storing them on FinancePayslip
//   separately if desired).
//
// Memo-only deductions:
//   Deductions with no glAccountId are treated as memo lines for display only
//   and are NOT included in the journal. The caller must ensure the remaining
//   deductions plus PAYG plus Net Pay equal Gross Pay, otherwise the balance
//   check will throw.
//
// Per-member attribution:
//   If memberId is supplied it is attached to every line of the journal so the
//   Tax Report and Annual P&L can attribute the entries to a specific person.
//   This is OPTIONAL — passing null produces lines with memberId=null
//   (unattributed), matching existing payslip behaviour.
//
// Pre-conditions enforced (throws on violation):
//   - grossPay, netPay > 0
//   - paygWithheld >= 0
//   - all per-deduction amounts >= 0
//   - all referenced GL accounts belong to family
//   - balance: netPay + PAYG + sum(deductions w/ GL) ≈ grossPay (within BALANCE_EPSILON)
//
// Idempotency: caller's responsibility.
// ─────────────────────────────────────────────────────────────────────────────

export interface PayslipDeduction {
  /** Display label for the deduction (e.g. "Salary Sacrifice", "HECS"). */
  label: string
  /** Amount withheld (>= 0). */
  amount: number
  /**
   * Optional GL account for this deduction. When null/undefined the deduction
   * is treated as memo-only and is NOT included in the journal — the caller
   * must adjust the gross/net relationship accordingly or the balance check
   * will throw.
   */
  glAccountId?: string | null
}

export interface PostPayslipReceiptParams {
  /** The family ID. */
  familyId: string
  /** Human-readable name for the journal description (e.g. income entry name). */
  description: string
  /** Gross pay (positive). The single credit line amount. */
  grossPay: number
  /** Net pay / take-home (positive). The debit-to-bank amount. */
  netPay: number
  /** The gross income GL account (e.g. "Gross Wages - Mark"). */
  grossIncomeGlAccountId: string
  /** The bank GL account where take-home lands. */
  bankGlAccountId: string
  /** PAYG tax withheld (>= 0). If > 0, paygGlAccountId must be provided. */
  paygWithheld?: number
  /** GL account for PAYG withholding (e.g. "PAYG Withholding Receivable"). */
  paygGlAccountId?: string | null
  /** Additional deductions. Each entry with a glAccountId becomes a DR line. */
  deductions?: PayslipDeduction[]
  /** Optional entity scope. Null = unscoped. */
  entityId: string | null
  /** Optional member to attribute every line to (per-person reporting). */
  memberId?: string | null
  /** Date cash actually hit the bank. */
  date: Date
}

export async function postPayslipReceiptJournal(
  tx: TxClient,
  params: PostPayslipReceiptParams,
): Promise<PostResult> {
  const {
    familyId,
    description,
    grossPay,
    netPay,
    grossIncomeGlAccountId,
    bankGlAccountId,
    paygWithheld = 0,
    paygGlAccountId,
    deductions = [],
    entityId,
    memberId,
    date,
  } = params

  if (!(grossPay > 0)) {
    throw new Error(`postPayslipReceiptJournal: grossPay must be positive, got ${grossPay}`)
  }
  if (!(netPay > 0)) {
    throw new Error(`postPayslipReceiptJournal: netPay must be positive, got ${netPay}`)
  }
  if (paygWithheld < 0) {
    throw new Error(`postPayslipReceiptJournal: paygWithheld cannot be negative, got ${paygWithheld}`)
  }
  if (paygWithheld > 0 && !paygGlAccountId) {
    throw new Error(
      `postPayslipReceiptJournal: paygWithheld is ${paygWithheld} but no paygGlAccountId provided`,
    )
  }
  for (const d of deductions) {
    if (d.amount < 0) {
      throw new Error(
        `postPayslipReceiptJournal: deduction "${d.label}" has negative amount ${d.amount}`,
      )
    }
  }

  // Build journal lines.
  //
  // CR (single line) — gross
  // DR (variable) — net + PAYG (if any) + each deduction with a GL account
  //
  // Memo-only deductions (no glAccountId) are intentionally skipped. Per docs,
  // the caller must ensure they don't cause the gross/net relationship to fail
  // the balance check.
  const lines: JournalLine[] = []

  // CR: Gross income
  lines.push({
    glAccountId: grossIncomeGlAccountId,
    side: 'credit',
    amount: grossPay,
    description: `${description} — Gross Pay`,
    memberId: memberId ?? null,
  })

  // DR: Net take-home into bank
  lines.push({
    glAccountId: bankGlAccountId,
    side: 'debit',
    amount: netPay,
    description: `${description} — Net Pay`,
    memberId: memberId ?? null,
  })

  // DR: PAYG withheld (if applicable)
  if (paygWithheld > 0 && paygGlAccountId) {
    lines.push({
      glAccountId: paygGlAccountId,
      side: 'debit',
      amount: paygWithheld,
      description: `${description} — PAYG Withheld`,
      memberId: memberId ?? null,
    })
  }

  // DR: Each deduction with a GL account
  for (const d of deductions) {
    if (d.amount > 0 && d.glAccountId) {
      lines.push({
        glAccountId: d.glAccountId,
        side: 'debit',
        amount: d.amount,
        description: `${description} — ${d.label}`,
        memberId: memberId ?? null,
      })
    }
  }

  // Balance check: this is the critical check for payslips because grossPay,
  // netPay, PAYG, and deductions all come from user input and any
  // off-by-cent error here would post an unbalanced GL entry.
  await assertGlAccountsBelongToFamily(tx, lines, familyId)
  assertBalanced(lines)

  const reference = await nextJournalReference(familyId)
  const entry = await tx.financeJournalEntry.create({
    data: {
      reference,
      date,
      description: `${description} (payslip received)`,
      type: 'auto_transaction',
      isPosted: true,
      entityId: entityId ?? null,
      familyId,
      lines: { create: lines.map(l => ({
        glAccountId: l.glAccountId,
        side: l.side,
        amount: l.amount,
        description: l.description ?? null,
        memberId: l.memberId ?? null,
      })) },
    },
    select: { id: true },
  })

  return {
    journalEntryId: entry.id,
    reference,
    amount: grossPay,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// End of finance-posting.ts
//
// Exports summary (consumed by Block 2b draft-approval service):
//   - TxClient                          — transaction client type
//   - JournalLine, PostResult           — shared types
//   - PostBillAccrualParams,            — function param interfaces
//     PostBillPaymentParams,
//     PostIncomeAccrualParams,
//     PostIncomeReceiptParams,
//     PostPayslipReceiptParams,
//     PayslipDeduction
//   - postBillAccrualJournal            — DR Expense / CR AP
//   - postBillPaymentJournal            — DR AP / CR Bank (or DR Expense / CR Bank for cash basis)
//   - postIncomeAccrualJournal          — DR AR / CR Income
//   - postIncomeReceiptJournal          — DR Bank / CR AR (simple mode)
//   - postPayslipReceiptJournal         — multi-line DR Bank/PAYG/deductions / CR Gross
//
// All five posting functions accept a TxClient and return a PostResult. The
// caller wraps them in $transaction and orchestrates surrounding state changes
// (status flip, transaction-table writes, occurrence spawning, etc.).
// ─────────────────────────────────────────────────────────────────────────────
