import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { spawnNextIncomeOnReceipt } from '@/lib/finance-draft-spawn-service'
import { ensureAccountsReceivableCategory, resolveAccountGlCategoryId } from '@/lib/finance-opening-balance'
import { nextJournalReference, nextNJournalReferences } from '@/lib/finance-journal-ref'
import { postPayslipReceiptJournal, postIncomeReceiptJournal, postIncomeAccrualJournal, upsertDraftJournal, reconcilePostedAccrualOnEdit, reverseJournalEntry, AccrualReconcileBlockedError, type ReversibleJournalEntry } from '@/lib/finance-posting'
import { deleteUnreceivedIncomeDescendants } from '@/lib/finance-descendants'
import { receiveIncomeStage1 } from '@/lib/finance-income-receive'
import { getPeriodLockWarning } from '@/lib/finance-period-lock'

const INCOME_INCLUDE = {
  account: { select: { id: true, name: true } },
  category: true,
  location: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
  entity: { select: { id: true, name: true, color: true, type: true, isDefault: true } },
  payslip: true,
  journalEntry: { select: { id: true, isPosted: true, reference: true } },
  attachments: {
    select: { id: true, incomeId: true, title: true, fileName: true, fileSize: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
}

// ── Journal lines helper ────────────────────────────────────────────────────
// Creates or replaces the accrual journal entry linked to an income entry.
// Lines: DR Accounts Receivable / CR income account(s) [+ GST Payable]
//
// Delegates to the shared upsertDraftJournal in finance-posting.ts (single
// implementation shared with bills' upsertBillDraftJournal). The accrual is
// written as an UNPOSTED draft (isPosted=false); it is promoted to posted only
// on the invoiceReceived false→true transition via receiveIncomeStage1 — the
// same trigger bills use. The balance, GL-family, posted-guard and atomic-write
// guarantees live in the shared function.

interface JournalLine {
  glAccountId: string
  side: 'debit' | 'credit'
  amount: number
  description?: string
}

async function upsertIncomeJournalEntry(
  incomeName: string,
  existingJournalEntryId: string | null | undefined,
  lines: JournalLine[],
  date: Date,
  familyId: string,
  entityId: string | null,
): Promise<string> {
  // Write the accrual as an UNPOSTED draft (isPosted=false). It carries the
  // user's intended split (incl. any GST line) and is promoted on the
  // invoiceReceived false→true transition by receiveIncomeStage1. The shared
  // upsert throws on unbalanced lines, so the draft is always balanced.
  return upsertDraftJournal({
    description: incomeName,
    existingJournalEntryId,
    lines,
    date,
    familyId,
    entityId,
    isPosted: false,
  })
}

export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const entries = await prisma.financeIncomeEntry.findMany({
    where: {
      familyId: user.familyId,
      isVoided: false,
      // Exclude draft/cancelled entries — drafts belong in the Drafts inbox;
      // cancelled drafts are audit-only and must not surface as actionable items.
      // Must use OR to preserve legacy rows where status is null (pre-template entries).
      OR: [{ status: null }, { status: { notIn: ['draft', 'cancelled'] } }],
    },
    include: INCOME_INCLUDE,
    orderBy: { nextExpectedDate: 'asc' },
  })
  return NextResponse.json(entries)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const {
    name, amount, accountId, categoryId, frequency,
    incomeType, nextExpectedDate, endDate,
    isActive, received, receivedDate,
    autoPay, emailReminder, reminderDays,
    dayOfMonth, monthOfYear, recurrenceInterval,
    invoiceReceived, invoiceReceivedDate,
    notes, memberId, locationId, entityId, vendorId,
    isTaxTracked, taxRate, taxClassification,
    showOnCalendar,
    journalLines,   // optional: JournalLine[] for double-entry accrual
    actualAmountReceived, // optional: actual net received (overrides amount for GL)
  } = json

  if (!name || !amount || !frequency) {
    return NextResponse.json({ error: 'Name, amount, and frequency are required' }, { status: 400 })
  }

  const accrualDate = new Date(nextExpectedDate ?? new Date())
  // Symmetric with bills (audit P4-A1): revenue is recognised on the
  // invoiceReceived false→true transition, NOT the moment journal lines exist.
  // shouldPostInvoice gates whether we promote the draft to a posted accrual.
  const shouldPostInvoice = invoiceReceived === true
  const invoiceDate = invoiceReceivedDate ? new Date(invoiceReceivedDate) : accrualDate

  const entry = await prisma.financeIncomeEntry.create({
    data: {
      name,
      amount: parseFloat(amount),
      accountId: accountId ?? null,
      categoryId: categoryId ?? null,
      vendorId: vendorId ?? null,
      frequency,
      incomeType: incomeType ?? 'recurring',
      nextExpectedDate: accrualDate,
      endDate: endDate ? new Date(endDate) : null,
      isActive: isActive ?? true,
      received: received ?? false,
      receivedDate: receivedDate ? new Date(receivedDate) : null,
      autoPay: autoPay ?? false,
      emailReminder: emailReminder ?? false,
      reminderDays: reminderDays != null ? parseInt(reminderDays, 10) : 3,
      dayOfMonth: dayOfMonth != null ? parseInt(dayOfMonth, 10) : null,
      monthOfYear: monthOfYear != null ? parseInt(monthOfYear, 10) : null,
      recurrenceInterval: recurrenceInterval ?? null,
      invoiceReceived: shouldPostInvoice,
      invoiceReceivedDate: shouldPostInvoice ? invoiceDate : null,
      notes: notes ?? null,
      memberId: memberId ?? null,
      locationId: locationId ?? null,
      entityId: entityId ?? null,
      isTaxTracked: isTaxTracked ?? false,
      taxRate: taxRate != null ? parseFloat(taxRate) : null,
      taxClassification: taxClassification ?? null,
      showOnCalendar: showOnCalendar ?? true,
      actualAmountReceived: actualAmountReceived != null ? parseFloat(actualAmountReceived) : null,
      familyId: user.familyId,
    },
    include: INCOME_INCLUDE,
  })

  // Materialise a custom journal split as an UNPOSTED draft (if provided). This
  // runs for BOTH draft and posted entries:
  //   - shouldPostInvoice=false: ends here, entry keeps the draft for later promotion
  //   - shouldPostInvoice=true:  draft is then promoted by receiveIncomeStage1 below
  let draftJeId: string | null = null
  if (Array.isArray(journalLines) && journalLines.length >= 2) {
    try {
      draftJeId = await upsertIncomeJournalEntry(
        entry.name,
        null,
        journalLines,
        accrualDate,
        user.familyId,
        entityId ?? null,
      )
      await prisma.financeIncomeEntry.update({
        where: { id: entry.id },
        data: { journalEntryId: draftJeId },
      })
    } catch (err) {
      // Custom lines failed validation (e.g. unbalanced or invalid GL accounts).
      // Delete the orphan entry so it doesn't sit without the journal the user
      // thought they saved, and surface 422.
      console.error('[income POST] Failed to save draft journal from custom lines:', err)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      await prisma.financeIncomeEntry.delete({ where: { id: entry.id } }).catch(() => {})
      return NextResponse.json({ error: `Failed to save journal lines: ${msg}` }, { status: 422 })
    }
  }

  // Promote to a posted accrual only when invoiceReceived=true on create — the
  // same Stage-1 sequence as PATCH/PUT, via the shared helper.
  if (shouldPostInvoice && categoryId) {
    try {
      await prisma.$transaction(async (tx) => {
        await receiveIncomeStage1(tx, {
          entry,
          remittanceDate: invoiceDate,
          userId: user.id,
          familyId: user.familyId,
          draftJournalEntryId: draftJeId,
        })
      })
    } catch (err) {
      // GL posting failed — roll back invoiceReceived so the entry stays a draft.
      console.error('[income POST] GL posting failed, reverting invoiceReceived:', err)
      await prisma.financeIncomeEntry.update({
        where: { id: entry.id },
        data: { invoiceReceived: false, invoiceReceivedDate: null },
      })
      return NextResponse.json(
        { error: 'Failed to post to General Ledger. Income saved as draft.' },
        { status: 422 }
      )
    }
  }

  return NextResponse.json(entry, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const {
    id, name, amount, accountId, categoryId, frequency,
    incomeType, nextExpectedDate, endDate,
    isActive, received, receivedDate,
    autoPay, emailReminder, reminderDays,
    dayOfMonth, monthOfYear, recurrenceInterval,
    invoiceReceived, invoiceReceivedDate,
    notes, memberId, locationId, entityId, vendorId,
    isTaxTracked, taxRate, taxClassification,
    showOnCalendar,
    journalLines,   // optional: JournalLine[] for double-entry accrual
    actualAmountReceived, // optional: actual net received
  } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeIncomeEntry.findFirst({ where: { id, familyId: user.familyId } })
  if (!existing) return NextResponse.json({ error: 'Income entry not found' }, { status: 404 })

  // ── Pre-edit GL guard (parity with bills PUT) ───────────────────────────────
  // Re-sync or reject a GL-relevant edit (category / amount / entity) on an income
  // entry whose accrual (DR AR / CR Income) is already posted, BEFORE the row update
  // so a REJECTED edit never leaves the row and GL diverged. "Reconcile if unpaid,
  // block if paid": once cash is received the AR has been cleared, so the accrual
  // cannot be safely reversed here.
  const invoiceReceivedTransition = invoiceReceived === true && !existing.invoiceReceived
  // An invoice-date change on a posted income moves GL recognition to a new
  // period — reverse the original accrual and repost on the new date (Xero/MYOB
  // behaviour), so it is GL-relevant just like category/amount/entity.
  // invoiceReceivedDate is the tax point: receiveIncomeStage1 posts the accrual
  // at remittanceDate = invoiceReceivedDate (nextExpectedDate is scheduling only).
  const incomeDateChanged =
    invoiceReceivedDate !== undefined &&
    (invoiceReceivedDate ? new Date(invoiceReceivedDate).getTime() : null) !== (existing.invoiceReceivedDate ? existing.invoiceReceivedDate.getTime() : null)
  const incomeGlFieldChanged =
    (categoryId !== undefined && (categoryId ?? null) !== existing.categoryId) ||
    (entityId !== undefined && (entityId ?? null) !== existing.entityId) ||
    (amount !== undefined && parseFloat(amount) !== existing.amount) ||
    incomeDateChanged
  const needsAccrualResync =
    incomeGlFieldChanged && existing.invoiceReceived === true && !invoiceReceivedTransition && !!existing.journalEntryId

  if (needsAccrualResync) {
    if (existing.received) {
      return NextResponse.json(
        { error: 'This income has been received. Reverse the receipt before changing its category, amount, or entity.' },
        { status: 422 },
      )
    }
    const accrualJe = await prisma.financeJournalEntry.findFirst({
      where: { id: existing.journalEntryId!, familyId: user.familyId },
      select: { isPosted: true, isReversed: true, lines: { select: { id: true } } },
    })
    if (accrualJe?.isPosted && !accrualJe.isReversed && accrualJe.lines.length !== 2) {
      return NextResponse.json(
        { error: 'This income has a custom journal split. Reverse it manually before changing its category, amount, or entity.' },
        { status: 422 },
      )
    }
  }

  const incomeUpdateData = {
      ...(name !== undefined && { name }),
      ...(amount !== undefined && { amount: parseFloat(amount) }),
      ...(accountId !== undefined && { accountId: accountId ?? null }),
      ...(categoryId !== undefined && { categoryId: categoryId ?? null }),
      ...(vendorId !== undefined && { vendorId: vendorId ?? null }),
      ...(frequency !== undefined && { frequency }),
      ...(incomeType !== undefined && { incomeType }),
      ...(nextExpectedDate !== undefined && { nextExpectedDate: new Date(nextExpectedDate) }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(isActive !== undefined && { isActive }),
      ...(received !== undefined && { received }),
      ...(receivedDate !== undefined && { receivedDate: receivedDate ? new Date(receivedDate) : null }),
      ...(autoPay !== undefined && { autoPay }),
      ...(emailReminder !== undefined && { emailReminder }),
      ...(reminderDays !== undefined && { reminderDays: parseInt(reminderDays, 10) }),
      ...(dayOfMonth !== undefined && { dayOfMonth: dayOfMonth != null ? parseInt(dayOfMonth, 10) : null }),
      ...(monthOfYear !== undefined && { monthOfYear: monthOfYear != null ? parseInt(monthOfYear, 10) : null }),
      ...(recurrenceInterval !== undefined && { recurrenceInterval: recurrenceInterval ?? null }),
      // On a false→true transition the flags are set ATOMICALLY with the GL
      // write in Step 2 below — never here, ahead of the journal (parity with bills).
      ...(invoiceReceived !== undefined && !invoiceReceivedTransition && { invoiceReceived }),
      ...(invoiceReceivedDate !== undefined && !invoiceReceivedTransition && { invoiceReceivedDate: invoiceReceivedDate ? new Date(invoiceReceivedDate) : null }),
      ...(notes !== undefined && { notes: notes ?? null }),
      ...(memberId !== undefined && { memberId: memberId ?? null }),
      ...(locationId !== undefined && { locationId: locationId ?? null }),
      ...(entityId !== undefined && { entityId: entityId ?? null }),
      ...(isTaxTracked !== undefined && { isTaxTracked }),
      ...(taxRate !== undefined && { taxRate: taxRate != null ? parseFloat(taxRate) : null }),
      ...(taxClassification !== undefined && { taxClassification: taxClassification ?? null }),
      ...(showOnCalendar !== undefined && { showOnCalendar }),
      ...(actualAmountReceived !== undefined && { actualAmountReceived: actualAmountReceived != null ? parseFloat(actualAmountReceived) : null }),
  }

  // FC-12-02 (mirror of bills): reconcile the posted accrual ATOMICALLY with the
  // row update so a rolled-back reconcile leaves the row unchanged — otherwise the
  // row/GL diverge and the param-vs-row retry-detection skips the resync forever.
  const reconcileCategoryId = categoryId !== undefined ? (categoryId ?? null) : existing.categoryId
  const doAtomicResync = needsAccrualResync && !!reconcileCategoryId && !!existing.journalEntryId

  let entry
  if (doAtomicResync) {
    try {
      entry = await prisma.$transaction(async (tx) => {
        const { newJournalEntryId } = await reconcilePostedAccrualOnEdit({
          kind: 'income',
          familyId: user.familyId,
          journalEntryId: existing.journalEntryId!,
          description: name ?? existing.name,
          amount: amount !== undefined ? parseFloat(amount) : existing.amount,
          glAccountId: reconcileCategoryId!,
          entityId: entityId !== undefined ? (entityId ?? null) : existing.entityId,
          invoiceTxId: existing.invoiceTxId ?? null,
          // An invoice-date change moves recognition to a new period: reverse in
          // the original period, repost the fresh accrual on the new date
          // (mirror of bills' billDateChanged). Unchanged date → null → period-
          // neutral swap (category/amount/entity edits).
          newDate: incomeDateChanged ? (invoiceReceivedDate ? new Date(invoiceReceivedDate) : existing.invoiceReceivedDate) : null,
        }, tx)
        return tx.financeIncomeEntry.update({
          where: { id },
          data: {
            ...incomeUpdateData,
            ...(newJournalEntryId !== existing.journalEntryId && { journalEntryId: newJournalEntryId }),
          },
          include: INCOME_INCLUDE,
        })
      })
    } catch (err) {
      if (err instanceof AccrualReconcileBlockedError) {
        return NextResponse.json({ error: err.message }, { status: 422 })
      }
      console.error('[income PUT] Failed to reconcile posted accrual on edit:', err)
      return NextResponse.json(
        { error: 'Failed to update the General Ledger for this edit. The income and GL were left unchanged; please retry.' },
        { status: 422 },
      )
    }
  } else {
    entry = await prisma.financeIncomeEntry.update({
      where: { id },
      data: incomeUpdateData,
      include: INCOME_INCLUDE,
    })
  }

  // If invoiceReceived is transitioning false->true, post the GL accrual journal
  // (invoiceReceivedTransition computed in the pre-edit GL guard above).
  const hasCustomLines = Array.isArray(journalLines) && journalLines.length >= 2

  // Step 1: refresh the draft journal from custom lines if provided.
  // GL-FIRST: write the user's split as a balanced UNPOSTED draft FIRST so any
  // subsequent posting step promotes it as-is rather than falling back to a
  // hardcoded 2-line auto entry. Skipped when the entry is already received —
  // a posted journal is locked and must not be silently overwritten on save.
  let workingJeId: string | null = existing.journalEntryId ?? null
  if (hasCustomLines && !existing.invoiceReceived) {
    try {
      const accrualDate = nextExpectedDate ? new Date(nextExpectedDate) : existing.nextExpectedDate
      workingJeId = await upsertIncomeJournalEntry(
        name ?? existing.name,
        workingJeId,
        journalLines,
        accrualDate,
        user.familyId,
        entityId !== undefined ? (entityId ?? null) : existing.entityId,
      )
      if (workingJeId !== (existing.journalEntryId ?? null)) {
        await prisma.financeIncomeEntry.update({
          where: { id: entry.id },
          data: { journalEntryId: workingJeId },
        })
      }
    } catch (err) {
      // Unbalanced or invalid lines. Surface as 422; other field updates are
      // already saved, the journal is not modified.
      console.error('[income PUT] Failed to upsert draft journal:', err)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ error: `Failed to save journal lines: ${msg}` }, { status: 422 })
    }
  }

  // Step 2: promote to posted on a false->true transition via the shared Stage-1
  // helper — accrual (promoting the just-written draft via workingJeId, preserving
  // any custom split) → remittance transaction → income flags, all in ONE
  // $transaction. On failure the row stays un-received and the user gets a 422.
  if (invoiceReceivedTransition) {
    const effectiveCategoryId = categoryId !== undefined ? (categoryId ?? null) : existing.categoryId
    if (!effectiveCategoryId) {
      return NextResponse.json(
        { error: 'Income must have a category before posting' },
        { status: 422 },
      )
    }
    try {
      await prisma.$transaction(async (tx) => {
        await receiveIncomeStage1(tx, {
          entry,
          remittanceDate: invoiceReceivedDate ? new Date(invoiceReceivedDate) : new Date(),
          userId: user.id,
          familyId: user.familyId,
          draftJournalEntryId: workingJeId,
        })
      })
    } catch (err) {
      console.error('[income PUT] ATOMIC invoice posting failed:', err)
      return NextResponse.json(
        { error: 'Failed to post income to General Ledger. The income remains un-received; please retry.' },
        { status: 422 },
      )
    }
  }

  // FC-12-02: the posted-accrual reconcile now runs ATOMICALLY with the row update
  // in the doAtomicResync branch above (mirrors bills) — no separate post-update
  // reconcile pass here, which previously left the row/GL divergent on failure.

  // Re-fetch so the response reflects Step 1/2 updates (journalEntryId, the
  // atomically-set invoiceReceived flags) rather than the stale row-update object.
  const finalEntry = await prisma.financeIncomeEntry.findFirst({
    where: { id, familyId: user.familyId },
    include: INCOME_INCLUDE,
  })
  return NextResponse.json(finalEntry ?? entry)
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeIncomeEntry.findFirst({ where: { id, familyId: user.familyId } })
  if (!existing) return NextResponse.json({ error: 'Income entry not found' }, { status: 404 })

  // Pre-fetch all journals that need reversing OUTSIDE the transaction so
  // nextJournalReference sees committed DB state, then generate N sequential
  // refs in one shot before the atomic operation.
  const jeIds = [
    (existing as any).journalEntryId,
    (existing as any).receiptJournalEntryId,
  ].filter(Boolean) as string[]

  type JeReversal = {
    journalId: string
    entityId: string | null
    refLabel: string | null
    description: string | null
    lines: { glAccountId: string; side: string; amount: number; description: string | null; memberId: string | null }[]
  }
  const jeReversals: JeReversal[] = []
  // Unposted draft journals never hit the GL — they can't be reversed (nothing to
  // reverse), so they must be hard-deleted with the entry, else they orphan.
  const draftJeIdsToDelete: string[] = []
  for (const jeId of jeIds) {
    const je = await prisma.financeJournalEntry.findFirst({
      where: { id: jeId, familyId: user.familyId },
      include: { lines: true },
    })
    if (je?.isPosted && !je.isReversed) {
      jeReversals.push({
        journalId: je.id,
        entityId: je.entityId,
        refLabel: je.reference,
        description: je.description,
        lines: je.lines,
      })
    } else if (je && !je.isPosted) {
      draftJeIdsToDelete.push(je.id)
    }
  }

  // Generate all reversal refs in one shot (sequential increment from MAX)
  const reversalRefs = await nextNJournalReferences(user.familyId, jeReversals.length)

  // Collect all transaction IDs to delete
  const txIdsToDelete = [
    existing.invoiceTxId,
    existing.receiptTxId,
    existing.transactionId,
  ].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i)

  // Atomic: reverse all GL journals, delete transactions, and delete the income entry together
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < jeReversals.length; i++) {
      const reversal = jeReversals[i]
      await reverseJournalEntry(tx, {
        id: reversal.journalId,
        reference: reversal.refLabel,
        description: reversal.description,
        entityId: reversal.entityId,
        lines: reversal.lines,
      }, { reference: reversalRefs[i], date: new Date(), familyId: user.familyId })
    }
    if (txIdsToDelete.length > 0) {
      await tx.financeTransaction.deleteMany({ where: { id: { in: txIdsToDelete }, familyId: user.familyId } })
    }
    await tx.financeIncomeEntry.delete({ where: { id } })
    // Entry is gone — now safe to remove its stranded unposted draft journals
    // (lines cascade via FinanceJournalLine.journalEntryId onDelete: Cascade).
    if (draftJeIdsToDelete.length > 0) {
      await tx.financeJournalEntry.deleteMany({ where: { id: { in: draftJeIdsToDelete }, familyId: user.familyId } })
    }
  })
  return NextResponse.json({ success: true })
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { id, received, receivedDate: receivedDateRaw, invoiceReceived, invoiceReceivedDate, receiveToAccountId, void: doVoid, voidNote, actualAmountReceived: actualAmountReceivedRaw, payslip: payslipData } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeIncomeEntry.findFirst({ where: { id, familyId: user.familyId } })
  if (!existing) return NextResponse.json({ error: 'Income entry not found' }, { status: 404 })

  // ══════════════════════════════════════════════════════════════════════════
  // VOID: soft delete — reverse all GL journals, keep records for audit trail
  // ══════════════════════════════════════════════════════════════════════════
  if (doVoid === true && !existing.isVoided) {
    const jeIds = [
      existing.journalEntryId,
      (existing as any).receiptJournalEntryId,
    ].filter(Boolean) as string[]

    type JeReversal = {
      journalId: string
      entityId: string | null
      refLabel: string | null
      description: string | null
      lines: { glAccountId: string; side: string; amount: number; description: string | null; memberId: string | null }[]
    }
    const jeReversals: JeReversal[] = []
    for (const jeId of jeIds) {
      const je = await prisma.financeJournalEntry.findFirst({
        where: { id: jeId, familyId: user.familyId },
        include: { lines: true },
      })
      if (je?.isPosted && !je.isReversed) {
        jeReversals.push({ journalId: je.id, entityId: je.entityId, refLabel: je.reference, description: je.description, lines: je.lines })
      }
    }

    const reversalRefs = await nextNJournalReferences(user.familyId, jeReversals.length)

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < jeReversals.length; i++) {
        const reversal = jeReversals[i]
        await reverseJournalEntry(tx, {
          id: reversal.journalId,
          reference: reversal.refLabel,
          description: reversal.description,
          entityId: reversal.entityId,
          lines: reversal.lines,
        }, { reference: reversalRefs[i], date: new Date(), familyId: user.familyId })
      }
      await tx.financeIncomeEntry.update({
        where: { id },
        data: { isVoided: true, voidedAt: new Date(), voidNote: voidNote ?? null },
      })
      // Voiding a parent retires its future no-GL drafts too — otherwise the
      // spawned-but-unreceived successors live on as actionable entries (P4-FC-02).
      await deleteUnreceivedIncomeDescendants(id, user.familyId, tx)
    })

    return NextResponse.json({ success: true, voided: true })
  }

  // ── F2: payslip income must never post a Stage-1 accrual ──────────────────
  // A payslip receipt posts a self-balancing multi-line journal (DR Bank net +
  // DR PAYG + DR deductions / CR Gross income) with NO Accounts Receivable
  // line, so a Stage-1 DR AR / CR Income accrual would double-count income on
  // the P&L and strand AR forever (nothing ever clears it). Reject before any
  // row update so the entry is never flagged invoiceReceived without GL.
  // Mirrors approveIncomeDraft, where payslip drafts post nothing at approval.
  if (invoiceReceived === true && !existing.invoiceReceived) {
    const payslip = await prisma.financePayslip.findFirst({
      where: { incomeEntryId: id, familyId: user.familyId },
      select: { id: true },
    })
    if (payslip) {
      return NextResponse.json(
        { error: 'Payslip income posts at receipt — invoice-received accrual is not applicable. Mark the payslip as received instead.' },
        { status: 422 },
      )
    }
  }

  const updateData: Record<string, any> = {}

  if (received !== undefined) {
    const stampDate = receivedDateRaw ? new Date(receivedDateRaw) : new Date()
    // Stage 2 transition (false→true) is handled atomically in the GL block below.
    // Only apply here for: undo (true→false), or no-op (already received).
    if (!(received === true && !existing.received)) {
      updateData.received = received
      updateData.receivedDate = received ? stampDate : null
    }
  }

  if (invoiceReceived !== undefined) {
    updateData.invoiceReceived = invoiceReceived
    updateData.invoiceReceivedDate = invoiceReceived
      ? (invoiceReceivedDate ? new Date(invoiceReceivedDate) : new Date())
      : null
  }

  // ── Undo remittance: reverse accrual (+ receipt) GL journals ATOMICALLY ────
  //
  // WI-3 / P8-FC-01 + P8-FC-02. This block was non-atomic (loose prisma.* ops)
  // and — when the entry was ALSO received — reversed only the accrual, stranding
  // the receipt JE (DR Bank / CR AR): AR went negative and Bank stayed debited
  // with phantom cash. Mirror bills' undo-invoice: pre-fetch journals + generate
  // all reversal refs OUTSIDE the tx (nextJournalReference reads committed state,
  // so calls inside a $transaction would all return the same number), then run a
  // single atomic transaction passing `tx` to reverseJournalEntry.
  if (invoiceReceived === false && existing.invoiceReceived === true) {
    const accrualJeId: string | null = existing.journalEntryId ?? null
    const accrualJe = accrualJeId
      ? await prisma.financeJournalEntry.findFirst({
          where: { id: accrualJeId, familyId: user.familyId },
          include: { lines: true },
        })
      : null
    const needsAccrualReversal = accrualJe?.isPosted === true && !accrualJe.isReversed

    // When the entry was also received, the receipt JE must be reversed too.
    const alsoReceived = !!existing.received
    const receiptJeId: string | null = alsoReceived
      ? ((existing as any).receiptJournalEntryId ?? null)
      : null
    const receiptJe = receiptJeId
      ? await prisma.financeJournalEntry.findFirst({
          where: { id: receiptJeId, familyId: user.familyId },
          include: { lines: true },
        })
      : null
    const needsReceiptReversal = receiptJe?.isPosted === true && !receiptJe.isReversed

    const totalRefs = (needsAccrualReversal ? 1 : 0) + (needsReceiptReversal ? 1 : 0)
    const allRefs = await nextNJournalReferences(user.familyId, totalRefs)
    let refIdx = 0
    const accrualRef = needsAccrualReversal ? allRefs[refIdx++] : null
    const receiptRef = needsReceiptReversal ? allRefs[refIdx++] : null

    await prisma.$transaction(async (tx) => {
      // Delete the stage-1 invoice transaction
      const invoiceTxId: string | null = existing.invoiceTxId ?? null
      if (invoiceTxId) {
        await tx.financeTransaction.deleteMany({ where: { id: invoiceTxId, familyId: user.familyId } })
        updateData.invoiceTxId = null
        if (existing.transactionId === invoiceTxId) updateData.transactionId = null
      }
      // Reverse the accrual (DR AR / CR Income → flip); draft = zero GL, delete it.
      if (accrualJe && needsAccrualReversal && accrualRef) {
        await reverseJournalEntry(tx, accrualJe, { reference: accrualRef, date: new Date(), familyId: user.familyId })
      } else if (accrualJe && !accrualJe.isPosted) {
        await tx.financeJournalEntry.delete({ where: { id: accrualJe.id } })
      }
      if (accrualJeId) updateData.journalEntryId = null

      // Undo received too if it was set — reverse the receipt JE (P8-FC-01).
      if (alsoReceived) {
        const receiptTxId: string | null = existing.receiptTxId ?? null
        if (receiptTxId) {
          await tx.financeTransaction.deleteMany({ where: { id: receiptTxId, familyId: user.familyId } })
          updateData.receiptTxId = null
          if (existing.transactionId === receiptTxId) updateData.transactionId = null
        }
        if (receiptJe && needsReceiptReversal && receiptRef) {
          await reverseJournalEntry(tx, receiptJe, { reference: receiptRef, date: new Date(), familyId: user.familyId })
        } else if (receiptJe && !receiptJe.isPosted) {
          await tx.financeJournalEntry.delete({ where: { id: receiptJe.id } })
        }
        if (receiptJeId) updateData.receiptJournalEntryId = null
        updateData.received = false
        updateData.receivedDate = null
        await deleteUnreceivedIncomeDescendants(id, user.familyId, tx)
      }

      await tx.financeIncomeEntry.update({ where: { id }, data: updateData })
    })

    const undoEntry = await prisma.financeIncomeEntry.findFirst({
      where: { id, familyId: user.familyId },
      include: INCOME_INCLUDE,
    })
    return NextResponse.json(undoEntry)
  }

  // ── Undo received: reverse stage-2 receipt GL journal ATOMICALLY ───────────
  //
  // WI-3 / P8-FC-02. Was non-atomic (loose prisma.* ops, prisma passed to
  // reverseJournalEntry). The accrual is correctly left open (income is still
  // recognised, just not yet received). Pre-generate the single reversal ref
  // outside the tx, then run one atomic transaction.
  if (received === false && existing.received === true) {
    const receiptJeId: string | null = (existing as any).receiptJournalEntryId ?? null
    const receiptJe = receiptJeId
      ? await prisma.financeJournalEntry.findFirst({
          where: { id: receiptJeId, familyId: user.familyId },
          include: { lines: true },
        })
      : null
    const needsReceiptReversal = receiptJe?.isPosted === true && !receiptJe.isReversed
    const receiptRef = needsReceiptReversal ? await nextJournalReference(user.familyId) : null

    await prisma.$transaction(async (tx) => {
      const receiptTxId: string | null = existing.receiptTxId ?? null
      if (receiptTxId) {
        await tx.financeTransaction.deleteMany({ where: { id: receiptTxId, familyId: user.familyId } })
        updateData.receiptTxId = null
        if (existing.transactionId === receiptTxId) updateData.transactionId = null
      } else if (existing.transactionId) {
        // Legacy: older records stored receipt in transactionId directly
        await tx.financeTransaction.deleteMany({ where: { id: existing.transactionId, familyId: user.familyId } })
        updateData.transactionId = null
      }
      // Reverse the receipt GL journal (do NOT delete — preserve audit trail per R4)
      if (receiptJe && needsReceiptReversal && receiptRef) {
        await reverseJournalEntry(tx, receiptJe, { reference: receiptRef, date: new Date(), familyId: user.familyId })
      } else if (receiptJe && !receiptJe.isPosted) {
        await tx.financeJournalEntry.delete({ where: { id: receiptJe.id } })
      }
      if (receiptJeId) updateData.receiptJournalEntryId = null
      // Re-open stage-1 remittance tx (income still recognised, just not yet received)
      const invoiceTxId: string | null = existing.invoiceTxId ?? null
      if (invoiceTxId) {
        await tx.financeTransaction.updateMany({
          where: { id: invoiceTxId, familyId: user.familyId },
          data: { isCleared: false, reconciledDate: null },
        })
      }
      await deleteUnreceivedIncomeDescendants(id, user.familyId, tx)

      await tx.financeIncomeEntry.update({ where: { id }, data: updateData })
    })

    const undoEntry = await prisma.financeIncomeEntry.findFirst({
      where: { id, familyId: user.familyId },
      include: INCOME_INCLUDE,
    })
    return NextResponse.json(undoEntry)
  }

  // Apply status field updates
  const entry = await prisma.financeIncomeEntry.update({
    where: { id },
    data: updateData,
    include: INCOME_INCLUDE,
  })

  // ── Stage 1: Remittance received → ATOMIC GL WRITE (DR AR / CR Income) ──
  //
  // Accounting (accrual, Xero-standard): income is recognised when the
  // invoice/remittance is received, not when cash arrives.
  //   DR  Accounts Receivable    $amount   (asset — money owed to us)
  //   CR  Income Category        $amount   (income on P&L from this date)
  //
  // The status update and GL write are ATOMIC — both succeed or both fail.
  // Income now appears in the Trial Balance as soon as this fires.
  if (invoiceReceived === true && !existing.invoiceReceived) {
    if (!existing.categoryId) {
      return NextResponse.json({ error: 'Income entry must have a category before posting' }, { status: 400 })
    }
    const remittanceDate = invoiceReceivedDate ? new Date(invoiceReceivedDate) : new Date()
    try {
      await prisma.$transaction(async (tx) => {
        // Stage-1 accrual + remittance transaction + atomic flag update via the
        // shared helper (AGENTS.md Finance rule 1 — no inline GL posting; mirror
        // of bills' receiveBillStage1). It promotes the linked balanced draft
        // (preserving any GST split) or posts a fresh DR AR / CR Income entry,
        // re-using an already-posted journal rather than duplicating it.
        await receiveIncomeStage1(tx, {
          entry: existing,
          remittanceDate,
          userId: user.id,
          familyId: user.familyId,
        })
      })
    } catch (err) {
      console.error('[income PATCH] ATOMIC remittance posting failed:', err)
      return NextResponse.json(
        { error: 'Failed to post income to General Ledger. No changes were saved.' },
        { status: 422 }
      )
    }
  }

  // ── Stage 2: Cash received → ATOMIC GL write ─────────────────────────────
  //
  // Two modes depending on whether a payslip breakdown was supplied:
  //
  // MODE A — Payslip mode (wages with variable pay):
  //   The payslip supplies grossPay, paygWithheld, deductions[], netPay and
  //   the user-selected GL accounts for each component. We build a multi-line
  //   balanced journal directly from those fields:
  //     DR  bankGlAccountId          netPay         (take-home hits bank)
  //     DR  paygGlAccountId          paygWithheld   (PAYG withheld)
  //     DR  deduction[n].glAccountId deduction.amount (per-line deductions)
  //     CR  grossIncomeGlAccountId   grossPay       (gross on P&L / income)
  //   The FinancePayslip record is also created/upserted.
  //
  // MODE B — Simple mode (existing 2-line path):
  //   DR  Bank GL account        actualAmount   (net received)
  //   CR  Accounts Receivable    actualAmount   (AR cleared)
  //   Uses actualAmountReceived if supplied, otherwise entry.amount.
  //
  // In both modes the next-occurrence spawn ALWAYS uses entry.amount (the
  // template/expected amount) so forecasting remains stable.
  if (received === true && !existing.received) {
    // P5-FC-01: the MODE A (payslip) vs MODE B (simple) branch below is decided
    // solely by whether `payslipData` was sent in the request body. But whether
    // this entry IS a payslip is a property of the stored FinancePayslip record
    // (written at draft-spawn and refreshed at each receipt), not of the request.
    // A payslip receipt that omits the breakdown would silently fall into MODE B:
    // it recognises the amount as simple income with no PAYG/SGC decomposition,
    // never debits PAYG Withheld Receivable, and leaves the stored record stale —
    // yet it balances (DR=CR), so no TB/integrity check catches it. Reject so the
    // caller must supply the breakdown (the shipped mark-received dialog always
    // does). Mirrors the F2 guard on the invoiceReceived transition above, which
    // also keys off the stored record rather than the body.
    if (!payslipData) {
      const storedPayslip = await prisma.financePayslip.findFirst({
        where: { incomeEntryId: id, familyId: user.familyId },
        select: { id: true },
      })
      if (storedPayslip) {
        return NextResponse.json(
          { error: 'This is a payslip income — the receipt must include the payslip breakdown (gross, PAYG, deductions, net). Mark it received from the payslip dialog.' },
          { status: 422 },
        )
      }
    }

    const actualReceivedDate = receivedDateRaw ? new Date(receivedDateRaw) : new Date()
    const receiptAccountId = receiveToAccountId ?? existing.accountId
    // The bank cash side (DR Bank) is resolved from the chosen FinanceAccount's
    // bound 1:1 GL category (Xero bank=GL model) — never a raw GL category — so a
    // receipt can never land on a category no displayed account reads from. Both
    // MODE A (payslip take-home) and MODE B (simple receipt) resolve into this in
    // their respective branches below, so it stays null here.
    let receiptGlAccountId: string | null = null

    // The actual amount to post to GL — actual overrides template for this occurrence.
    // F10: in payslip mode the cash that hits the bank is netPay (the GL bank
    // debit), never the template/gross amount — force it server-side so the
    // cash-basis transaction layer cannot diverge from the GL.
    const actualAmount: number = payslipData
      ? payslipData.netPay
      : actualAmountReceivedRaw != null
        ? parseFloat(actualAmountReceivedRaw)
        : (existing.amount)

    // Re-read to get latest invoiceTxId (may have just been written above in Stage 1)
    const freshEntry = await prisma.financeIncomeEntry.findFirst({
      where: { id, familyId: user.familyId },
    })
    const invoiceTxId: string | null = freshEntry?.invoiceTxId ?? null

    // ── Validate payslip GL accounts when payslip mode ──────────────────────
    if (payslipData) {
      const { grossIncomeGlAccountId, paygGlAccountId, sgcAmount = 0, sgcGlAccountId, sgcIncomeGlAccountId, deductions = [], netPay } = payslipData
      // F10: netPay is forced into actualAmount above, so it must be a valid number
      if (typeof netPay !== 'number' || !Number.isFinite(netPay) || netPay < 0) {
        return NextResponse.json(
          { error: 'Payslip mode requires a numeric net pay.' },
          { status: 400 }
        )
      }
      if (!grossIncomeGlAccountId) {
        return NextResponse.json(
          { error: 'Payslip mode requires a Gross Income GL account (e.g. Gross Wages).' },
          { status: 400 }
        )
      }
      // Take-home cash side: bind to the selected FinanceAccount's GL category
      // (Xero bank=GL), exactly like MODE B and bills/manual transactions, so the
      // net pay that hits "bank" lands on a GL category a displayed account reads
      // from. A raw bank GL category is no longer accepted.
      if (!receiptAccountId) {
        return NextResponse.json(
          { error: 'A bank account is required to record this payslip receipt.' },
          { status: 400 }
        )
      }
      const resolvedPayslipBankGl = await resolveAccountGlCategoryId(receiptAccountId, user.familyId)
      if (!resolvedPayslipBankGl) {
        return NextResponse.json(
          { error: 'Selected account not found. Cannot post receipt.' },
          { status: 422 }
        )
      }
      receiptGlAccountId = resolvedPayslipBankGl
      // SGC posts a self-balancing DR Accrued SGC / CR SGC Income pair, so both
      // GL accounts are required when sgcAmount > 0 (postPayslipReceiptJournal
      // throws otherwise — see QA.md §2.3). Validate up front for a clean 400
      // rather than a late failure inside the posting transaction.
      if (sgcAmount > 0 && (!sgcGlAccountId || !sgcIncomeGlAccountId)) {
        return NextResponse.json(
          { error: 'SGC amount is positive but the Accrued SGC and/or SGC Income GL account is not set.' },
          { status: 400 }
        )
      }
      // Validate all GL IDs referenced in the payslip belong to this family
      const glIds = [
        grossIncomeGlAccountId,
        paygGlAccountId,
        sgcGlAccountId,
        sgcIncomeGlAccountId,
        ...(deductions as { glAccountId?: string }[]).map(d => d.glAccountId),
      ].filter((v): v is string => !!v)
      const payslipAccounts = await prisma.financeCategory.findMany({
        where: { id: { in: [...new Set(glIds)] }, familyId: user.familyId },
        select: { id: true, type: true, isTaxPayment: true, memberId: true },
      })
      if (payslipAccounts.length < new Set(glIds).size) {
        return NextResponse.json(
          { error: 'One or more payslip GL accounts not found.' },
          { status: 400 }
        )
      }
      // P5-FC-03 (soft, non-blocking): the Tax Report buckets PAYG solely by the
      // line account's isTaxPayment flag and attributes wages by the gross account's
      // memberId. A mis-flagged account still posts a balanced journal (DR=CR) but
      // silently skews the per-person Tax Report (PAYG omitted / wages split jointly).
      // Account tax-config is the user's call, so warn rather than block. Mirrors the
      // inline warnings on the template GL pickers (TemplateFormDialog).
      const paygAcct = paygGlAccountId ? payslipAccounts.find(a => a.id === paygGlAccountId) : null
      if (paygAcct && !paygAcct.isTaxPayment) {
        console.warn(`[income PATCH] payslip ${id}: PAYG GL account ${paygGlAccountId} is not flagged isTaxPayment — Tax Report will omit this withholding.`)
      }
      // PAYG Withheld is a current-asset receivable (DR) — reclaimed at tax-return
      // time — so its GL account should be type='asset' (audit 2026-06-19, #6).
      // Account config is the user's call, so warn rather than block (mirrors the
      // isTaxPayment/memberId soft-warnings above).
      if (paygAcct && paygAcct.type !== 'asset') {
        console.warn(`[income PATCH] payslip ${id}: PAYG GL account ${paygGlAccountId} is type '${paygAcct.type}', not 'asset' — PAYG Withheld should be a current-asset (DR) receivable; the balance sheet will mispresent the withheld tax.`)
      }
      const grossAcct = payslipAccounts.find(a => a.id === grossIncomeGlAccountId)
      if (grossAcct && !grossAcct.memberId) {
        console.warn(`[income PATCH] payslip ${id}: gross income GL account ${grossIncomeGlAccountId} has no memberId — Tax Report will split these wages jointly.`)
      }
    } else {
      // ── MODE B: resolve the bank cash side from the selected FinanceAccount ──
      // The receipt must credit AR and debit the bound GL category of a real
      // account, so the displayed bank balance moves and reconciles by
      // construction. A bare GL category is no longer accepted.
      if (!receiptAccountId) {
        return NextResponse.json(
          { error: 'A bank account is required to record this receipt.' },
          { status: 400 }
        )
      }
      const resolvedBankGl = await resolveAccountGlCategoryId(receiptAccountId, user.familyId)
      if (!resolvedBankGl) {
        return NextResponse.json(
          { error: 'Selected account not found. Cannot post receipt.' },
          { status: 422 }
        )
      }
      receiptGlAccountId = resolvedBankGl
    }

    // WI-2 (P4-FC-01): an income entry can carry a POSTED, un-reversed accrual
    // (DR AR / CR Income) while invoiceReceived is still false. Since the P4-A1
    // symmetry fix, POST/PUT no longer create this state — the draft stays
    // unposted until the invoiceReceived false→true transition, exactly like
    // bills — but LEGACY rows posted under the old force-post behaviour can still
    // be in it. Keying auto-Stage-1 off the flag alone would then post a SECOND
    // accrual here, double-counting income and stranding the first accrual's AR.
    // Detect the existing posted accrual (read outside the tx, like
    // payslipAccrualToReverse below) and treat Stage-1 as already done: the
    // receipt reuses it (accrualJournalId stays freshEntry.journalEntryId) and
    // MODE B's BUG B check clears AR by exactly its open balance. Mirrors the
    // Stage-1 reuse guard in receiveIncomeStage1 (alreadyPosted branch).
    let existingPostedAccrual = false
    if (freshEntry?.journalEntryId) {
      const linkedJe = await prisma.financeJournalEntry.findFirst({
        where: { id: freshEntry.journalEntryId, familyId: user.familyId },
        select: { isPosted: true, isReversed: true },
      })
      existingPostedAccrual = !!linkedJe?.isPosted && !linkedJe.isReversed
    }

    // BUG A: payslip MODE A posts a self-balancing multi-line journal with NO AR
    // line. Auto-posting a Stage-1 DR AR / CR Income accrual first would strand AR
    // and double-count income, so payslip receipts must never trigger auto-Stage-1.
    const needsAutoStage1 = !freshEntry?.invoiceReceived && !payslipData && !existingPostedAccrual

    // F2 defence-in-depth: Stage 1 is now rejected (422) for payslip entries,
    // but a posted un-reversed accrual can still exist on legacy rows. The
    // payslip receipt journal carries no AR line, so leaving that accrual in
    // place strands AR and double-counts income — reverse it inside the
    // receipt transaction (reversal, not delete, preserves the audit trail).
    let payslipAccrualToReverse: ReversibleJournalEntry | null = null
    if (payslipData && freshEntry?.journalEntryId) {
      const staleAccrual = await prisma.financeJournalEntry.findFirst({
        where: { id: freshEntry.journalEntryId, familyId: user.familyId },
        include: { lines: true },
      })
      if (staleAccrual?.isPosted && !staleAccrual.isReversed) {
        payslipAccrualToReverse = staleAccrual
      }
    }

    // Pre-generate journal references outside the transaction so sequential
    // increments work correctly: inside $transaction uncommitted writes are
    // invisible, so two nextJournalReference calls would return the same JE-N
    // and collide on @@unique([familyId, reference]) → P2002 → 422.
    // needsAutoStage1 and payslipAccrualToReverse are mutually exclusive
    // (the former requires !payslipData, the latter requires payslipData).
    const preRefs = await nextNJournalReferences(
      user.familyId,
      needsAutoStage1 || payslipAccrualToReverse ? 2 : 1,
    )
    const accrualRef  = needsAutoStage1 ? preRefs[0] : null
    const reversalRef = payslipAccrualToReverse ? preRefs[0] : null
    const receiptRef  = preRefs[preRefs.length - 1]

    try {
      await prisma.$transaction(async (tx) => {
        const arCategoryId = await ensureAccountsReceivableCategory(user.familyId)

        // Track the accrual journal that holds the open AR for this income, so
        // the MODE B receipt can verify it clears AR by exactly the open balance
        // (BUG B). For a pre-existing Stage 1 this is the entry's journalEntryId;
        // when we auto-post Stage 1 below it is the freshly-created accrual.
        let accrualJournalId: string | null = freshEntry?.journalEntryId ?? null

        // ── Auto-post Stage 1 accrual if not yet done ──────────────────────
        if (needsAutoStage1) {
          if (!existing.categoryId) {
            throw new Error('Income entry must have an income category before cash can be posted to GL')
          }
          // Fresh DR AR / CR Income via the shared helper (AGENTS.md Finance
          // rule 1 — no inline GL posting). draftJournalEntryId is null: this
          // path always posts at actualAmount (which may override the template
          // amount), so a draft must not be promoted in its place. The reference
          // is pre-allocated (accrualRef) so it cannot collide with the receipt
          // journal created later in this same transaction.
          const accrual = await postIncomeAccrualJournal(tx, {
            familyId: user.familyId,
            description: existing.name,
            amount: actualAmount,
            incomeGlAccountId: existing.categoryId,
            entityId: existing.entityId ?? null,
            date: actualReceivedDate,
            draftJournalEntryId: null,
            reference: accrualRef!,
          })
          await tx.financeIncomeEntry.update({
            where: { id },
            data: { invoiceReceived: true, invoiceReceivedDate: actualReceivedDate, journalEntryId: accrual.journalEntryId },
          })
          accrualJournalId = accrual.journalEntryId
        }

        // ── MODE A: Payslip multi-line journal ─────────────────────────────
        let receiptJe: { id: string }
        if (payslipData) {
          const {
            grossPay, netPay, grossIncomeGlAccountId,
            paygWithheld = 0, paygGlAccountId,
            sgcAmount = 0, sgcGlAccountId, sgcIncomeGlAccountId,
            components = [], deductions = [],
            payPeriodStart, payPeriodEnd, notes: payslipNotes,
          } = payslipData

          // F2: reverse a stale Stage-1 accrual on a legacy payslip entry before
          // posting the receipt — the payslip journal has no AR line, so the
          // accrual's DR AR / CR Income would otherwise stay on the books.
          if (payslipAccrualToReverse) {
            await reverseJournalEntry(tx, payslipAccrualToReverse, {
              reference: reversalRef!,
              date: actualReceivedDate,
              familyId: user.familyId,
              description: `Reversal of payslip accrual: ${existing.name}`,
            })
          }

          const payslipResult = await postPayslipReceiptJournal(tx, {
            familyId: user.familyId,
            description: existing.name,
            grossPay,
            netPay,
            grossIncomeGlAccountId,
            bankGlAccountId: receiptGlAccountId!,
            paygWithheld,
            paygGlAccountId,
            sgcAmount,
            sgcGlAccountId,
            sgcIncomeGlAccountId,
            deductions: (deductions as { label: string; amount: number; glAccountId?: string | null }[]),
            entityId: existing.entityId ?? null,
            memberId: existing.memberId ?? null,
            date: actualReceivedDate,
            reference: receiptRef,
          })
          receiptJe = { id: payslipResult.journalEntryId }

          // Upsert FinancePayslip record (delete + create for clean replace)
          await tx.financePayslip.deleteMany({ where: { incomeEntryId: id } })
          await tx.financePayslip.create({
            data: {
              incomeEntryId: id,
              familyId: user.familyId,
              grossPay,
              netPay,
              grossIncomeGlAccountId: grossIncomeGlAccountId ?? null,
              bankGlAccountId: receiptGlAccountId ?? null,
              paygWithheld,
              paygGlAccountId: paygGlAccountId ?? null,
              sgcAmount,
              sgcGlAccountId: sgcGlAccountId ?? null,
              sgcIncomeGlAccountId: sgcIncomeGlAccountId ?? null,
              components: JSON.stringify(components),
              deductions: JSON.stringify(deductions),
              payPeriodStart: payPeriodStart ? new Date(payPeriodStart) : null,
              payPeriodEnd: payPeriodEnd ? new Date(payPeriodEnd) : null,
              notes: payslipNotes ?? null,
            },
          })
        } else {
          // ── MODE B: Simple 2-line DR Bank / CR AR ─────────────────────
          //
          // BUG B: a receipt must clear Accounts Receivable by EXACTLY the open
          // AR balance for this income, never by an arbitrary cash figure. For a
          // withholding-split accrual (DR AR net + DR tax / CR gross) the AR line
          // holds only the net; clearing a different actualAmount (e.g. the gross)
          // over-clears AR and overstates Bank. Compute the open AR from the
          // accrual journal's AR lines and reject any mismatch so the user
          // reconciles manually (no silent variance).
          if (accrualJournalId) {
            const arLines = await tx.financeJournalLine.findMany({
              where: { journalEntryId: accrualJournalId, glAccountId: arCategoryId },
              select: { side: true, amount: true },
            })
            const openAr = arLines.reduce(
              (sum, l) => sum + (l.side === 'debit' ? l.amount : -l.amount),
              0,
            )
            if (Math.abs(openAr - actualAmount) > 0.005) {
              throw new Error(
                `Receipt amount $${actualAmount.toFixed(2)} does not match the open Accounts Receivable balance $${openAr.toFixed(2)} for this income. ` +
                `Adjust the amount received to equal the outstanding balance before recording the receipt.`,
              )
            }
          }
          const receiptResult = await postIncomeReceiptJournal(tx, {
            familyId: user.familyId,
            description: existing.name,
            amount: actualAmount,
            bankGlAccountId: receiptGlAccountId!,
            entityId: existing.entityId ?? null,
            date: actualReceivedDate,
            reference: receiptRef,
          })
          receiptJe = { id: receiptResult.journalEntryId }
        }

        const receiptStatusData = {
          received: true,
          receivedDate: actualReceivedDate,
          receiptJournalEntryId: receiptJe.id,
          actualAmountReceived: actualAmount,
          // BUG D: advance the lifecycle status to its terminal value so it no
          // longer sits in 'awaiting_receipt' once cash has been received.
          status: 'received',
        }

        if (invoiceTxId) {
          await tx.financeTransaction.update({
            where: { id: invoiceTxId },
            data: {
              isCleared: true,
              reconciledDate: actualReceivedDate,
              date: actualReceivedDate,
              amount: actualAmount,
              glAccountId: receiptGlAccountId,
              accountId: receiptAccountId,
            },
          })
          await tx.financeIncomeEntry.update({
            where: { id },
            data: { ...receiptStatusData, receiptTxId: invoiceTxId, transactionId: invoiceTxId },
          })
        } else {
          const newTx = await tx.financeTransaction.create({
            data: {
              type: 'income', amount: actualAmount,
              accountId: receiptAccountId, categoryId: existing.categoryId,
              description: existing.name, date: actualReceivedDate,
              isRecurring: existing.incomeType !== 'one-off',
              vendorId: existing.vendorId, notes: existing.notes,
              memberId: existing.memberId, locationId: existing.locationId,
              isCleared: true, reconciledDate: actualReceivedDate,
              isTransfer: false,
              glAccountId: receiptGlAccountId,
              createdBy: user.id, familyId: user.familyId,
              entityId: existing.entityId,
            },
          })
          await tx.financeIncomeEntry.update({
            where: { id },
            data: { ...receiptStatusData, receiptTxId: newTx.id, transactionId: newTx.id },
          })
        }

        // Spawn the next occurrence for recurring income — INSIDE this
        // $transaction (mirrors recordBillPayment step 6): if the spawn fails
        // the entire receipt rolls back. A committed receipt with no successor
        // silently ends the recurring series — unrecoverable.
        if (existing.incomeType !== 'one-off') {
          await spawnNextIncomeOnReceipt(tx, existing, user.familyId)
        }
      })
    } catch (err) {
      console.error('[income PATCH] ATOMIC cash-receipt GL posting failed:', err)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to post cash receipt to General Ledger. No changes were saved.' },
        { status: 422 }
      )
    }
  }

  // Re-fetch with includes so the response is fresh
  const finalEntry = await prisma.financeIncomeEntry.findFirst({
    where: { id, familyId: user.familyId },
    include: INCOME_INCLUDE,
  })

  // Period lock warning — only when Stage 1 just fired
  let incomePeriodWarning: string | null = null
  if (invoiceReceived === true && existing && !existing.invoiceReceived) {
    const remittanceDate = invoiceReceivedDate ? new Date(invoiceReceivedDate) : new Date()
    incomePeriodWarning = await getPeriodLockWarning(user.familyId, remittanceDate)
  }

  const incomeResult = finalEntry ?? entry
  return NextResponse.json(incomePeriodWarning ? { ...incomeResult, periodWarning: incomePeriodWarning } : incomeResult)
}
