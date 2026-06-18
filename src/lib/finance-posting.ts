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
//   src/app/api/finance/bills/route.ts        (PATCH Stage 1 / Stage 2 blocks)
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
import { prisma } from '@/lib/prisma'

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
// upsertDraftJournal
//
// The single shared implementation behind bills/route.ts upsertBillDraftJournal
// (isPosted=false — bills accrue as an UNPOSTED draft, promoted later by
// postBillAccrualJournal) and income/route.ts upsertIncomeJournalEntry
// (isPosted=true — income is recognised immediately). Creates or replaces the
// `auto_transaction` journal entry linked to a bill or income record.
//
// UNLIKE the other helpers in this module, upsertDraftJournal manages its OWN
// $transaction via the global `prisma` client and MUST run OUTSIDE any caller
// transaction — the bill payment path documents that this upsert uses its own
// $transaction and cannot be nested. It therefore does not accept a tx.
//
// Safety guarantees (identical to the original inline twins):
//   1. length / GL-family / balance validation all run BEFORE any DB write —
//      invalid input throws and no data is touched. Check order is preserved:
//      length → GL accounts belong to family → balance.
//   2. The deleteMany + update (or the create) is wrapped in a $transaction so
//      a partial failure cannot leave an entry with no lines.
//   3. A posted entry is never modified in place — corrections require a
//      reversal, not a repoint-and-leave (prevents orphaned posted accruals).
// ─────────────────────────────────────────────────────────────────────────────
export async function upsertDraftJournal(params: {
  description: string
  existingJournalEntryId: string | null | undefined
  lines: JournalLine[]
  date: Date
  familyId: string
  entityId: string | null
  isPosted: boolean
}): Promise<string> {
  const { description, existingJournalEntryId, lines, date, familyId, entityId, isPosted } = params

  if (lines.length < 2) {
    throw new Error('A journal entry requires at least 2 lines')
  }

  // Validate all GL accounts belong to this family.
  // (Kept inline with the original terse message — preserved verbatim because it
  // surfaces to the user via the routes' 422 responses.)
  const glIds = [...new Set(lines.map(l => l.glAccountId))]
  const validAccounts = await prisma.financeCategory.findMany({
    where: { id: { in: glIds }, familyId },
    select: { id: true },
  })
  if (validAccounts.length !== glIds.length) {
    throw new Error('One or more GL accounts not found')
  }

  // Balance check BEFORE touching anything in the DB.
  assertBalanced(lines)

  const lineData = lines.map(l => ({
    glAccountId: l.glAccountId,
    side: l.side,
    amount: l.amount,
    description: l.description ?? null,
  }))

  if (existingJournalEntryId) {
    const existing = await prisma.financeJournalEntry.findFirst({
      where: { id: existingJournalEntryId, familyId },
    })
    if (existing && !existing.isPosted) {
      // Atomic: delete old lines and write new ones together
      await prisma.$transaction(async (tx) => {
        await tx.financeJournalLine.deleteMany({ where: { journalEntryId: existingJournalEntryId } })
        await tx.financeJournalEntry.update({
          where: { id: existingJournalEntryId },
          data: {
            date,
            description,
            entityId: entityId ?? null,
            isPosted,
            lines: { create: lineData },
          },
        })
      })
      return existingJournalEntryId
    }
    if (existing && existing.isPosted) {
      // Never silently abandon a posted journal. Falling through to create a
      // fresh entry would orphan the original posted accrual, double-counting
      // the GL. A correction to a posted entry must be made via a reversal.
      throw new Error(
        'Cannot modify a posted journal entry in place — corrections to posted journals must be made via a reversal.',
      )
    }
  }

  // No existing draft — create a new one atomically
  const reference = await nextJournalReference(familyId)
  const entry = await prisma.$transaction(async (tx) => {
    return tx.financeJournalEntry.create({
      data: {
        reference,
        date,
        description,
        type: 'auto_transaction',
        isPosted,
        entityId: entityId ?? null,
        familyId,
        lines: { create: lineData },
      },
      select: { id: true },
    })
  })
  return entry.id
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
  /**
   * Optional GST split for the fresh-entry branches (b)/(c): posts
   * DR expense (amount − gstAmount) / DR GST ITC gstAmount / CR AP amount
   * so the ITC is claimed at the tax point (audit F9, no-draft prepayment
   * path). Ignored when a balanced draft is promoted via branch (a) — the
   * draft carries its own split.
   */
  gstSplit?: { gstAmount: number; gstItcAccountId: string } | null
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
    gstSplit,
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
      // We deliberately do NOT throw here; the draft is left in place
      // (unposted) and a fresh posted entry is created from the canonical amount.
    }
    // Posted, missing, or single-line — fall through to create fresh entry.
  }

  // ── Branches (b) and (c): create fresh DR Expense / CR AP entry ──────────
  // With gstSplit, the debit side is split DR expense net + DR GST ITC gst so
  // the ITC is claimed at the tax point (audit F9); otherwise plain 2-line.
  const lines: JournalLine[] = gstSplit && gstSplit.gstAmount > 0
    ? [
        { glAccountId: expenseGlAccountId,       side: 'debit',  amount: Math.round((amount - gstSplit.gstAmount) * 100) / 100, description },
        { glAccountId: gstSplit.gstItcAccountId, side: 'debit',  amount: gstSplit.gstAmount, description: `GST ITC: ${description}` },
        { glAccountId: apCategoryId,             side: 'credit', amount, description: `AP: ${description}` },
      ]
    : [
        { glAccountId: expenseGlAccountId, side: 'debit',  amount, description },
        { glAccountId: apCategoryId,       side: 'credit', amount, description: `AP: ${description}` },
      ]

  // Validate GL accounts belong to family (apCategoryId is guaranteed by
  // ensureAccountsPayableCategory, but expenseGlAccountId is user-supplied)
  await assertGlAccountsBelongToFamily(tx, lines, familyId)

  // DR must equal CR (a malformed gstSplit would break this) — assertBalanced
  // throws on imbalance and returns the total.
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
// Posts the cash leg of a bill payment. Supports four paths depending on
// whether the bill was accrued first (wasAccrued) and whether a bank account
// was provided or undeposited-funds suspense is used (usingSuspense).
//
//   PATH A: clear_ap + bank       DR AP            / CR Bank             (accrued, bank known)
//   PATH B: clear_ap + suspense   DR AP            / CR Undeposited Funds (accrued, no bank)
//   PATH C: direct  + bank        DR Expense       / CR Bank             (direct pay, bank known)
//   PATH D: direct  + suspense    DR Expense       / CR Undeposited Funds (direct pay, no bank)
//
// Pre-conditions enforced (throws on violation):
//   - creditGlAccountId belongs to family
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
  /** The credit-side GL account — either a bank account or an undeposited-funds suspense account. */
  creditGlAccountId: string
  /** Optional entity scope. Null = unscoped. */
  entityId: string | null
  /** Date cash actually left the bank (or was recorded as undeposited). */
  date: Date
  /**
   * Posting path:
   *   - 'clear_ap' (default): DR AP / CR creditGlAccountId. Use after postBillAccrualJournal.
   *   - 'direct':              DR Expense / CR creditGlAccountId. Requires expenseGlAccountId.
   */
  path?: 'clear_ap' | 'direct'
  /**
   * Required when path='direct'. The expense GL account for the cash-basis entry.
   * Ignored when path='clear_ap'.
   */
  expenseGlAccountId?: string | null
  /**
   * True when creditGlAccountId is an undeposited-funds suspense account rather than a real bank.
   * Affects journal descriptions only — accounting entries are identical.
   */
  usingSuspense?: boolean
}

