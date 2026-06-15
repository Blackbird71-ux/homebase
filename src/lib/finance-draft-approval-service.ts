// =============================================================================
// finance-draft-approval-service.ts
//
// Ties the Block 2a GL posting helpers to the draft lifecycle. A draft
// (status='draft') is reviewed by the user and APPROVED. Approval is the
// point at which the GL is touched (for bills and simple income); payslip
// income approval is a pure workflow gate (Q1=a) — its multi-line journal
// posts later at receipt via the existing untouched income route.
//
// Decisions locked:
//   Q1=a — Approving a PAYSLIP income draft posts NOTHING. It only flips
//          status to 'awaiting_receipt'. The payslip multi-line journal is
//          posted by the existing income route when the user marks it
//          received. Approving a SIMPLE income draft posts the Stage-1
//          accrual (DR AR / CR Income) and flips to 'awaiting_receipt'.
//   Q2   — Bill approval is ACCRUAL ONLY (DR Expense / CR AP). Payment is a
//          separate later action via the existing bills route. No
//          alsoPayNow option.
//
// Status transitions:
//   bill:   draft → awaiting_payment   (postBillAccrualJournal runs)
//   income (simple):  draft → awaiting_receipt   (postIncomeAccrualJournal runs)
//   income (payslip): draft → awaiting_receipt   (NO journal — Q1=a)
//   any:    draft → cancelled          (no GL effect)
//
// Idempotency: approval asserts the current status is exactly 'draft'. A
// second approval call throws ("not in draft state") so a double-click or
// double-submit cannot post a journal twice.
//
// Existing routes (bills/route.ts, income/route.ts) are NOT modified.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit-log'
import type { SessionUser } from '@/types'
import {
  postIncomeAccrualJournal,
} from '@/lib/finance-posting'
import { postBillAccrualWithPrepayment } from '@/lib/finance-bill-receive'
import {
  computeSpawnedSnapshotHash,
  type SnapshotLine,
  type TemplateKind,
} from '@/lib/finance-recurring-template-service'
import { toMonthlyAmount } from '@/lib/financeShared'
import { addUtcYears } from '@/lib/timezone'
import { deriveTemplatePrimaryCategory } from '@/lib/finance-template-helpers'

// ── Result types ─────────────────────────────────────────────────────────────

export interface ApprovalResult {
  id: string
  kind: TemplateKind
  /** New status after approval. */
  status: string
  /** The posted GL journal entry id, or null when no journal was posted
   *  (payslip income approval — Q1=a). */
  journalEntryId: string | null
  /** The JE-NNNN reference, or null when no journal posted. */
  journalReference: string | null
}

export interface BulkApproveResult {
  kind: TemplateKind
  /** Drafts whose stored snapshot hash still matched the template (=unchanged). */
  candidatesFound: number
  /** Of those, how many were successfully approved. */
  approved: number
  /** Per-draft failures (id → error message). */
  failures: { id: string; error: string }[]
  approvedIds: string[]
}

// ── Internal: assert a draft is approvable ───────────────────────────────────

function assertDraftStatus(status: string | null, id: string): void {
  if (status !== 'draft') {
    throw new Error(
      `Cannot approve ${id}: expected status 'draft' but found ` +
      `'${status ?? 'null (legacy non-template row)'}'`,
    )
  }
}

// ── Internal: recover a draft's primary GL category from its template ─────────
// Drafts spawned before categoryId derivation (audit F1) carry categoryId=null.
// The expense/income GL account still lives on the template lines, so derive it
// the same way createTemplate now does. Returns null when there is no template
// or no identifiable expense/income line (caller then rejects the approval).
async function deriveDraftCategoryFromTemplate(
  user: SessionUser,
  kind: TemplateKind,
  templateId: string | null,
): Promise<string | null> {
  if (!templateId) return null
  const template = await prisma.financeRecurringTemplate.findFirst({
    where: { id: templateId, familyId: user.familyId },
    include: { lines: true },
  })
  if (!template || template.lines.length === 0) return null
  const glAccounts = await prisma.financeCategory.findMany({
    where: { id: { in: template.lines.map(l => l.glAccountId) }, familyId: user.familyId },
    select: { id: true, type: true },
  })
  return deriveTemplatePrimaryCategory(kind, template.lines, glAccounts)
}

