import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { getTemplate, computeNextOccurrenceDate, type OccurrenceTemplate } from '@/lib/finance-recurring-template-service'
import { createOccurrenceDraft } from '@/lib/finance-draft-spawn-service'
import { utcMidnight } from '@/lib/timezone'
import { ensureAccountsReceivableCategory } from '@/lib/finance-opening-balance'
import { nextJournalReference } from '@/lib/finance-journal-ref'
import { postPayslipReceiptJournal, postIncomeReceiptJournal, upsertDraftJournal, reconcilePostedAccrualOnEdit, AccrualReconcileBlockedError } from '@/lib/finance-posting'
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
// implementation shared with bills' upsertBillDraftJournal). Income is
// recognised immediately (isPosted=true); the balance, GL-family, posted-guard
// and atomic-write guarantees live in the shared function.

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
  // Income is recognised immediately on save (isPosted=true). The shared upsert
  // throws on unbalanced lines, so a posted entry is always balanced.
  return upsertDraftJournal({
    description: incomeName,
    existingJournalEntryId,
    lines,
    date,
    familyId,
    entityId,
    isPosted: true,
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

  const entry = await prisma.financeIncomeEntry.create({
    data: {
      name,
      amount: parseFloat(amount),
      accountId: accountId ?? null,
      categoryId: categoryId ?? null,
      vendorId: vendorId ?? null,
      frequency,
      incomeType: incomeType ?? 'recurring',
      nextExpectedDate: new Date(nextExpectedDate ?? new Date()),
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
      invoiceReceived: invoiceReceived ?? false,
      invoiceReceivedDate: invoiceReceivedDate ? new Date(invoiceReceivedDate) : null,
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

  // If journal lines provided, create the draft accrual journal entry
  if (Array.isArray(journalLines) && journalLines.length >= 2) {
    try {
      const journalEntryId = await upsertIncomeJournalEntry(
        entry.name,
        null,
        journalLines,
        new Date(nextExpectedDate ?? new Date()),
        user.familyId,
        entityId ?? null,
      )
      await prisma.financeIncomeEntry.update({
        where: { id: entry.id },
        data: { journalEntryId },
      })
    } catch (err) {
      console.error('[income POST] Failed to create journal entry:', err)
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
  const incomeGlFieldChanged =
    (categoryId !== undefined && (categoryId ?? null) !== existing.categoryId) ||
    (entityId !== undefined && (entityId ?? null) !== existing.entityId) ||
    (amount !== undefined && parseFloat(amount) !== existing.amount)
  const needsAccrualResync =
    incomeGlFieldChanged && existing.invoiceReceived === true && !!existing.journalEntryId

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

  const entry = await prisma.financeIncomeEntry.update({
    where: { id },
    data: {
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
      ...(invoiceReceived !== undefined && { invoiceReceived }),
      ...(invoiceReceivedDate !== undefined && { invoiceReceivedDate: invoiceReceivedDate ? new Date(invoiceReceivedDate) : null }),
      ...(notes !== undefined && { notes: notes ?? null }),
      ...(memberId !== undefined && { memberId: memberId ?? null }),
      ...(locationId !== undefined && { locationId: locationId ?? null }),
      ...(entityId !== undefined && { entityId: entityId ?? null }),
      ...(isTaxTracked !== undefined && { isTaxTracked }),
      ...(taxRate !== undefined && { taxRate: taxRate != null ? parseFloat(taxRate) : null }),
      ...(taxClassification !== undefined && { taxClassification: taxClassification ?? null }),
      ...(showOnCalendar !== undefined && { showOnCalendar }),
      ...(actualAmountReceived !== undefined && { actualAmountReceived: actualAmountReceived != null ? parseFloat(actualAmountReceived) : null }),
    },
    include: INCOME_INCLUDE,
  })

  // Upsert journal entry if lines provided.
  // F-I5 guard: if the existing journal is already posted, skip the upsert entirely.
  // upsertIncomeJournalEntry falls through to create a new journal when it finds
  // an already-posted entry, which orphans the original and doubles revenue/AR.
  if (Array.isArray(journalLines) && journalLines.length >= 2) {
    try {
      const existingJeId: string | null = existing.journalEntryId ?? null
      const existingJe = existingJeId
        ? await prisma.financeJournalEntry.findFirst({
            where: { id: existingJeId, familyId: user.familyId },
            select: { isPosted: true },
          })
        : null
      if (existingJe?.isPosted) {
        // Journal already posted — do not overwrite or create a duplicate
      } else {
        const journalEntryId = await upsertIncomeJournalEntry(
          name ?? existing.name,
          existingJeId,
          journalLines,
          nextExpectedDate ? new Date(nextExpectedDate) : existing.nextExpectedDate,
          user.familyId,
          entityId !== undefined ? (entityId ?? null) : existing.entityId,
        )
        if (journalEntryId !== existingJeId) {
          await prisma.financeIncomeEntry.update({
            where: { id: entry.id },
            data: { journalEntryId },
          })
        }
      }
    } catch (err) {
      console.error('[income PUT] Failed to upsert journal entry:', err)
    }
  }

  // Reconcile the posted accrual when a GL-relevant field changed on an income
  // entry whose accrual is already posted. The received / custom-split cases were
  // rejected by the pre-edit GL guard above, so this only runs on the safe path.
  // (Residual risk: if the reconcile transaction fails unexpectedly its GL writes
  // roll back, but the row was already updated — surfaced as a 422 so the user retries.)
  if (needsAccrualResync) {
    const effectiveCategoryId = categoryId !== undefined ? (categoryId ?? null) : existing.categoryId
    if (effectiveCategoryId && existing.journalEntryId) {
      try {
        const { newJournalEntryId } = await reconcilePostedAccrualOnEdit({
          kind: 'income',
          familyId: user.familyId,
          journalEntryId: existing.journalEntryId,
          description: name ?? existing.name,
          amount: amount !== undefined ? parseFloat(amount) : existing.amount,
          glAccountId: effectiveCategoryId,
          entityId: entityId !== undefined ? (entityId ?? null) : existing.entityId,
          invoiceTxId: existing.invoiceTxId ?? null,
        })
        if (newJournalEntryId !== existing.journalEntryId) {
          await prisma.financeIncomeEntry.update({
            where: { id: entry.id },
            data: { journalEntryId: newJournalEntryId },
          })
        }
      } catch (err) {
        if (err instanceof AccrualReconcileBlockedError) {
          return NextResponse.json({ error: err.message }, { status: 422 })
        }
        console.error('[income PUT] Failed to reconcile posted accrual on edit:', err)
        return NextResponse.json(
          { error: 'Failed to update the General Ledger for this edit. The GL was left unchanged; please retry.' },
          { status: 422 },
        )
      }
    }
  }

  return NextResponse.json(entry)
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
    reference: string
    journalId: string
    entityId: string | null
    refLabel: string | null
    description: string | null
    lines: { glAccountId: string; side: string; amount: number; description: string | null }[]
  }
  const jeReversals: JeReversal[] = []
  for (const jeId of jeIds) {
    const je = await prisma.financeJournalEntry.findFirst({
      where: { id: jeId, familyId: user.familyId },
      include: { lines: true },
    })
    if (je?.isPosted && !je.isReversed) {
      jeReversals.push({
        reference: '',        // filled in after batch-generating refs below
        journalId: je.id,
        entityId: je.entityId,
        refLabel: je.reference,
        description: je.description,
        lines: je.lines,
      })
    }
  }

  // Generate all reversal refs in one shot (sequential increment from MAX)
  const refs = await Promise.all(
    jeReversals.length > 0
      ? [nextJournalReference(user.familyId)]
      : []
  )
  const firstRef = refs[0]
  if (firstRef !== undefined) {
    const base = parseInt(firstRef.match(/^JE-(\d+)$/)?.[1] ?? '0', 10)
    jeReversals.forEach((r, i) => { r.reference = `JE-${String(base + i).padStart(4, '0')}` })
  }

  // Collect all transaction IDs to delete
  const txIdsToDelete = [
    existing.invoiceTxId,
    existing.receiptTxId,
    existing.transactionId,
  ].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i)

  // Atomic: reverse all GL journals, delete transactions, and delete the income entry together
  await prisma.$transaction(async (tx) => {
    for (const reversal of jeReversals) {
      await tx.financeJournalEntry.create({
        data: {
          reference: reversal.reference,
          date: new Date(),
          description: `VOID: ${reversal.refLabel ?? reversal.journalId} — ${reversal.description}`,
          type: 'reversal',
          isPosted: true,
          reversalOfId: reversal.journalId,
          entityId: reversal.entityId,
          familyId: user.familyId,
          lines: {
            create: reversal.lines.map(l => ({
              glAccountId: l.glAccountId,
              side: l.side === 'debit' ? 'credit' : 'debit',
              amount: l.amount,
              description: l.description,
            })),
          },
        },
      })
      await tx.financeJournalEntry.update({ where: { id: reversal.journalId }, data: { isReversed: true } })
    }
    if (txIdsToDelete.length > 0) {
      await tx.financeTransaction.deleteMany({ where: { id: { in: txIdsToDelete }, familyId: user.familyId } })
    }
    await tx.financeIncomeEntry.delete({ where: { id } })
  })
  return NextResponse.json({ success: true })
}

// Recursively deletes unreceived child entries for a given parent, depth-first.
// The simple deleteMany({ parentIncomeId: id }) only removes direct children;
// with the chain master→child1→child2, undoing master leaves child2 orphaned
// if child1 was already received.
async function deleteUnreceivedDescendants(parentId: string, familyId: string): Promise<void> {
  const children = await prisma.financeIncomeEntry.findMany({
    where: { parentIncomeId: parentId, familyId, received: false },
    select: { id: true },
  })
  for (const child of children) {
    await deleteUnreceivedDescendants(child.id, familyId)
  }
  await prisma.financeIncomeEntry.deleteMany({
    where: { parentIncomeId: parentId, familyId, received: false },
  })
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { id, received, receivedDate: receivedDateRaw, invoiceReceived, invoiceReceivedDate, receiveToAccountId, receiveToGlAccountId, void: doVoid, voidNote, actualAmountReceived: actualAmountReceivedRaw, payslip: payslipData } = json

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
      reference: string
      journalId: string
      entityId: string | null
      refLabel: string | null
      description: string | null
      lines: { glAccountId: string; side: string; amount: number; description: string | null }[]
    }
    const jeReversals: JeReversal[] = []
    for (const jeId of jeIds) {
      const je = await prisma.financeJournalEntry.findFirst({
        where: { id: jeId, familyId: user.familyId },
        include: { lines: true },
      })
      if (je?.isPosted && !je.isReversed) {
        jeReversals.push({ reference: '', journalId: je.id, entityId: je.entityId, refLabel: je.reference, description: je.description, lines: je.lines })
      }
    }

    if (jeReversals.length > 0) {
      const firstRef = await nextJournalReference(user.familyId)
      const base = parseInt(firstRef.match(/^JE-(\d+)$/)?.[1] ?? '0', 10)
      jeReversals.forEach((r, i) => { r.reference = `JE-${String(base + i).padStart(4, '0')}` })
    }

    await prisma.$transaction(async (tx) => {
      for (const reversal of jeReversals) {
        await tx.financeJournalEntry.create({
          data: {
            reference: reversal.reference,
            date: new Date(),
            description: `VOID: ${reversal.refLabel ?? reversal.journalId} — ${reversal.description}`,
            type: 'reversal',
            isPosted: true,
            reversalOfId: reversal.journalId,
            entityId: reversal.entityId,
            familyId: user.familyId,
            lines: {
              create: reversal.lines.map(l => ({
                glAccountId: l.glAccountId,
                side: l.side === 'debit' ? 'credit' : 'debit',
                amount: l.amount,
                description: l.description,
              })),
            },
          },
        })
        await tx.financeJournalEntry.update({ where: { id: reversal.journalId }, data: { isReversed: true } })
      }
      await tx.financeIncomeEntry.update({
        where: { id },
        data: { isVoided: true, voidedAt: new Date(), voidNote: voidNote ?? null },
      })
    })

    return NextResponse.json({ success: true, voided: true })
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

  // ── Undo remittance: delete the stage-1 income transaction ────────────────
  if (invoiceReceived === false && existing.invoiceReceived === true) {
    const invoiceTxId: string | null = existing.invoiceTxId ?? null
    if (invoiceTxId) {
      await prisma.financeTransaction.deleteMany({
        where: { id: invoiceTxId, familyId: user.familyId },
      })
      updateData.invoiceTxId = null
      if (existing.transactionId === invoiceTxId) updateData.transactionId = null
    }
    // Reverse the accrual journal entry (do NOT delete — preserve audit trail per R4)
    const jeId: string | null = existing.journalEntryId ?? null
    if (jeId) {
      const je = await prisma.financeJournalEntry.findFirst({
        where: { id: jeId, familyId: user.familyId },
        include: { lines: true },
      })
      if (je?.isPosted && !je.isReversed) {
        const reversalRef = await nextJournalReference(user.familyId)
        await prisma.financeJournalEntry.create({
          data: {
            reference:    reversalRef,
            date:         new Date(),
            description:  `VOID: ${je.reference ?? je.id} — ${je.description}`,
            type:         'reversal',
            isPosted:     true,
            reversalOfId: je.id,
            entityId:     je.entityId,
            familyId:     user.familyId,
            lines: {
              create: je.lines.map(l => ({
                glAccountId: l.glAccountId,
                side:        l.side === 'debit' ? 'credit' : 'debit',
                amount:      l.amount,
                description: l.description,
              })),
            },
          },
        })
        await prisma.financeJournalEntry.update({
          where: { id: je.id },
          data:  { isReversed: true },
        })
      } else if (je && !je.isPosted) {
        // Draft entry — zero GL effect, safe to delete
        await prisma.financeJournalEntry.delete({ where: { id: je.id } })
      }
      updateData.journalEntryId = null
    }
    // Undo received too if it was set
    if (existing.received) {
      const receiptTxId: string | null = existing.receiptTxId ?? null
      if (receiptTxId) {
        await prisma.financeTransaction.deleteMany({
          where: { id: receiptTxId, familyId: user.familyId },
        })
        updateData.receiptTxId = null
        if (existing.transactionId === receiptTxId) updateData.transactionId = null
      }
      updateData.received = false
      updateData.receivedDate = null
      await deleteUnreceivedDescendants(id, user.familyId)
    }
  }

  // ── Undo received: delete stage-2 receipt transaction + receipt GL journal + spawned children ──
  if (received === false && existing.received === true) {
    const receiptTxId: string | null = existing.receiptTxId ?? null
    if (receiptTxId) {
      await prisma.financeTransaction.deleteMany({
        where: { id: receiptTxId, familyId: user.familyId },
      })
      updateData.receiptTxId = null
      if (existing.transactionId === receiptTxId) updateData.transactionId = null
    } else if (existing.transactionId) {
      // Legacy: older records stored receipt in transactionId directly
      await prisma.financeTransaction.deleteMany({
        where: { id: existing.transactionId, familyId: user.familyId },
      })
      updateData.transactionId = null
    }
    // Reverse the receipt GL journal (do NOT delete — preserve audit trail per R4)
    const receiptJeId: string | null = (existing as any).receiptJournalEntryId ?? null
    if (receiptJeId) {
      const je = await prisma.financeJournalEntry.findFirst({
        where: { id: receiptJeId, familyId: user.familyId },
        include: { lines: true },
      })
      if (je?.isPosted && !je.isReversed) {
        const reversalRef = await nextJournalReference(user.familyId)
        await prisma.financeJournalEntry.create({
          data: {
            reference:    reversalRef,
            date:         new Date(),
            description:  `VOID: ${je.reference ?? je.id} — ${je.description}`,
            type:         'reversal',
            isPosted:     true,
            reversalOfId: je.id,
            entityId:     je.entityId,
            familyId:     user.familyId,
            lines: {
              create: je.lines.map(l => ({
                glAccountId: l.glAccountId,
                side:        l.side === 'debit' ? 'credit' : 'debit',
                amount:      l.amount,
                description: l.description,
              })),
            },
          },
        })
        await prisma.financeJournalEntry.update({
          where: { id: je.id },
          data:  { isReversed: true },
        })
      } else if (je && !je.isPosted) {
        await prisma.financeJournalEntry.delete({ where: { id: je.id } })
      }
      updateData.receiptJournalEntryId = null
    }
    // Re-open stage-1 remittance tx (income still recognised, just not yet received)
    const invoiceTxId: string | null = existing.invoiceTxId ?? null
    if (invoiceTxId) {
      await prisma.financeTransaction.updateMany({
        where: { id: invoiceTxId, familyId: user.familyId },
        data: { isCleared: false, reconciledDate: null },
      })
    }
    await deleteUnreceivedDescendants(id, user.familyId)
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
        const arCategoryId = await ensureAccountsReceivableCategory(user.familyId)

        // 1. Create GL journal: DR AR / CR Income — posted immediately
        let journalEntryId: string
        const existingJeId: string | null = existing.journalEntryId ?? null

        if (existingJeId) {
          const existingJe = await tx.financeJournalEntry.findFirst({
            where: { id: existingJeId, familyId: user.familyId },
            include: { lines: true },
          })
          if (existingJe && !existingJe.isPosted && existingJe.lines.length >= 2) {
            const dr = existingJe.lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
            const cr = existingJe.lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
            if (Math.abs(dr - cr) <= 0.005) {
              // GL-FIRST: balanced draft exists (e.g. user-configured GST split) —
              // promote it as-is rather than discarding and building a fresh 2-line entry.
              await tx.financeJournalEntry.update({ where: { id: existingJeId }, data: { isPosted: true, date: remittanceDate } })
              journalEntryId = existingJeId
            } else {
              // Unbalanced draft — fall back to standard 2-line auto entry
              const reference = await nextJournalReference(user.familyId)
              const je = await tx.financeJournalEntry.create({
                data: {
                  reference, date: remittanceDate, description: existing.name,
                  type: 'auto_transaction', isPosted: true,
                  entityId: existing.entityId ?? null, familyId: user.familyId,
                  lines: { create: [
                    { glAccountId: arCategoryId,         side: 'debit',  amount: existing.amount, description: `AR: ${existing.name}` },
                    { glAccountId: existing.categoryId!, side: 'credit', amount: existing.amount, description: existing.name },
                  ]},
                }, select: { id: true },
              })
              journalEntryId = je.id
            }
          } else if (existingJe?.isPosted) {
            // Already posted — accrual is correctly in the GL; re-use the
            // existing entry to avoid creating a duplicate that would double
            // revenue on the P&L and AR on the balance sheet.
            journalEntryId = existingJeId
          } else {
            // Exists but has no lines — create a fresh standard 2-line entry
            const reference = await nextJournalReference(user.familyId)
            const je = await tx.financeJournalEntry.create({
              data: {
                reference, date: remittanceDate, description: existing.name,
                type: 'auto_transaction', isPosted: true,
                entityId: existing.entityId ?? null, familyId: user.familyId,
                lines: { create: [
                  { glAccountId: arCategoryId,         side: 'debit',  amount: existing.amount, description: `AR: ${existing.name}` },
                  { glAccountId: existing.categoryId!, side: 'credit', amount: existing.amount, description: existing.name },
                ]},
              }, select: { id: true },
            })
            journalEntryId = je.id
          }
        } else {
          // No draft journal — create standard 2-line entry
          const reference = await nextJournalReference(user.familyId)
          const je = await tx.financeJournalEntry.create({
            data: {
              reference, date: remittanceDate, description: existing.name,
              type: 'auto_transaction', isPosted: true,
              entityId: existing.entityId ?? null, familyId: user.familyId,
              lines: { create: [
                { glAccountId: arCategoryId,         side: 'debit',  amount: existing.amount, description: `AR: ${existing.name}` },
                { glAccountId: existing.categoryId!, side: 'credit', amount: existing.amount, description: existing.name },
              ]},
            }, select: { id: true },
          })
          journalEntryId = je.id
        }

        // 2. Create tracking transaction
        const remittanceTx = await tx.financeTransaction.create({
          data: {
            type: 'income', amount: existing.amount,
            accountId: existing.accountId, categoryId: existing.categoryId,
            description: `${existing.name} (remittance received)`,
            date: remittanceDate, isRecurring: existing.incomeType !== 'one-off',
            vendorId: existing.vendorId, notes: existing.notes,
            memberId: existing.memberId, locationId: existing.locationId,
            isCleared: false, isTransfer: false,
            createdBy: user.id, familyId: user.familyId, entityId: existing.entityId,
          },
        })

        // 3. Update income entry ATOMICALLY with GL write
        await tx.financeIncomeEntry.update({
          where: { id },
          data: {
            invoiceReceived: true, invoiceReceivedDate: remittanceDate,
            invoiceTxId: remittanceTx.id, transactionId: remittanceTx.id,
            journalEntryId,
          },
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
    const actualReceivedDate = receivedDateRaw ? new Date(receivedDateRaw) : new Date()
    const receiptAccountId = receiveToAccountId ?? existing.accountId
    const receiptGlAccountId: string | null = receiveToGlAccountId ?? null

    // The actual amount to post to GL — actual overrides template for this occurrence
    const actualAmount: number = actualAmountReceivedRaw != null
      ? parseFloat(actualAmountReceivedRaw)
      : (existing.amount)

    // Re-read to get latest invoiceTxId (may have just been written above in Stage 1)
    const freshEntry = await prisma.financeIncomeEntry.findFirst({
      where: { id, familyId: user.familyId },
    })
    const invoiceTxId: string | null = freshEntry?.invoiceTxId ?? null

    // ── Validate payslip GL accounts when payslip mode ──────────────────────
    if (payslipData) {
      const { grossIncomeGlAccountId, bankGlAccountId, paygGlAccountId, deductions = [] } = payslipData
      if (!grossIncomeGlAccountId) {
        return NextResponse.json(
          { error: 'Payslip mode requires a Gross Income GL account (e.g. Gross Wages).' },
          { status: 400 }
        )
      }
      if (!bankGlAccountId) {
        return NextResponse.json(
          { error: 'Payslip mode requires a Bank / Take-home GL account.' },
          { status: 400 }
        )
      }
      // Validate all GL IDs referenced in the payslip belong to this family
      const glIds = [
        grossIncomeGlAccountId,
        bankGlAccountId,
        paygGlAccountId,
        ...(deductions as { glAccountId?: string }[]).map(d => d.glAccountId),
      ].filter((v): v is string => !!v)
      const validCount = await prisma.financeCategory.count({
        where: { id: { in: [...new Set(glIds)] }, familyId: user.familyId },
      })
      if (validCount < new Set(glIds).size) {
        return NextResponse.json(
          { error: 'One or more payslip GL accounts not found.' },
          { status: 400 }
        )
      }
    } else if (!receiptGlAccountId) {
      return NextResponse.json(
        { error: 'A GL account (bank account) is required to post a cash receipt.' },
        { status: 400 }
      )
    }

    // Pre-generate journal references outside the transaction so sequential
    // increments work correctly (inside $transaction uncommitted writes are invisible).
    //
    // BUG A: payslip MODE A posts a self-balancing multi-line journal with NO AR
    // line. Auto-posting a Stage-1 DR AR / CR Income accrual first would strand AR
    // and double-count income, so payslip receipts must never trigger auto-Stage-1.
    const needsAutoStage1 = !freshEntry?.invoiceReceived && !payslipData
    const accrualRef  = needsAutoStage1 ? await nextJournalReference(user.familyId) : null
    // When auto-posting Stage 1 in this same transaction, the accrual is not yet
    // committed, so nextJournalReference would return the same JE-N for both and
    // collide on @@unique([familyId, reference]) → P2002 → 422. Force the receipt
    // ref to accrual+1 (mirrors bills/route.ts nextNJournalReferences and the
    // markIncomeReceived tool). The non-auto path is unchanged.
    const receiptRef  = needsAutoStage1
      ? `JE-${String(parseInt(accrualRef!.match(/^JE-(\d+)$/)?.[1] ?? '0', 10) + 1).padStart(4, '0')}`
      : await nextJournalReference(user.familyId)

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
          const accrualJe = await tx.financeJournalEntry.create({
            data: {
              reference: accrualRef!,
              date: actualReceivedDate,
              description: existing.name,
              type: 'auto_transaction',
              isPosted: true,
              entityId: existing.entityId ?? null,
              familyId: user.familyId,
              lines: {
                create: [
                  { glAccountId: arCategoryId,        side: 'debit',  amount: actualAmount, description: `AR: ${existing.name}` },
                  { glAccountId: existing.categoryId, side: 'credit', amount: actualAmount, description: existing.name },
                ],
              },
            },
            select: { id: true },
          })
          await tx.financeIncomeEntry.update({
            where: { id },
            data: { invoiceReceived: true, invoiceReceivedDate: actualReceivedDate, journalEntryId: accrualJe.id },
          })
          accrualJournalId = accrualJe.id
        }

        // ── MODE A: Payslip multi-line journal ─────────────────────────────
        let receiptJe: { id: string }
        if (payslipData) {
          const {
            grossPay, netPay, grossIncomeGlAccountId, bankGlAccountId,
            paygWithheld = 0, paygGlAccountId,
            sgcAmount = 0, sgcGlAccountId,
            components = [], deductions = [],
            payPeriodStart, payPeriodEnd, notes: payslipNotes,
          } = payslipData

          const payslipResult = await postPayslipReceiptJournal(tx, {
            familyId: user.familyId,
            description: existing.name,
            grossPay,
            netPay,
            grossIncomeGlAccountId,
            bankGlAccountId,
            paygWithheld,
            paygGlAccountId,
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
              bankGlAccountId: bankGlAccountId ?? null,
              paygWithheld,
              paygGlAccountId: paygGlAccountId ?? null,
              sgcAmount,
              sgcGlAccountId: sgcGlAccountId ?? null,
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
              glAccountId: payslipData ? payslipData.bankGlAccountId : receiptGlAccountId,
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
              glAccountId: payslipData ? payslipData.bankGlAccountId : receiptGlAccountId,
              createdBy: user.id, familyId: user.familyId,
              entityId: existing.entityId,
            },
          })
          await tx.financeIncomeEntry.update({
            where: { id },
            data: { ...receiptStatusData, receiptTxId: newTx.id, transactionId: newTx.id },
          })
        }
      })
    } catch (err) {
      console.error('[income PATCH] ATOMIC cash-receipt GL posting failed:', err)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to post cash receipt to General Ledger. No changes were saved.' },
        { status: 422 }
      )
    }

    // Spawn the next occurrence for recurring income — outside the transaction
    // so a spawn failure does not roll back the committed cash receipt.
    // ALWAYS spawns using entry.amount (template) not actualAmount for stable forecasting.
    if (existing.incomeType !== 'one-off') {
      try {
        if (existing.templateId) {
          // ── Templated: spawn the next occurrence through the shared clean
          // path (the identical draft the cron worker produces — clean
          // UTC-midnight dates, draft journal, snapshot hash, payslip). Step
          // cadence from the template schedule, anchored at the current
          // occurrence date.
          const template = await getTemplate(user.familyId, existing.templateId)
          if (template) {
            const next = computeNextOccurrenceDate(template, utcMidnight(existing.nextExpectedDate))
            if (next) {
              const occ = utcMidnight(next)
              await prisma.$transaction(async (tx) => {
                await createOccurrenceDraft(tx, template, occ, existing.id)
                // Advance the template cursor atomically with the spawn so the
                // cron does not re-spawn the same occurrence.
                await tx.financeRecurringTemplate.update({
                  where: { id: template.id },
                  data: { nextOccurrenceDate: occ },
                })
              })
            }
          }
        } else {
          // ── Template-less recurring entry: no template drives cadence, so
          // step from the entry's own schedule using the same clean cadence
          // function, normalised to UTC midnight (no wall-clock pollution).
          const occTemplate: OccurrenceTemplate = {
            frequency: existing.frequency,
            interval: parseInt(existing.recurrenceInterval ?? '1') || 1,
            dayOfMonth: existing.dayOfMonth,
            monthOfYear: existing.monthOfYear,
            startDate: existing.nextExpectedDate,
            endMode: 'never',
            endDate: existing.endDate,
            totalOccurrences: null,
            occurrencesRemaining: null,
          }
          const next = computeNextOccurrenceDate(occTemplate, utcMidnight(existing.nextExpectedDate))
          const newExpectedDate = next ? utcMidnight(next) : null
          if (newExpectedDate && (!existing.endDate || newExpectedDate <= existing.endDate)) {
            await prisma.financeIncomeEntry.create({
              data: {
                name: existing.name,
                amount: existing.amount,  // template amount for forecasting
                accountId: existing.accountId,
                categoryId: existing.categoryId,
                vendorId: existing.vendorId,
                frequency: existing.frequency,
                incomeType: existing.incomeType,
                nextExpectedDate: newExpectedDate,
                endDate: existing.endDate,
                isActive: existing.isActive,
                received: false,
                receivedDate: null,
                autoPay: existing.autoPay,
                emailReminder: existing.emailReminder,
                reminderDays: existing.reminderDays,
                dayOfMonth: existing.dayOfMonth,
                monthOfYear: existing.monthOfYear,
                recurrenceInterval: existing.recurrenceInterval,
                invoiceReceived: false,
                invoiceReceivedDate: null,
                notes: existing.notes,
                memberId: existing.memberId,
                locationId: existing.locationId,
                entityId: existing.entityId,
                taxClassification: existing.taxClassification,
                isTaxTracked: existing.isTaxTracked,
                taxRate: existing.taxRate,
                parentIncomeId: existing.id,
                templateId: null,
                status: 'draft',
                familyId: user.familyId,
              },
            })
          }
        }
      } catch (err) {
        console.error('[income PATCH] Failed to spawn next occurrence — receipt was committed:', err)
      }
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
