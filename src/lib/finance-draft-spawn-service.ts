// =============================================================================
// finance-draft-spawn-service.ts
//
// The spawn worker. Reads due FinanceRecurringTemplate rows and materialises
// FinanceRecurringBill / FinanceIncomeEntry rows with status='draft'. Drafts
// are NOT GL events — no journal entry is posted here. Approval (the
// draft-approval service, 2b.4) performs the GL write.
//
// Contracts:
//
//   Idempotency (Q1=a): before inserting a draft for template T at occurrence
//     date D, the worker checks whether a draft (any non-cancelled status)
//     already exists for (templateId=T, calendar-date(dueDate)=D). If so it
//     skips the insert but STILL advances the cursor, so a re-run is a no-op.
//
//   Catch-up cap (Q2=c): if a template missed many occurrences (NAS was off),
//     the worker spawns ALL missed drafts up to MAX_CATCHUP_PER_RUN per
//     template per run. Beyond the cap it advances the cursor to the last
//     spawned occurrence and stops; the next run continues catch-up. This
//     prevents a misconfigured short-interval template generating thousands
//     of drafts in a single pass.
//
//   Advance days (Q3): a template is "due to spawn" when
//     nextOccurrenceDate <= asOf + createInAdvanceDays.
//     i.e. a bill due on the 15th with createInAdvanceDays=7 spawns on the 8th.
//
//   GL-account-vanished (Option B): if any template line references a
//     glAccountId that no longer exists for the family, the worker DISABLES
//     the template (enabled=false), writes an audit log, and skips it. No
//     broken draft is produced. The user sees the disabled template + the
//     audit entry and can repoint it at a valid account and re-enable.
//
// This module uses the prisma singleton. Each template's catch-up loop runs
// its draft inserts + cursor advance inside a single $transaction so a crash
// mid-catch-up cannot leave the cursor ahead of the drafts actually written.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit-log'
import { utcMidnight } from '@/lib/timezone'
import type { SessionUser } from '@/types'
import {
  computeNextOccurrenceDate,
  computeSpawnedSnapshotHash,
  type OccurrenceTemplate,
  type SnapshotLine,
  type TemplateKind,
} from '@/lib/finance-recurring-template-service'
import { addDays } from 'date-fns'

// Hard cap on how many missed occurrences a single template will spawn in one
// worker run. See Q2=c. A weekly template off for a year = ~52 (under cap);
// a daily custom template off for a year = 365 (capped at 60, continues next
// run). 60 chosen so even daily templates fully catch up within ~6 runs.
const MAX_CATCHUP_PER_RUN = 60

// ── Result types ─────────────────────────────────────────────────────────────

export interface TemplateSpawnResult {
  templateId: string
  templateName: string
  kind: TemplateKind
  /** Drafts actually inserted this run. */
  spawned: number
  /** Occurrences skipped because a draft already existed (idempotency). */
  skippedExisting: number
  /** True if the catch-up cap was hit and more occurrences remain for next run. */
  cappedWithMoreRemaining: boolean
  /** True if the template was auto-disabled because a GL account vanished. */
  disabledDueToMissingGlAccount: boolean
  /** Populated when disabledDueToMissingGlAccount: the missing account ids. */
  missingGlAccountIds: string[]
}

export interface SpawnReport {
  familyId: string
  asOf: Date
  templatesConsidered: number
  results: TemplateSpawnResult[]
  totalSpawned: number
}

// ── Calendar-date helpers ────────────────────────────────────────────────────
// Occurrences are day-precision. We compare on YYYY-MM-DD so a draft scheduled
// for "2026-06-15 00:00" and a recompute that lands on "2026-06-15 13:42" are
// treated as the same occurrence.

function calendarDayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function calendarDayEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