// ─────────────────────────────────────────────────────────────────────────────
// approveBillDraft
//
// Q2 — accrual only. Posts DR Expense / CR AP via postBillAccrualJournal,
// links the journal, flips status to 'awaiting_payment', stamps postedAt.
//
// The expense GL account is resolved from the draft's categoryId. If the
// draft already has a draft journal entry (journalEntryId set — e.g. a
// pre-computed GST split written elsewhere), postBillAccrualJournal will
// promote it as-is; otherwise it builds the standard 2-line entry.
// ─────────────────────────────────────────────────────────────────────────────

export async function approveBillDraft(
  user: SessionUser,
  billId: string,
): Promise<ApprovalResult> {
  const draft = await prisma.financeRecurringBill.findFirst({
    where: { id: billId, familyId: user.familyId },
  })
  if (!draft) {
    throw new Error('Bill draft not found')
  }
  assertDraftStatus(draft.status, billId)

  // The expense category is the GL account used for the prepayment gate, budget
  // sync, and the no-draft posting fallback. Legacy drafts spawned from a
  // template whose categoryId was never derived (audit F1) carry categoryId=null
  // even though their balanced draft journal would post correctly. Recover it
  // from the template's expense line before gating on it.
  const resolvedCategoryId = draft.categoryId
    ?? await deriveDraftCategoryFromTemplate(user, 'bill', draft.templateId)
  if (!resolvedCategoryId) {
    throw new Error(
      `Cannot approve bill draft ${billId}: no expense category set. ` +
      `Assign a category before approving.`,
    )
  }
  if (resolvedCategoryId !== draft.categoryId) {
    await prisma.financeRecurringBill.update({
      where: { id: billId },
      data: { categoryId: resolvedCategoryId },
    })
  }

  // Accrual is recognised on billDate (the occurrence/invoice date — when the
  // liability is incurred). For legacy rows without billDate, fall back to
  // nextDueDate so existing approved bills are unaffected.
  const accrualDate = draft.billDate ?? draft.nextDueDate

  // ── Legacy draft journal repair ─────────────────────────────────────────
  // Drafts spawned before the journal-linking fix have journalEntryId=null.
  // Materialise the missing journal from the current template lines so the
  // correct GL split is posted rather than the 2-line fallback.
  let resolvedJournalEntryId = draft.journalEntryId ?? null
  if (!resolvedJournalEntryId && draft.templateId) {
    const template = await prisma.financeRecurringTemplate.findFirst({
      where: { id: draft.templateId, familyId: user.familyId },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    })
    if (template && template.lines.length >= 2) {
      const totalDr = template.lines.filter(l => l.side !== 'credit').reduce((s, l) => s + l.amount, 0)
      const totalCr = template.lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
      if (Math.abs(totalDr - totalCr) <= 0.005) {
        const draftJe = await prisma.financeJournalEntry.create({
          data: {
            reference: null,
            date: accrualDate,
            description: draft.name,
            type: 'auto_transaction',
            isPosted: false,
            entityId: draft.entityId ?? null,
            familyId: user.familyId,
            lines: {
              create: template.lines.map(l => ({
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
        resolvedJournalEntryId = draftJe.id
        await prisma.financeRecurringBill.update({
          where: { id: billId },
          data: { journalEntryId: resolvedJournalEntryId },
        })
      }
    }
  }

  const post = await prisma.$transaction(async (tx) => {
    // Same prepayment gate as direct receive (audit F5): a material prepayment
    // approved from the Drafts inbox capitalises to Prepaid Expenses and gets
    // its amortisation schedule, identical to receiving the bill directly.
    const r = await postBillAccrualWithPrepayment(tx, {
      familyId: user.familyId,
      billId,
      description: draft.name,
      amount: draft.amount,
      expenseGlAccountId: resolvedCategoryId,
      entityId: draft.entityId ?? null,
      date: accrualDate,
      draftJournalEntryId: resolvedJournalEntryId,
      frequency: draft.frequency,
      coverageStart: draft.coverageStart,
      coverageEnd: draft.coverageEnd,
    })

    await tx.financeRecurringBill.update({
      where: { id: billId },
      data: {
        status: 'awaiting_payment',
        journalEntryId: r.journalEntryId,
        invoiceReceived: true,
        invoiceReceivedDate: accrualDate,
        postedAt: new Date(),
      },
    })

    return r
  })

  await createAuditLog(
    user,
    'update',
    'financeDraftBill',
    billId,
    `Approved bill draft "${draft.name}" — posted accrual ${post.reference}`,
    {
      action: 'approve',
      journalEntryId: post.journalEntryId,
      journalReference: post.reference,
      amount: post.amount,
      newStatus: 'awaiting_payment',
    },
  )

  // Auto-upsert a budget rule if the spawning template has includeInBudget: true.
  // Best-effort: a budget failure does not roll back the GL posting.
  if (draft.templateId) {
    try {
      const template = await prisma.financeRecurringTemplate.findFirst({
        where: { id: draft.templateId, familyId: user.familyId },
        select: { includeInBudget: true },
      })
      if (template?.includeInBudget) {
        const monthlyAmount = toMonthlyAmount(draft.amount, draft.frequency ?? 'monthly')
        const startDate = new Date(new Date().getFullYear(), 0, 1)
        const endDate = addUtcYears(startDate, 10)
        const existing = await prisma.financeBudget.findFirst({
          where: { billId, familyId: user.familyId },
        })
        if (existing) {
          await prisma.financeBudget.update({
            where: { id: existing.id },
            data: {
              name: draft.name,
              amount: monthlyAmount,
              categoryId: resolvedCategoryId,
              period: 'monthly',
              isIncludedInPlanner: true,
              ...(draft.entityId !== undefined && { entityId: draft.entityId ?? null }),
            },
          })
        } else {
          await prisma.financeBudget.create({
            data: {
              name: draft.name,
              amount: monthlyAmount,
              categoryId: resolvedCategoryId,
              period: 'monthly',
              startDate,
              endDate,
              rollover: false,
              alertThreshold: 80,
              billId,
              isIncludedInPlanner: true,
              entityId: draft.entityId ?? null,
              familyId: user.familyId,
            },
          })
        }
      }
    } catch {
      // Non-fatal: budget rule sync failure should not block approval
    }
  }

  return {
    id: billId,
    kind: 'bill',
    status: 'awaiting_payment',
    journalEntryId: post.journalEntryId,
    journalReference: post.reference,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// approveIncomeDraft
//
// Dispatches on whether the draft has an attached FinancePayslip:
//
//   SIMPLE income (no payslip):
//     Posts Stage-1 accrual DR AR / CR Income via postIncomeAccrualJournal.
//     status → 'awaiting_receipt', postedAt stamped.
//
//   PAYSLIP income (FinancePayslip attached):
//     Q1=a — posts NOTHING. status → 'awaiting_receipt'. postedAt left null
//     (no GL event yet). The payslip multi-line journal is posted later by
//     the existing income route when the user marks it received.
//
// The income GL account for the simple path is the draft's categoryId.
// ─────────────────────────────────────────────────────────────────────────────

export async function approveIncomeDraft(
  user: SessionUser,
  incomeId: string,
): Promise<ApprovalResult> {
  const draft = await prisma.financeIncomeEntry.findFirst({
    where: { id: incomeId, familyId: user.familyId },
    include: { payslip: true },
  })
  if (!draft) {
    throw new Error('Income draft not found')
  }
  assertDraftStatus(draft.status, incomeId)

  const isPayslip = draft.payslip != null

  if (isPayslip) {
    // ── Q1=a: payslip approval posts nothing ──────────────────────────────
    await prisma.financeIncomeEntry.update({
      where: { id: incomeId },
      data: {
        status: 'awaiting_receipt',
        // postedAt intentionally NOT set — no GL event occurred. It will be
        // stamped by the existing income route when the payslip is received
        // and its multi-line journal posts.
      },
    })

    await createAuditLog(
      user,
      'update',
      'financeDraftIncome',
      incomeId,
      `Approved payslip income draft "${draft.name}" — no journal posted (posts at receipt)`,
      {
        action: 'approve',
        mode: 'payslip',
        journalEntryId: null,
        newStatus: 'awaiting_receipt',
      },
    )

    return {
      id: incomeId,
      kind: 'income',
      status: 'awaiting_receipt',
      journalEntryId: null,
      journalReference: null,
    }
  }

  // ── SIMPLE income: post Stage-1 accrual ─────────────────────────────────
  // Recover a missing income category from the template's income line (audit
  // F1) — same rationale as approveBillDraft.
  const resolvedCategoryId = draft.categoryId
    ?? await deriveDraftCategoryFromTemplate(user, 'income', draft.templateId)
  if (!resolvedCategoryId) {
    throw new Error(
      `Cannot approve income draft ${incomeId}: no income category set. ` +
      `Assign a category before approving.`,
    )
  }
  if (resolvedCategoryId !== draft.categoryId) {
    await prisma.financeIncomeEntry.update({
      where: { id: incomeId },
      data: { categoryId: resolvedCategoryId },
    })
  }

  // Accrual recognised on the expected date (when the income is earned /
  // the remittance is advised). Mirrors the existing income route Stage 1.
  const accrualDate = draft.nextExpectedDate

  // ── Legacy draft journal repair ─────────────────────────────────────────
  // Drafts spawned before the journal-linking fix (cd60069, May 18 2026)
  // have journalEntryId=null. If the draft came from a template, read the
  // template's current lines now and materialise the missing draft journal so
  // postIncomeAccrualJournal can promote it via branch (a) rather than
  // falling through to the plain 2-line fallback.
  let resolvedJournalEntryId = draft.journalEntryId ?? null
  if (!resolvedJournalEntryId && draft.templateId) {
    const template = await prisma.financeRecurringTemplate.findFirst({
      where: { id: draft.templateId, familyId: user.familyId },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    })
    if (template && template.lines.length >= 2) {
      const totalDr = template.lines.filter(l => l.side !== 'credit').reduce((s, l) => s + l.amount, 0)
      const totalCr = template.lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
      if (Math.abs(totalDr - totalCr) <= 0.005) {
        const draftJe = await prisma.financeJournalEntry.create({
          data: {
            reference: null,
            date: accrualDate,
            description: draft.name,
            type: 'auto_transaction',
            isPosted: false,
            entityId: draft.entityId ?? null,
            familyId: user.familyId,
            lines: {
              create: template.lines.map(l => ({
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
        resolvedJournalEntryId = draftJe.id
        await prisma.financeIncomeEntry.update({
          where: { id: incomeId },
          data: { journalEntryId: resolvedJournalEntryId },
        })
      }
    }
  }

  const post = await prisma.$transaction(async (tx) => {
    const r = await postIncomeAccrualJournal(tx, {
      familyId: user.familyId,
      description: draft.name,
      amount: draft.amount,
      incomeGlAccountId: resolvedCategoryId,
      entityId: draft.entityId ?? null,
      date: accrualDate,
      draftJournalEntryId: resolvedJournalEntryId,
    })

    await tx.financeIncomeEntry.update({
      where: { id: incomeId },
      data: {
        status: 'awaiting_receipt',
        journalEntryId: r.journalEntryId,
        invoiceReceived: true,
        invoiceReceivedDate: accrualDate,
        postedAt: new Date(),
      },
    })

    return r
  })

  await createAuditLog(
    user,
    'update',
    'financeDraftIncome',
    incomeId,
    `Approved income draft "${draft.name}" — posted accrual ${post.reference}`,
    {
      action: 'approve',
      mode: 'simple',
      journalEntryId: post.journalEntryId,
      journalReference: post.reference,
      amount: post.amount,
      newStatus: 'awaiting_receipt',
    },
  )

  return {
    id: incomeId,
    kind: 'income',
    status: 'awaiting_receipt',
    journalEntryId: post.journalEntryId,
    journalReference: post.reference,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// cancelDraft
//
// Sets status='cancelled'. No GL effect. A cancelled draft is retained for
// audit (not deleted) and is excluded from the spawn worker's idempotency
// check ONLY in the sense that a new occurrence for the same date can spawn
// again (status: { not: 'cancelled' } in the spawn query) — i.e. cancelling
// a draft does NOT permanently suppress that occurrence; the next worker run
// may re-create it. To permanently stop occurrences, disable the template.
// ─────────────────────────────────────────────────────────────────────────────

export async function cancelDraft(
  user: SessionUser,
  kind: TemplateKind,
  id: string,
): Promise<{ id: string; kind: TemplateKind; status: 'cancelled' }> {
  if (kind === 'bill') {
    const draft = await prisma.financeRecurringBill.findFirst({
      where: { id, familyId: user.familyId },
      select: { id: true, name: true, status: true },
    })
    if (!draft) throw new Error('Bill draft not found')
    assertDraftStatus(draft.status, id)

    await prisma.financeRecurringBill.update({
      where: { id },
      data: { status: 'cancelled' },
    })

    await createAuditLog(
      user,
      'update',
      'financeDraftBill',
      id,
      `Cancelled bill draft "${draft.name}"`,
      { action: 'cancel', newStatus: 'cancelled' },
    )
  } else {
    const draft = await prisma.financeIncomeEntry.findFirst({
      where: { id, familyId: user.familyId },
      select: { id: true, name: true, status: true },
    })
    if (!draft) throw new Error('Income draft not found')
    assertDraftStatus(draft.status, id)

    await prisma.financeIncomeEntry.update({
      where: { id },
      data: { status: 'cancelled' },
    })

    await createAuditLog(
      user,
      'update',
      'financeDraftIncome',
      id,
      `Cancelled income draft "${draft.name}"`,
      { action: 'cancel', newStatus: 'cancelled' },
    )
  }

  return { id, kind, status: 'cancelled' }
}

// ─────────────────────────────────────────────────────────────────────────────
// bulkApproveUnchangedDrafts
//
// Approves every draft of the given kind whose spawnedSnapshotHash STILL
// matches the hash recomputed from its current state + its source template.
// This is the "approve everything I haven't touched" action.
//
// How "unchanged" is determined:
//   1. The spawn worker stored spawnedSnapshotHash = H(template lines,
//      defaultDueOffsetDays, kind, occurrenceDate) on each draft.
//   2. Any user edit to a draft is expected to null out spawnedSnapshotHash
//      (that wiring lives in the edit routes — Block 5 — not here).
//   3. Here we additionally RE-VERIFY: recompute the hash from the draft's
//      current linked template + the draft's own occurrence date and confirm
//      it equals the stored hash. This double-checks that neither the draft
//      nor the template drifted. A draft with spawnedSnapshotHash=null (user
//      edited it, or template was deleted) is NOT a candidate.
//
// Drafts whose template was deleted (templateId=null) are skipped — without
// the template we cannot recompute/verify the hash, so we treat them as
// "changed" and leave them for manual review.
//
// Each draft is approved via the same approveBillDraft / approveIncomeDraft
// path, so all GL posting + audit logging happens identically to a single
// approval. A failure on one draft does not abort the batch.
// ─────────────────────────────────────────────────────────────────────────────

export async function bulkApproveUnchangedDrafts(
  user: SessionUser,
  kind: TemplateKind,
): Promise<BulkApproveResult> {
  const result: BulkApproveResult = {
    kind,
    candidatesFound: 0,
    approved: 0,
    failures: [],
    approvedIds: [],
  }

  if (kind === 'bill') {
    const drafts = await prisma.financeRecurringBill.findMany({
      where: {
        familyId: user.familyId,
        status: 'draft',
        spawnedSnapshotHash: { not: null },
        templateId: { not: null },
      },
      select: {
        id: true,
        billDate: true,
        nextDueDate: true,
        spawnedSnapshotHash: true,
        templateId: true,
      },
    })

    for (const d of drafts) {
      try {
        const template = await prisma.financeRecurringTemplate.findFirst({
          where: { id: d.templateId!, familyId: user.familyId },
          include: { lines: true },
        })
        if (!template) continue // template gone — treat as changed, skip

        const snapshotLines: SnapshotLine[] = template.lines.map(l => ({
          glAccountId: l.glAccountId,
          side: l.side === 'credit' ? 'credit' : 'debit',
          amount: l.amount,
          taxRateId: l.taxRateId,
          memberId: l.memberId,
          description: l.description,
          sortOrder: l.sortOrder,
          id: l.id,
        }))

        // Use the stored billDate (recognition/occurrence date) directly.
        // For legacy rows backfilled with billDate = nextDueDate (offset was 0),
        // the reversed calculation gives the same result either way.
        const occurrenceDate = d.billDate ?? new Date(
          d.nextDueDate.getTime() - template.defaultDueOffsetDays * 86_400_000,
        )

        const recomputed = computeSpawnedSnapshotHash({
          kind: 'bill',
          defaultDueOffsetDays: template.defaultDueOffsetDays,
          lines: snapshotLines,
          occurrenceDate,
        })

        if (recomputed !== d.spawnedSnapshotHash) {
          // Drifted — not an "unchanged" candidate.
          continue
        }

        result.candidatesFound += 1
        await approveBillDraft(user, d.id)
        result.approved += 1
        result.approvedIds.push(d.id)
      } catch (err) {
        result.failures.push({
          id: d.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }
  } else {
    const drafts = await prisma.financeIncomeEntry.findMany({
      where: {
        familyId: user.familyId,
        status: 'draft',
        spawnedSnapshotHash: { not: null },
        templateId: { not: null },
      },
      select: {
        id: true,
        nextExpectedDate: true,
        spawnedSnapshotHash: true,
        templateId: true,
      },
    })

    for (const d of drafts) {
      try {
        const template = await prisma.financeRecurringTemplate.findFirst({
          where: { id: d.templateId!, familyId: user.familyId },
          include: { lines: true },
        })
        if (!template) continue

        const snapshotLines: SnapshotLine[] = template.lines.map(l => ({
          glAccountId: l.glAccountId,
          side: l.side === 'credit' ? 'credit' : 'debit',
          amount: l.amount,
          taxRateId: l.taxRateId,
          memberId: l.memberId,
          description: l.description,
          sortOrder: l.sortOrder,
          id: l.id,
        }))

        // Income drafts store nextExpectedDate = the occurrence date directly
        // (no due-offset applied at spawn for income), so no reversal needed.
        const occurrenceDate = d.nextExpectedDate

        const recomputed = computeSpawnedSnapshotHash({
          kind: 'income',
          defaultDueOffsetDays: template.defaultDueOffsetDays,
          lines: snapshotLines,
          occurrenceDate,
        })

        if (recomputed !== d.spawnedSnapshotHash) {
          continue
        }

        result.candidatesFound += 1
        await approveIncomeDraft(user, d.id)
        result.approved += 1
        result.approvedIds.push(d.id)
      } catch (err) {
        result.failures.push({
          id: d.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }
  }

  return result
}