export async function postBillPaymentJournal(
  tx: TxClient,
  params: PostBillPaymentParams,
): Promise<PostResult> {
  const {
    familyId,
    description,
    amount,
    creditGlAccountId,
    entityId,
    date,
    path = 'clear_ap',
    expenseGlAccountId,
    usingSuspense = false,
  } = params

  if (!(amount > 0)) {
    throw new Error(`postBillPaymentJournal: amount must be positive, got ${amount}`)
  }

  const pathLabel = path === 'clear_ap'
    ? (usingSuspense ? 'PATH B: DR AP / CR Undeposited Funds' : 'PATH A: DR AP / CR Bank')
    : (usingSuspense ? 'PATH D: DR Expense / CR Undeposited Funds' : 'PATH C: DR Expense / CR Bank')

  const creditDesc = usingSuspense ? `Undeposited — ${description}` : `Payment: ${description}`
  const journalDesc = usingSuspense ? `Payment (undeposited): ${description}` : `Payment: ${description}`

  let lines: JournalLine[]

  if (path === 'clear_ap') {
    const apCategoryId = await ensureAccountsPayableCategory(familyId)
    lines = [
      { glAccountId: apCategoryId,      side: 'debit',  amount, description: `${pathLabel} — ${description}` },
      { glAccountId: creditGlAccountId, side: 'credit', amount, description: creditDesc },
    ]
  } else {
    // path === 'direct'
    if (!expenseGlAccountId) {
      throw new Error(
        `postBillPaymentJournal: path='direct' requires expenseGlAccountId`,
      )
    }
    lines = [
      { glAccountId: expenseGlAccountId, side: 'debit',  amount, description: `${pathLabel} — ${description}` },
      { glAccountId: creditGlAccountId,  side: 'credit', amount, description: creditDesc },
    ]
  }

  await assertGlAccountsBelongToFamily(tx, lines, familyId)
  assertBalanced(lines)

  const reference = await nextJournalReference(familyId)
  const entry = await tx.financeJournalEntry.create({
    data: {
      reference,
      date,
      description: journalDesc,
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
  /**
   * Optional pre-generated journal reference for the fresh 2-line entry. Pass
   * this when posting inside a $transaction that also creates another journal,
   * so the two references are allocated up-front from committed MAX and cannot
   * collide (nextJournalReference reads committed state and would otherwise
   * return the same JE-N twice within one uncommitted transaction). Ignored
   * when an existing balanced draft is promoted (it keeps its own reference).
   */
  reference?: string
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
    reference: preGeneratedReference,
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

  const reference = preGeneratedReference ?? await nextJournalReference(familyId)
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
// reconcilePostedAccrualOnEdit
//
// Re-syncs a POSTED accrual after a GL-relevant edit (category / amount / entity)
// to a bill or income record. Without this, editing those fields updated the
// record row but left the already-posted journal entry stale — the row and the
// GL silently diverged and the corrected economics never reached the P&L /
// balance sheet. (Root cause of the "Apco fuel bill missing from P&L" defect:
// the accrual debited an asset account, was never re-posted after the category
// was corrected to an expense account, so no expense line ever existed.)
//
// "Reconcile if unpaid, block if paid":
//   - The CALLER must already have verified the bill/income is unpaid/unreceived.
//     Reversing an accrual whose AP/AR has been cleared by a payment/receipt
//     would strand AP/AR, so that case must be rejected by the caller (422), not
//     reconciled here.
//
// What it does (atomically, in its own $transaction):
//   1. Reverses the existing posted accrual — a flipped-line VOID reversal JE
//      (type 'reversal', reversalOfId set) + marks the original isReversed. This
//      mirrors the proven reversal pattern in the bills/income DELETE paths and
//      preserves posted-entry immutability (QA.md §4.6: never mutate in place).
//   2. Posts a fresh 2-line accrual with the new economics:
//        bill:   DR <expense glAccountId> / CR Accounts Payable
//        income: DR Accounts Receivable   / CR <income glAccountId>
//   3. Re-points the linked invoice transaction (category / entity / amount) so
//      account & balance views match the corrected GL.
//
// The reversal is dated to the ORIGINAL accrual's date. The fresh accrual is dated
// to `newDate` when supplied (a bill-date change moves the expense to a new period,
// as Xero/MYOB do), otherwise to the original date — a period-neutral swap for
// category/amount/entity-only corrections.
//
// Throws AccrualReconcileBlockedError when the posted accrual is NOT a plain
// 2-line entry (a custom GST / withholding split). Re-posting a flat 2-line
// entry would silently drop the user's split, so the caller surfaces a 422
// telling the user to reverse it manually.
//
// Reference generation mirrors the DELETE paths: both refs are pre-computed from
// committed MAX before the transaction opens, so the reversal and the fresh
// accrual cannot collide on `reference` (the global nextJournalReference reads
// committed state and would otherwise return the same value twice within one
// uncommitted transaction).
// ─────────────────────────────────────────────────────────────────────────────

export class AccrualReconcileBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccrualReconcileBlockedError'
  }
}

export interface ReconcileAccrualParams {
  /** 'bill' → DR expense / CR AP. 'income' → DR AR / CR income. */
  kind: 'bill' | 'income'
  familyId: string
  /** The currently-linked posted accrual JE id (record.journalEntryId). */
  journalEntryId: string
  /** Human-readable description for the fresh accrual (record name). */
  description: string
  /** New post-edit amount (positive). */
  amount: number
  /** New post-edit GL account: expense category (bill) or income category (income). */
  glAccountId: string
  /** New post-edit entity scope. Null = unscoped. */
  entityId: string | null
  /** Linked invoice transaction to keep in sync (category/entity/amount). Null = none. */
  invoiceTxId?: string | null
  /**
   * New recognition (tax-point) date for the fresh accrual. When set, the reversal
   * stays in the ORIGINAL period (je.date) and the fresh accrual posts in the NEW
   * period — moving the expense/payable between periods, exactly as Xero/MYOB do
   * when a posted bill's date is changed. Omit/null = period-neutral swap (repost
   * on the original date), used for category/amount/entity-only corrections.
   */
  newDate?: Date | null
}

export async function reconcilePostedAccrualOnEdit(
  params: ReconcileAccrualParams,
  outerTx?: Prisma.TransactionClient,
): Promise<{ newJournalEntryId: string }> {
  const { kind, familyId, journalEntryId, description, amount, glAccountId, entityId, invoiceTxId, newDate } = params

  if (!(amount > 0)) {
    throw new Error(`reconcilePostedAccrualOnEdit: amount must be positive, got ${amount}`)
  }

  // ── Prep (read-only, committed state) ──────────────────────────────────────
  const je = await prisma.financeJournalEntry.findFirst({
    where: { id: journalEntryId, familyId },
    include: { lines: true },
  })
  // Nothing posted to reconcile — leave the GL untouched and report the id
  // unchanged. The caller only invokes this when it believes a posted accrual
  // exists; this guard makes a stale/missing id a no-op rather than a corruption.
  if (!je || !je.isPosted || je.isReversed) {
    return { newJournalEntryId: journalEntryId }
  }
  if (je.lines.length !== 2) {
    throw new AccrualReconcileBlockedError(
      'This entry has a custom journal split. Reverse it manually before changing its category, amount, or entity.',
    )
  }

  // Counterpart account for the fresh accrual.
  const counterpartId = kind === 'bill'
    ? await ensureAccountsPayableCategory(familyId)
    : await ensureAccountsReceivableCategory(familyId)

  // P8-A1: preserve per-member attribution across the reverse+repost. This is
  // null in every path reachable today (member-bearing lines come only from
  // multi-line payslips, which the 2-line guard above rejects), so behaviour is
  // unchanged — but it keeps the module's "memberId is ALWAYS copied through"
  // contract and avoids a silent attribution drop if a 2-line member-attributed
  // accrual is ever introduced.
  const carriedMemberId = je.lines.find(l => l.memberId)?.memberId ?? null

  const freshLines: JournalLine[] = kind === 'bill'
    ? [
        { glAccountId,                side: 'debit',  amount, description, memberId: carriedMemberId },
        { glAccountId: counterpartId, side: 'credit', amount, description: `AP: ${description}`, memberId: carriedMemberId },
      ]
    : [
        { glAccountId: counterpartId, side: 'debit',  amount, description: `AR: ${description}`, memberId: carriedMemberId },
        { glAccountId,                side: 'credit', amount, description, memberId: carriedMemberId },
      ]

  await assertGlAccountsBelongToFamily(prisma, freshLines, familyId)
  assertBalanced(freshLines)

  // Pre-generate BOTH refs from committed MAX before the transaction opens.
  const firstRef = await nextJournalReference(familyId)
  const baseNum = parseInt(firstRef.match(/^JE-(\d+)$/)?.[1] ?? '0', 10)
  const reversalRef = `JE-${String(baseNum).padStart(4, '0')}`
  const freshRef = `JE-${String(baseNum + 1).padStart(4, '0')}`

  // The reversal always backs the original accrual out of its ORIGINAL period.
  const accrualDate = je.date
  // The fresh accrual posts on the new recognition date when supplied (a bill-date
  // change moves the expense to a new period), else stays period-neutral.
  const freshDate = newDate ?? je.date

  // ── Atomic write ───────────────────────────────────────────────────────────
  // When the caller passes its own transaction (outerTx), run the GL writes on it
  // so the reconcile commits or rolls back ATOMICALLY with the caller's row update
  // — otherwise a rolled-back reconcile leaves the row ahead of the GL and the
  // retry-detection (param-vs-row diff) silently skips the resync (FC-12-02).
  // With no outerTx, open our own transaction exactly as before.
  const runWrites = async (tx: Prisma.TransactionClient) => {
    // 1. Reverse the stale accrual (flipped lines).
    await reverseJournalEntry(tx, je, { reference: reversalRef, date: accrualDate, familyId })

    // 2. Post the fresh accrual with the new economics.
    const fresh = await tx.financeJournalEntry.create({
      data: {
        reference: freshRef,
        date: freshDate,
        description,
        type: 'auto_transaction',
        isPosted: true,
        entityId: entityId ?? null,
        familyId,
        lines: {
          create: freshLines.map(l => ({
            glAccountId: l.glAccountId,
            side: l.side,
            amount: l.amount,
            description: l.description ?? null,
            memberId: l.memberId ?? null,
          })),
        },
      },
      select: { id: true },
    })

    // 3. Keep the linked invoice transaction in step with the corrected GL.
    if (invoiceTxId) {
      await tx.financeTransaction.update({
        where: { id: invoiceTxId },
        data: { categoryId: glAccountId, entityId: entityId ?? null, amount, ...(newDate && { date: freshDate }) },
      })
    }

    return { newJournalEntryId: fresh.id }
  }

  return outerTx ? runWrites(outerTx) : prisma.$transaction(runWrites)
}

// ─────────────────────────────────────────────────────────────────────────────
// reverseJournalEntry
//
// The single shared implementation of GL reversal. Creates a balanced
// `type:'reversal'` entry whose lines are the source entry's lines with debit and
// credit sides swapped, then flags the source `isReversed: true`. This is the
// canonical "void / back-out a posted journal" operation — previously hand-rolled
// inline in every finance route (transactions, bills, income, bills/payments) and
// in reconcilePostedAccrualOnEdit above. One implementation, called everywhere.
//
// Faithful flip, no re-validation: the source is a trusted posted, balanced,
// single-family entry, so the flipped copy is balanced and same-family by
// construction (matches the inline copies it replaces). memberId is ALWAYS copied
// onto the reversal lines so member-scoped P&L / tax attribution nets back to zero
// when a member-tagged entry is voided.
//
// Accepts a TxClient so it runs inside a caller's $transaction (pass `tx`) or
// standalone (pass `prisma`). The caller MUST pre-generate `reference` from
// committed MAX BEFORE opening a $transaction (nextJournalReference /
// nextNJournalReferences) — calling the generator inside an uncommitted
// transaction returns colliding refs (SQLite committed-read rule).
// ─────────────────────────────────────────────────────────────────────────────
export interface ReverseJournalOpts {
  /** Pre-generated reference (JE-XXXX). Generate BEFORE opening any $transaction. */
  reference: string
  /** Date for the reversal entry. Callers pass new Date(); reconcile passes je.date to keep the period. */
  date: Date
  familyId: string
  /** Override the reversal description. Default: `VOID: ${je.reference ?? je.id} — ${je.description}`. */
  description?: string
}

export interface ReversibleJournalEntry {
  id: string
  reference: string | null
  description: string | null
  entityId: string | null
  lines: { glAccountId: string; side: string; amount: number; description: string | null; memberId: string | null }[]
}

export async function reverseJournalEntry(
  tx: TxClient,
  je: ReversibleJournalEntry,
  opts: ReverseJournalOpts,
): Promise<{ reversalId: string }> {
  const reversal = await tx.financeJournalEntry.create({
    data: {
      reference: opts.reference,
      date: opts.date,
      description: opts.description ?? `VOID: ${je.reference ?? je.id} — ${je.description}`,
      type: 'reversal',
      isPosted: true,
      reversalOfId: je.id,
      entityId: je.entityId,
      familyId: opts.familyId,
      lines: {
        create: je.lines.map(l => ({
          glAccountId: l.glAccountId,
          side: l.side === 'debit' ? 'credit' : 'debit',
          amount: l.amount,
          description: l.description,
          memberId: l.memberId,
        })),
      },
    },
    select: { id: true },
  })
  await tx.financeJournalEntry.update({ where: { id: je.id }, data: { isReversed: true } })
  return { reversalId: reversal.id }
}

// ─────────────────────────────────────────────────────────────────────────────
// postJournalEntry
//
// Best-effort auto-poster for transaction-linked journals (type='auto_transaction').
// Relocated verbatim from the inline createTransactionJournalEntry in
// transactions/route.ts so GL posting lives in this module, not inline in a route
// (AGENTS.md: no inline GL posting in routes).
//
// DELIBERATELY best-effort, UNLIKE the strict helpers above:
//   - Missing GL account  → silently returns (no throw). The transaction is still
//     saved; the caller logs and moves on.
//   - Unbalanced lines    → still written, but as a DRAFT (isPosted=false) rather
//     than discarded. Balanced lines post immediately (isPosted=true).
//   - P2002 (ref collision) → retried up to MAX_RETRIES with a fresh reference.
//
// Runs on the global prisma client (each retry is a standalone create) and MUST be
// called OUTSIDE any caller $transaction, exactly as the original did.
//
// memberId is copied through when supplied (the transactions route currently passes
// none → null, identical to the original). Preserving it avoids the memberId-drop
// footgun called out for reversals.
// ─────────────────────────────────────────────────────────────────────────────
export interface PostJournalEntryParams {
  description: string
  lines: JournalLine[]
  date: Date
  familyId: string
  entityId: string | null
  sourceTransactionId?: string
}

// What postJournalEntry actually did. It never throws on a bad journal (so the
// already-committed transaction is preserved) — instead it reports the outcome so
// the caller can surface a warning rather than silently swallowing it.
//   posted  — balanced, written and posted to the GL.
//   draft   — unbalanced; saved as an UNPOSTED draft, NOT in the GL until fixed.
//   skipped — a referenced GL account was missing; nothing was written.
export type PostJournalOutcome = 'posted' | 'draft' | 'skipped'

// Maps an outcome to a user-facing warning (null when nothing is wrong). Lives
// here, next to the logic that produces the outcome, so every caller surfaces the
// same authoritative message instead of hand-rolling its own.
export function postJournalWarning(outcome: PostJournalOutcome): string | null {
  switch (outcome) {
    case 'posted':
      return null
    case 'draft':
      return 'The transaction was saved, but its journal entry was unbalanced and ' +
        'saved as an unposted draft — it will not appear in the General Ledger until ' +
        'the lines are corrected.'
    case 'skipped':
      return 'The transaction was saved, but no journal entry was created because a ' +
        'referenced GL account could not be found.'
  }
}

export async function postJournalEntry(params: PostJournalEntryParams): Promise<PostJournalOutcome> {
  const { description, lines, date, familyId, entityId, sourceTransactionId } = params

  const glIds = [...new Set(lines.map(l => l.glAccountId))]
  const valid = await prisma.financeCategory.findMany({
    where: { id: { in: glIds }, familyId },
    select: { id: true },
  })
  if (valid.length !== glIds.length) return 'skipped'   // a referenced account is missing

  // Balance decides posted-vs-draft — does NOT throw (unbalanced saves as a draft).
  const dr = lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
  const cr = lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
  const balanced = Math.abs(dr - cr) < BALANCE_EPSILON

  const MAX_RETRIES = 10
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const reference = await nextJournalReference(familyId)

    try {
      await prisma.financeJournalEntry.create({
        data: {
          reference,
          date,
          description,
          type: 'auto_transaction',
          isPosted: balanced,   // post immediately if balanced; save as draft otherwise
          entityId: entityId ?? null,
          familyId,
          sourceTransactionId: sourceTransactionId ?? null,
          lines: {
            create: lines.map(l => ({
              glAccountId: l.glAccountId,
              side: l.side,
              amount: l.amount,
              description: l.description ?? null,
              memberId: l.memberId ?? null,
            })),
          },
        },
      })
      return balanced ? 'posted' : 'draft'   // success
    } catch (err: any) {
      if (err.code === 'P2002' && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
  // Exhausted reference-collision retries without writing anything.
  return 'skipped'
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
  /** Pre-generated journal reference. If omitted, the next reference is fetched automatically. */
  reference?: string
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

  const reference = params.reference ?? await nextJournalReference(familyId)
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
//   DR  <SGC accrual GL>       sgcAmount       (if > 0; e.g. Accrued SGC - <member>)
//   CR  <SGC income GL>        sgcAmount       (if > 0; e.g. Super Fund SGC - <member>)
//
// Balance invariant:  netPay + paygWithheld + sum(deductions with GL)  ≈  grossPay
//
// SGC (Super Guarantee Contribution):
//   Employer super is paid ON TOP of gross — it never passes through the
//   employee's bank account, so it must not disturb the gross/net identity.
//   It posts as a self-balancing pair appended to the same journal:
//   DR accrued-SGC asset (super owed/paid into the fund) / CR SGC income.
//   This mirrors Xero/QuickBooks payroll (super expense → super liability)
//   from the receiving household's side. When sgcAmount > 0 BOTH GL accounts
//   are required (a one-sided line cannot balance); when sgcAmount is 0 the
//   journal is unchanged.
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
  /** Employer SGC (>= 0). If > 0, BOTH SGC GL accounts must be provided. */
  sgcAmount?: number
  /** DR side — accrued SGC asset (e.g. "Accrued SGC - Mark"). */
  sgcGlAccountId?: string | null
  /** CR side — SGC income (e.g. "Super Fund SGC - Mark"). */
  sgcIncomeGlAccountId?: string | null
  /** Additional deductions. Each entry with a glAccountId becomes a DR line. */
  deductions?: PayslipDeduction[]
  /** Optional entity scope. Null = unscoped. */
  entityId: string | null
  /** Optional member to attribute every line to (per-person reporting). */
  memberId?: string | null
  /** Date cash actually hit the bank. */
  date: Date
  /** Pre-generated journal reference. If omitted, the next reference is fetched automatically. */
  reference?: string
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
    sgcAmount = 0,
    sgcGlAccountId,
    sgcIncomeGlAccountId,
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
  if (sgcAmount < 0) {
    throw new Error(`postPayslipReceiptJournal: sgcAmount cannot be negative, got ${sgcAmount}`)
  }
  if (sgcAmount > 0 && (!sgcGlAccountId || !sgcIncomeGlAccountId)) {
    throw new Error(
      `postPayslipReceiptJournal: sgcAmount is ${sgcAmount} but both SGC GL accounts are required ` +
      `(accrual asset ${sgcGlAccountId ? 'set' : 'MISSING'}, income ${sgcIncomeGlAccountId ? 'set' : 'MISSING'})`,
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

  // SGC: employer super on top of gross — self-balancing pair, outside the
  // gross/net identity (validated above: both accounts present when > 0).
  if (sgcAmount > 0 && sgcGlAccountId && sgcIncomeGlAccountId) {
    lines.push({
      glAccountId: sgcGlAccountId,
      side: 'debit',
      amount: sgcAmount,
      description: `${description} — Employer Super (SGC)`,
      memberId: memberId ?? null,
    })
    lines.push({
      glAccountId: sgcIncomeGlAccountId,
      side: 'credit',
      amount: sgcAmount,
      description: `${description} — Employer Super (SGC)`,
      memberId: memberId ?? null,
    })
  }

  // Balance check: this is the critical check for payslips because grossPay,
  // netPay, PAYG, and deductions all come from user input and any
  // off-by-cent error here would post an unbalanced GL entry.
  await assertGlAccountsBelongToFamily(tx, lines, familyId)
  assertBalanced(lines)

  const reference = params.reference ?? await nextJournalReference(familyId)
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