// ─────────────────────────────────────────────────────────────────────────────
// isWithinAdvanceWindow
//
// The single source of truth for "may this occurrence be materialised yet?".
// Per Q3 an occurrence is due to spawn when its date is on or before
// (asOf + createInAdvanceDays), at calendar-day granularity. The nightly cron
// AND the bill/income receipt-and-payment spawn-next paths all gate on this,
// so a draft can never be materialised earlier than createInAdvanceDays before
// its occurrence — whichever trigger fires first (a paid bill must not spawn
// its successor weeks ahead of the configured advance window).
// ─────────────────────────────────────────────────────────────────────────────
export function isWithinAdvanceWindow(
  occurrenceDate: Date,
  createInAdvanceDays: number,
  asOf: Date = new Date(),
): boolean {
  return occurrenceDate <= calendarDayEnd(addDays(asOf, createInAdvanceDays))
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSnapshotLinesFromTemplate
//
// Maps FinanceRecurringTemplateLine[] → SnapshotLine[] for hashing AND for
// computing the draft's headline amount. Note this does NOT expand the GST
// split into 3 lines — the GST split is materialised by the draft-approval
// service when the draft is approved (per Q1 spawn-time decision: the draft
// stores the template's lines; the GST expansion into a draft journal entry
// happens at approval). The spawnedSnapshotHash therefore hashes the template
// lines as authored, which is what the bulk-approve-unchanged check needs.
// ─────────────────────────────────────────────────────────────────────────────

interface TemplateLineRow {
  id: string
  description: string
  amount: number
  side: string
  glAccountId: string
  taxRateId: string | null
  memberId: string | null
  sortOrder: number
}

function buildSnapshotLines(lines: TemplateLineRow[]): SnapshotLine[] {
  return lines.map(l => ({
    glAccountId: l.glAccountId,
    side: l.side === 'credit' ? 'credit' : 'debit',
    amount: l.amount,
    taxRateId: l.taxRateId,
    memberId: l.memberId,
    description: l.description,
    sortOrder: l.sortOrder,
    id: l.id,
  }))
}

// Headline amount for a draft = sum of debit-side line amounts for a bill,
// sum of credit-side for income. This mirrors how the existing bill/income
// rows store a single `amount` for forecasting. For a simple 1-line template
// (e.g. expense line only) this is just that line's amount.
function computeHeadlineAmount(lines: TemplateLineRow[], kind: TemplateKind): number {
  if (kind === 'bill') {
    const dr = lines.filter(l => l.side !== 'credit').reduce((s, l) => s + l.amount, 0)
    if (dr > 0) return dr
    // Fallback: no debit lines (unusual) — use credit total.
    return lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
  } else {
    const cr = lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
    if (cr > 0) return cr
    return lines.filter(l => l.side !== 'credit').reduce((s, l) => s + l.amount, 0)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// findMissingGlAccounts
//
// Returns the subset of glAccountIds referenced by the template's lines (and,
// for payslip templates, the payslip GL accounts) that no longer exist for
// the family. Empty array = all good.
// ─────────────────────────────────────────────────────────────────────────────
async function findMissingGlAccounts(
  familyId: string,
  lineGlIds: string[],
  payslipGlIds: string[],
): Promise<string[]> {
  const allIds = [...new Set([...lineGlIds, ...payslipGlIds])]
  if (allIds.length === 0) return []
  const found = await prisma.financeCategory.findMany({
    where: { id: { in: allIds }, familyId },
    select: { id: true },
  })
  const foundSet = new Set(found.map(f => f.id))
  return allIds.filter(id => !foundSet.has(id))
}

// ─────────────────────────────────────────────────────────────────────────────
// spawnDraftsForTemplate
//
// Catch-up spawn for ONE template. Returns a per-template result. Does its
// own family-isolation checks and GL-vanished handling. The caller
// (spawnDueDrafts) is responsible for selecting which templates are due.
//
// `user` is the SessionUser whose action triggered the spawn (for cron this
// is a system pseudo-user constructed by the caller). Used for audit logs.
// ─────────────────────────────────────────────────────────────────────────────

export type FullTemplate = NonNullable<
  Awaited<ReturnType<typeof prisma.financeRecurringTemplate.findFirst<{ include: { lines: true } }>>>
>

// ─────────────────────────────────────────────────────────────────────────────
// createOccurrenceDraft
//
// Materialises ONE draft (bill or income) for `template` at `occurrenceDateRaw`,
// inside the caller-supplied transaction. This is the single source of truth for
// what a spawned draft looks like: the nightly cron worker AND the bill/income
// PATCH spawn-next paths both call it, so a draft spawned on receipt/payment is
// identical to one spawned by the worker (same headline amount, draft journal,
// snapshot hash, and payslip).
//
// The occurrence date is normalised to UTC midnight (the stored convention) so a
// wall-clock instant can never leak into billDate / nextExpectedDate / the GL
// accrual date. The caller is responsible for idempotency, schedule bounds
// (endDate / occurrencesRemaining) and advancing the template cursor.
//
// `parentId` records lineage on the spawned child (parentBillId / parentIncomeId).
// The cron omits it (children are reconciled via templateId + idempotency); the
// receipt/payment PATCH paths pass the entry being received/paid so the existing
// undo-receipt / unpay descendant-cleanup continues to find and remove the child.
// ─────────────────────────────────────────────────────────────────────────────
export async function createOccurrenceDraft(
  tx: Prisma.TransactionClient,
  template: FullTemplate,
  occurrenceDateRaw: Date,
  parentId?: string,
): Promise<void> {
  const kind: TemplateKind = template.kind === 'income' ? 'income' : 'bill'
  const occurrenceDate = utcMidnight(occurrenceDateRaw)
  const snapshotLines = buildSnapshotLines(template.lines as TemplateLineRow[])
  const headlineAmount = computeHeadlineAmount(template.lines as TemplateLineRow[], kind)
  const snapshotHash = computeSpawnedSnapshotHash({
    kind,
    defaultDueOffsetDays: template.defaultDueOffsetDays,
    lines: snapshotLines,
    occurrenceDate,
  })

  if (kind === 'bill') {
    // billDate = occurrence date (GL recognition date: when liability is incurred).
    // nextDueDate = occurrence + defaultDueOffsetDays (when payment is expected).
    const dueDate = utcMidnight(addDays(occurrenceDate, template.defaultDueOffsetDays))
    const draftBill = await tx.financeRecurringBill.create({
      data: {
        name: template.name,
        amount: headlineAmount,
        accountId: template.accountId,
        categoryId: template.categoryId,
        frequency: template.frequency,
        dayOfMonth: template.dayOfMonth,
        monthOfYear: template.monthOfYear,
        billDate: occurrenceDate,
        nextDueDate: dueDate,
        endDate: template.endDate,
        isActive: true,
        // All template-spawned bills are recurring; one-off bills are
        // not templated, so this is always 'recurring'.
        billType: 'recurring',
        memberId: template.memberId,
        locationId: template.locationId,
        vendorId: template.counterpartyId,
        entityId: template.entityId,
        taxClassification: template.taxClassification,
        invoiceReceived: false,
        paid: false,
        familyId: template.familyId,
        // Lifecycle
        templateId: template.id,
        parentBillId: parentId ?? null,
        status: 'draft',
        spawnedAt: new Date(),
        spawnedSnapshotHash: snapshotHash,
      },
      select: { id: true },
    })

    // Templates with ≥2 balanced lines (e.g. expense + GST + AP): materialise
    // the template lines into an unposted draft FinanceJournalEntry so the
    // draft editor shows the correct split and approval promotes it via branch
    // (a) of postBillAccrualJournal instead of a plain 2-line DR expense / CR AP.
    if (snapshotLines.length >= 2) {
      const totalDr = snapshotLines
        .filter(l => l.side !== 'credit')
        .reduce((s, l) => s + l.amount, 0)
      const totalCr = snapshotLines
        .filter(l => l.side === 'credit')
        .reduce((s, l) => s + l.amount, 0)
      if (Math.abs(totalDr - totalCr) <= 0.005) {
        const draftJournal = await tx.financeJournalEntry.create({
          data: {
            reference: null,
            date: occurrenceDate,
            description: template.name,
            type: 'auto_transaction',
            isPosted: false,
            entityId: template.entityId ?? null,
            familyId: template.familyId,
            lines: {
              create: snapshotLines.map(l => ({
                glAccountId: l.glAccountId,
                side: l.side,
                amount: l.amount,
                description: l.description || null,
              })),
            },
          },
          select: { id: true },
        })
        await tx.financeRecurringBill.update({
          where: { id: draftBill.id },
          data: { journalEntryId: draftJournal.id },
        })
      }
    }
  } else {
    const draftEntry = await tx.financeIncomeEntry.create({
      data: {
        name: template.name,
        amount: headlineAmount,
        frequency: template.frequency,
        incomeType: 'recurring',
        nextExpectedDate: occurrenceDate,
        endDate: template.endDate,
        isActive: true,
        received: false,
        invoiceReceived: false,
        dayOfMonth: template.dayOfMonth,
        monthOfYear: template.monthOfYear,
        memberId: template.memberId,
        accountId: template.accountId,
        categoryId: template.categoryId,
        vendorId: template.counterpartyId,
        entityId: template.entityId,
        locationId: template.locationId,
        isTaxTracked: template.isTaxTracked,
        taxRate: template.taxRate,
        taxClassification: template.taxClassification,
        familyId: template.familyId,
        // Lifecycle
        templateId: template.id,
        parentIncomeId: parentId ?? null,
        status: 'draft',
        spawnedAt: new Date(),
        spawnedSnapshotHash: snapshotHash,
      },
      select: { id: true },
    })

    // Non-payslip templates with ≥2 balanced lines: materialise the
    // template lines into an unposted draft FinanceJournalEntry so the
    // draft editor shows the correct split and approval promotes it
    // via branch (a) of postIncomeAccrualJournal instead of generating
    // a plain 2-line DR AR / CR Income fallback.
    if (!template.payslipEnabled && snapshotLines.length >= 2) {
      const totalDr = snapshotLines
        .filter(l => l.side !== 'credit')
        .reduce((s, l) => s + l.amount, 0)
      const totalCr = snapshotLines
        .filter(l => l.side === 'credit')
        .reduce((s, l) => s + l.amount, 0)
      if (Math.abs(totalDr - totalCr) <= 0.005) {
        const draftJournal = await tx.financeJournalEntry.create({
          data: {
            reference: null,
            date: occurrenceDate,
            description: template.name,
            type: 'auto_transaction',
            isPosted: false,
            entityId: template.entityId ?? null,
            familyId: template.familyId,
            lines: {
              create: snapshotLines.map(l => ({
                glAccountId: l.glAccountId,
                side: l.side,
                amount: l.amount,
                description: l.description || null,
              })),
            },
          },
          select: { id: true },
        })
        await tx.financeIncomeEntry.update({
          where: { id: draftEntry.id },
          data: { journalEntryId: draftJournal.id },
        })
      }
    }

    // Payslip templates: create the linked FinancePayslip on the draft
    // so approval can run the payslip-aware posting path and the mark-
    // received dialog pre-populates from stored gross/PAYG/net figures.
    if (template.payslipEnabled) {
      await tx.financePayslip.create({
        data: {
          incomeEntryId: draftEntry.id,
          familyId: template.familyId,
          grossPay: template.grossPay ?? 0,
          netPay: template.netPay ?? 0,
          grossIncomeGlAccountId: template.grossIncomeGlAccountId,
          bankGlAccountId: template.bankGlAccountId,
          paygWithheld: template.paygWithheld ?? 0,
          paygGlAccountId: template.paygGlAccountId,
          sgcAmount: template.sgcAmount ?? 0,
          sgcGlAccountId: template.sgcGlAccountId,
          components: template.payslipComponents ?? '[]',
          deductions: template.payslipDeductions ?? '[]',
        },
      })
    }
  }
}

export async function spawnDraftsForTemplate(
  user: SessionUser,
  template: FullTemplate,
  asOf: Date,
): Promise<TemplateSpawnResult> {
  const kind: TemplateKind = template.kind === 'income' ? 'income' : 'bill'

  const result: TemplateSpawnResult = {
    templateId: template.id,
    templateName: template.name,
    kind,
    spawned: 0,
    skippedExisting: 0,
    cappedWithMoreRemaining: false,
    disabledDueToMissingGlAccount: false,
    missingGlAccountIds: [],
  }

  // ── GL-vanished check (Option B) ────────────────────────────────────────
  const lineGlIds = template.lines.map(l => l.glAccountId)
  const payslipGlIds = [
    template.grossIncomeGlAccountId,
    template.bankGlAccountId,
    template.paygGlAccountId,
    template.sgcGlAccountId,
  ].filter((v): v is string => !!v)

  const missing = await findMissingGlAccounts(template.familyId, lineGlIds, payslipGlIds)
  if (missing.length > 0) {
    // Disable the template and record why. Do NOT spawn a broken draft.
    await prisma.financeRecurringTemplate.update({
      where: { id: template.id },
      data: { enabled: false },
    })
    await createAuditLog(
      user,
      'update',
      'financeRecurringTemplate',
      template.id,
      `Auto-disabled recurring template "${template.name}" — referenced GL account(s) no longer exist`,
      {
        reason: 'missing_gl_account',
        missingGlAccountIds: missing,
        autoDisabled: true,
      },
    )
    result.disabledDueToMissingGlAccount = true
    result.missingGlAccountIds = missing
    return result
  }

  // ── Build the occurrence schedule view ──────────────────────────────────
  const occTemplate: OccurrenceTemplate = {
    frequency: template.frequency,
    interval: template.interval,
    dayOfMonth: template.dayOfMonth,
    monthOfYear: template.monthOfYear,
    startDate: template.startDate,
    endMode: template.endMode,
    endDate: template.endDate,
    totalOccurrences: template.totalOccurrences,
    occurrencesRemaining: template.occurrencesRemaining,
  }

  // The cursor: the next occurrence we have NOT yet spawned. On a fresh
  // template this is startDate (Decision A1). After spawns it's whatever
  // nextOccurrenceDate was advanced to.
  let cursorDate: Date = template.nextOccurrenceDate
  let occurrencesRemaining = template.occurrencesRemaining

  let iterations = 0

  // Catch-up loop: spawn every occurrence within the advance window (Q3),
  // capped at MAX_CATCHUP_PER_RUN. isWithinAdvanceWindow is the same shared
  // gate the receipt/payment spawn-next paths use, so no trigger can spawn
  // earlier than createInAdvanceDays before the occurrence.
  while (isWithinAdvanceWindow(cursorDate, template.createInAdvanceDays, asOf)) {
    if (iterations >= MAX_CATCHUP_PER_RUN) {
      result.cappedWithMoreRemaining = true
      break
    }

    // for_n_occurrences exhaustion check
    if (template.endMode === 'for_n_occurrences' && (occurrencesRemaining ?? 0) <= 0) {
      break
    }
    // until-date exhaustion check
    if (template.endMode === 'until' && template.endDate != null && cursorDate > template.endDate) {
      break
    }

    const occurrenceDate = cursorDate

    // ── Idempotency (Q1=a): does a draft already exist for this date? ─────
    const dayStart = calendarDayStart(occurrenceDate)
    const dayEnd = calendarDayEnd(occurrenceDate)

    let alreadyExists = false
    if (kind === 'bill') {
      // Idempotency keyed on billDate (recognition date = occurrence date), not
      // nextDueDate, because nextDueDate = occurrenceDate + defaultDueOffsetDays
      // and would fall outside the dayStart/dayEnd window when offset > 0.
      const existing = await prisma.financeRecurringBill.count({
        where: {
          templateId: template.id,
          familyId: template.familyId,
          status: { not: 'cancelled' },
          billDate: { gte: dayStart, lte: dayEnd },
        },
      })
      alreadyExists = existing > 0
    } else {
      const existing = await prisma.financeIncomeEntry.count({
        where: {
          templateId: template.id,
          familyId: template.familyId,
          status: { not: 'cancelled' },
          nextExpectedDate: { gte: dayStart, lte: dayEnd },
        },
      })
      alreadyExists = existing > 0
    }

    if (alreadyExists) {
      result.skippedExisting += 1
    } else {
      // ── Insert the draft via the shared helper, atomically ────────────
      // createOccurrenceDraft is the single source of truth for what a
      // spawned draft looks like; the income/bill PATCH spawn paths call it
      // too, so a draft spawned on receipt/payment is identical to this one.
      // It normalises the occurrence date to UTC midnight internally.
      await prisma.$transaction(async (tx) => {
        await createOccurrenceDraft(tx, template, occurrenceDate)
      })

      result.spawned += 1
    }

    // ── Advance cursor for next iteration ────────────────────────────────
    if (occurrencesRemaining != null) {
      occurrencesRemaining = occurrencesRemaining - 1
    }

    const nextDate = computeNextOccurrenceDate(
      { ...occTemplate, occurrencesRemaining },
      occurrenceDate,
    )
    if (nextDate == null) {
      // Template ended. Persist cursor at the last occurrence and bail.
      cursorDate = occurrenceDate
      break
    }
    cursorDate = nextDate
    iterations += 1
  }

  // ── Persist the advanced cursor on the template ─────────────────────────
  // lastSpawnedDate = the latest occurrence we processed (spawned or skipped).
  // nextOccurrenceDate = the next un-processed occurrence (cursorDate).
  // occurrencesRemaining = decremented count (null if not count-bounded).
  await prisma.financeRecurringTemplate.update({
    where: { id: template.id },
    data: {
      lastSpawnedDate: asOf,
      nextOccurrenceDate: cursorDate,
      occurrencesRemaining,
    },
  })

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// spawnDueDrafts
//
// Top-level entry point. Selects every enabled, active, createAutomatically
// template for the family whose nextOccurrenceDate is within the advance
// window, and runs spawnDraftsForTemplate on each. Returns an aggregate report.
//
// The cron (Block 3) calls this once per family per day. It can also be
// triggered manually (e.g. a "spawn now" button) — it's safe to run any
// number of times thanks to the idempotency contract.
//
// `asOf` defaults to now(). Tests / manual triggers can pass a fixed date.
// ─────────────────────────────────────────────────────────────────────────────

export async function spawnDueDrafts(
  user: SessionUser,
  familyId: string,
  asOf: Date = new Date(),
): Promise<SpawnReport> {
  // A template is a candidate if it is enabled, active, set to auto-create,
  // and its nextOccurrenceDate is on/before the widest possible advance
  // threshold. We over-select slightly (using the max createInAdvanceDays is
  // not known per-row in a single query) and let spawnDraftsForTemplate apply
  // the precise per-template Q3 threshold.
  //
  // Practical bound: select templates whose nextOccurrenceDate <= asOf + 366
  // days. createInAdvanceDays beyond a year is not a supported configuration;
  // the per-template loop still applies the exact threshold so this is just
  // a candidate filter, not the spawn decision.
  const candidateWindow = calendarDayEnd(addDays(asOf, 366))

  const templates = await prisma.financeRecurringTemplate.findMany({
    where: {
      familyId,
      enabled: true,
      isActive: true,
      createAutomatically: true,
      nextOccurrenceDate: { lte: candidateWindow },
    },
    include: { lines: true },
    orderBy: { nextOccurrenceDate: 'asc' },
  })

  const results: TemplateSpawnResult[] = []
  for (const template of templates) {
    // Per-template precise due check (Q3). Skip templates not yet within
    // their own advance window — the same shared gate the spawn-next paths use.
    if (!isWithinAdvanceWindow(template.nextOccurrenceDate, template.createInAdvanceDays, asOf)) {
      continue
    }
    try {
      const r = await spawnDraftsForTemplate(user, template, asOf)
      results.push(r)
    } catch (err) {
      // One bad template must not abort the whole run. Log and continue.
      console.error(
        `[spawnDueDrafts] Template ${template.id} ("${template.name}") failed:`,
        err,
      )
      results.push({
        templateId: template.id,
        templateName: template.name,
        kind: template.kind === 'income' ? 'income' : 'bill',
        spawned: 0,
        skippedExisting: 0,
        cappedWithMoreRemaining: false,
        disabledDueToMissingGlAccount: false,
        missingGlAccountIds: [],
      })
    }
  }

  return {
    familyId,
    asOf,
    templatesConsidered: templates.length,
    results,
    totalSpawned: results.reduce((s, r) => s + r.spawned, 0),
  }
}
