import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { addMonths, addWeeks, max } from 'date-fns'
import {
  ensureAccountsPayableCategory,
  createGstJournalEntry,
} from '@/lib/finance-opening-balance'
import { nextJournalReference } from '@/lib/finance-journal-ref'

const BILL_INCLUDE = {
  account: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, color: true, type: true, glCode: true, gstApplicable: true, gstRate: true, isTaxDeduction: true, taxIncludeInReporting: true } },
  location: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
  entity: { select: { id: true, name: true, color: true, type: true } },
  payments: { select: { amount: true } },
  attachments: {
    select: { id: true, billId: true, title: true, fileName: true, fileSize: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
  // Include journal entry posting status so the UI can show the CORRECT GL state
  journalEntry: { select: { id: true, isPosted: true, reference: true } },
}

interface JournalLine {
  glAccountId: string
  side: 'debit' | 'credit'
  amount: number
  description?: string
}

// ── Core GL posting function for bills ───────────────────────────────────────
// Called atomically from both POST (when invoiceReceived=true on create)
// and PATCH (when invoiceReceived transitions false→true).
//
// Accounting: DR Expense Account / CR Accounts Payable
// Creates the journal entry and posts it immediately.
// Returns the journal entry ID.
async function postBillToGL(
  billId: string,
  billName: string,
  amount: number,
  categoryId: string,
  entityId: string | null,
  familyId: string,
  invoiceDate: Date,
  existingJournalEntryId: string | null,
): Promise<string> {
  const apCategoryId = await ensureAccountsPayableCategory(familyId)

  // Validate GL accounts
  const glIds = [categoryId, apCategoryId]
  const validAccounts = await prisma.financeCategory.findMany({
    where: { id: { in: glIds }, familyId },
    select: { id: true },
  })
  if (validAccounts.length !== glIds.length) {
    throw new Error('One or more GL accounts not found for bill posting')
  }

  // If an existing draft journal entry exists, post it (update isPosted=true)
  if (existingJournalEntryId) {
    const existing = await prisma.financeJournalEntry.findFirst({
      where: { id: existingJournalEntryId, familyId },
      include: { lines: true },
    })
    if (existing && !existing.isPosted && existing.lines.length >= 2) {
      // Verify the lines are balanced
      const dr = existing.lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
      const cr = existing.lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
      if (Math.abs(dr - cr) <= 0.005) {
        await prisma.financeJournalEntry.update({
          where: { id: existingJournalEntryId },
          data: { isPosted: true, date: invoiceDate },
        })
        return existingJournalEntryId
      }
      // Unbalanced draft — fall through to create a fresh auto journal
    }
  }

  // Auto-create the standard bill journal: DR expense / CR AP
  const reference = await nextJournalReference(familyId)
  const entry = await prisma.financeJournalEntry.create({
    data: {
      reference,
      date: invoiceDate,
      description: billName,
      type: 'auto_transaction',
      isPosted: true,   // Posted immediately — this IS the accrual recognition event
      entityId: entityId ?? null,
      familyId,
      lines: {
        create: [
          { glAccountId: categoryId,   side: 'debit',  amount, description: billName },
          { glAccountId: apCategoryId, side: 'credit', amount, description: `AP: ${billName}` },
        ],
      },
    },
    select: { id: true },
  })
  return entry.id
}

// ── Stage 2 GL posting: Bill paid → DR AP / CR Bank ──────────────────────────
// Creates a posted journal entry for the payment leg.
async function postBillPaymentToGL(
  billName: string,
  amount: number,
  apCategoryId: string,
  bankGlAccountId: string,
  entityId: string | null,
  familyId: string,
  paymentDate: Date,
  billId: string,
): Promise<string> {
  // Validate
  const valid = await prisma.financeCategory.findMany({
    where: { id: { in: [apCategoryId, bankGlAccountId] }, familyId },
    select: { id: true },
  })
  if (valid.length < 2) {
    throw new Error('GL accounts not found for bill payment posting')
  }

  const reference = await nextJournalReference(familyId)
  const entry = await prisma.financeJournalEntry.create({
    data: {
      reference,
      date: paymentDate,
      description: `Payment: ${billName}`,
      type: 'auto_transaction',
      isPosted: true,
      entityId: entityId ?? null,
      familyId,
      lines: {
        create: [
          { glAccountId: apCategoryId,     side: 'debit',  amount, description: `Clear AP: ${billName}` },
          { glAccountId: bankGlAccountId,  side: 'credit', amount, description: `Payment: ${billName}` },
        ],
      },
    },
    select: { id: true },
  })
  return entry.id
}

// ── Draft journal helper (save lines for review before posting) ──────────────
// GL-FIRST: the draft journal is the canonical record of the user's intended
// split (e.g. DR expense ex-GST / DR GST ITC / CR Accounts Payable).
// It is promoted to isPosted=true when invoiceReceived transitions to true.
//
// Safety guarantees:
//   1. Balance validation happens BEFORE any delete — unbalanced lines are
//      rejected with a thrown error; no data is touched.
//   2. The deleteMany + update/create is wrapped in a $transaction so a
//      partial failure cannot leave an entry with no lines.
async function upsertBillDraftJournal(
  billId: string,
  billName: string,
  existingJournalEntryId: string | null | undefined,
  lines: JournalLine[],
  date: Date,
  familyId: string,
  entityId: string | null,
): Promise<string> {
  if (lines.length < 2) {
    throw new Error('A journal entry requires at least 2 lines')
  }

  // Validate all GL accounts belong to this family
  const glIds = [...new Set(lines.map(l => l.glAccountId))]
  const validAccounts = await prisma.financeCategory.findMany({
    where: { id: { in: glIds }, familyId },
    select: { id: true },
  })
  if (validAccounts.length !== glIds.length) {
    throw new Error('One or more GL accounts not found')
  }

  // Balance check BEFORE touching anything in the DB
  const totalDR = lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
  const totalCR = lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
  if (Math.abs(totalDR - totalCR) > 0.005) {
    throw new Error(
      `Journal lines are not balanced — debits ${totalDR.toFixed(2)} ≠ credits ${totalCR.toFixed(2)}`,
    )
  }

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
            description: billName,
            entityId: entityId ?? null,
            isPosted: false,
            lines: { create: lineData },
          },
        })
      })
      return existingJournalEntryId
    }
  }

  // No existing draft — create a new one atomically
  const reference = await nextJournalReference(familyId)
  const entry = await prisma.$transaction(async (tx) => {
    return tx.financeJournalEntry.create({
      data: {
        reference,
        date,
        description: billName,
        type: 'auto_transaction',
        isPosted: false,
        entityId: entityId ?? null,
        familyId,
        lines: { create: lineData },
      },
      select: { id: true },
    })
  })
  return entry.id
}

function advanceNextDueDate(date: Date, frequency: string): Date {
  // Use max(date, today) to avoid spawning a bill that's already overdue
  const referenceDate = max([date, new Date()])
  if (frequency === 'weekly')      return addWeeks(referenceDate, 1)
  if (frequency === 'fortnightly') return addWeeks(referenceDate, 2)
  if (frequency === 'monthly')     return addMonths(referenceDate, 1)
  // bimonthly = every 2 months (6×/year). date-fns addMonths already snaps
  // end-of-month correctly (e.g. 31 Dec + 2 months → 28 Feb, not 3 Mar).
  if (frequency === 'bimonthly')   return addMonths(referenceDate, 2)
  if (frequency === 'quarterly')   return addMonths(referenceDate, 3)
  if (frequency === 'halfyearly')  return addMonths(referenceDate, 6)
  if (frequency === 'yearly')      return addMonths(referenceDate, 12)
  // Unknown frequency — default to monthly rather than silently misbehaving.
  // Log a warning so misconfigured bills are visible in container logs.
  console.warn(`[advanceNextDueDate] Unknown frequency "${frequency}" — defaulting to monthly`)
  return addMonths(referenceDate, 1)
}

// Generate N sequential journal references in one shot.
// nextJournalReference reads MAX from committed DB state — calling it N times
// without commits in between returns the same value each time. This function
// calls it once and increments the number for each additional ref needed.
// P2002 risk (concurrent requests) is accepted; the caller's $transaction rolls
// back cleanly if a collision occurs.
async function nextNJournalReferences(familyId: string, n: number): Promise<string[]> {
  if (n === 0) return []
  const first = await nextJournalReference(familyId)
  if (n === 1) return [first]
  const base = parseInt(first.match(/^JE-(\d+)$/)?.[1] ?? '0', 10)
  return Array.from({ length: n }, (_, i) => `JE-${String(base + i).padStart(4, '0')}`)
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await requireSession()
  const bills = await prisma.financeRecurringBill.findMany({
    where: {
      familyId: session.familyId,
      isVoided: false,
      // Exclude template-spawned drafts (status='draft') — they belong in the Drafts inbox only.
      // The OR preserves legacy rows (status=null) which predate the status field.
      OR: [{ status: null }, { status: { not: 'draft' } }],
    },
    include: BILL_INCLUDE,
    orderBy: { nextDueDate: 'asc' },
  })
  // Add derived isGlPosted field — TRUE only when the linked journal is actually posted in the GL
  const enriched = bills.map(b => ({
    ...b,
    isGlPosted: (b as any).journalEntry?.isPosted === true,
  }))
  return NextResponse.json(enriched)
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const {
    name, amount, accountId, categoryId, frequency,
    dayOfMonth, monthOfYear, nextDueDate, endDate,
    isActive, autoPay, emailReminder, reminderDays,
    notes, memberId, locationId, vendorId,
    billType, recurrenceInterval,
    invoiceReceived, invoiceReceivedDate,
    paid, paidDate, entityId, taxClassification,
    journalLines,
  } = json

  if (!name || !amount || !frequency) {
    return NextResponse.json({ error: 'Name, amount, and frequency are required' }, { status: 400 })
  }

  const parsedAmount = parseFloat(amount)
  const dueDate = new Date(nextDueDate ?? new Date())
  const shouldPostInvoice = invoiceReceived === true
  const invoiceDate = invoiceReceivedDate ? new Date(invoiceReceivedDate) : new Date()

  // ── ATOMIC: create bill + GL journal entry if invoiceReceived=true ─────────
  // If invoiceReceived=true on creation, we post to the GL immediately.
  // The bill status and GL entry are committed together or not at all.
  let bill: Awaited<ReturnType<typeof prisma.financeRecurringBill.create>>
  try {
    bill = await prisma.$transaction(async (tx) => {
      return tx.financeRecurringBill.create({
        data: {
          name,
          amount: parsedAmount,
          accountId: accountId ?? null,
          categoryId: categoryId ?? null,
          vendorId: vendorId ?? null,
          frequency,
          dayOfMonth: dayOfMonth != null ? parseInt(dayOfMonth, 10) : null,
          monthOfYear: monthOfYear != null ? parseInt(monthOfYear, 10) : null,
          nextDueDate: dueDate,
          endDate: endDate ? new Date(endDate) : null,
          isActive: isActive ?? true,
          autoPay: autoPay ?? false,
          emailReminder: emailReminder ?? false,
          reminderDays: reminderDays != null ? parseInt(reminderDays, 10) : 3,
          notes: notes ?? null,
          memberId: memberId ?? null,
          locationId: locationId ?? null,
          billType: billType ?? 'recurring',
          recurrenceInterval: recurrenceInterval ?? null,
          invoiceReceived: shouldPostInvoice,
          invoiceReceivedDate: shouldPostInvoice ? invoiceDate : null,
          paid: paid ?? false,
          paidDate: paidDate ? new Date(paidDate) : null,
          entityId: entityId ?? null,
          taxClassification: taxClassification ?? null,
          familyId: session.familyId,
        },
      })
    })
  } catch (err) {
    console.error('[bills POST] Failed to create bill:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to create bill: ${msg}` }, { status: 500 })
  }

  // ── Post to GL if invoiceReceived=true ─────────────────────────────────────
  // Done outside the create transaction so the bill ID exists for the journal.
  // Materialise custom journal split as a draft first (if provided).
  // GL-FIRST: when the client sends explicit `journalLines` (e.g. a 3-line GST
  // split), write them as a draft journal entry BEFORE posting. Then
  // postBillToGL's existing "promote balanced draft as-is" branch will preserve
  // the user's split end-to-end. Without this step, postBillToGL falls through
  // to its hardcoded 2-line DR Expense / CR AP default and the GST line is lost.
  //
  // This step runs for BOTH posted and unposted bills:
  //   - shouldPostInvoice=false: ends here, bill keeps the draft journal for later promotion
  //   - shouldPostInvoice=true:  draft is then promoted by postBillToGL below
  let draftJeId: string | null = null
  if (Array.isArray(journalLines) && journalLines.length >= 2) {
    try {
      draftJeId = await upsertBillDraftJournal(
        bill.id, name, null, journalLines, dueDate, session.familyId, entityId ?? null,
      )
      await prisma.financeRecurringBill.update({
        where: { id: bill.id },
        data: { journalEntryId: draftJeId },
      })
    } catch (err) {
      // Custom lines failed validation (e.g. unbalanced or invalid GL accounts).
      // Surface as 422 and delete the orphan bill so it doesn't sit without
      // a journal entry the user thought they saved.
      console.error('[bills POST] Failed to save draft journal from custom lines:', err)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      await prisma.financeRecurringBill.delete({ where: { id: bill.id } }).catch(() => {})
      return NextResponse.json(
        { error: `Failed to save journal lines: ${msg}` },
        { status: 422 }
      )
    }
  }

  if (shouldPostInvoice && categoryId) {
    try {
      const journalEntryId = await postBillToGL(
        bill.id,
        name,
        parsedAmount,
        categoryId,
        entityId ?? null,
        session.familyId,
        invoiceDate,
        draftJeId,
      )
      if (journalEntryId !== draftJeId) {
        await prisma.financeRecurringBill.update({
          where: { id: bill.id },
          data: { journalEntryId },
        })
      }
    } catch (err) {
      // GL posting failed — roll back the bill's invoiceReceived status
      console.error('[bills POST] GL posting failed, reverting invoiceReceived:', err)
      await prisma.financeRecurringBill.update({
        where: { id: bill.id },
        data: { invoiceReceived: false, invoiceReceivedDate: null },
      })
      return NextResponse.json(
        { error: 'Failed to post to General Ledger. Bill saved as draft.' },
        { status: 422 }
      )
    }
  }

  // No `else if` for the unposted+lines case: handled by the unconditional
  // upsertBillDraftJournal step above so the draft is always written when
  // lines are provided, regardless of posting state.

  try {
    const finalBill = await prisma.financeRecurringBill.findFirst({
      where: { id: bill.id },
      include: BILL_INCLUDE,
    })
    const result = finalBill ? { ...finalBill, isGlPosted: (finalBill as any).journalEntry?.isPosted === true } : bill
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[bills POST] Final fetch failed (bill was saved):', err)
    return NextResponse.json({ ...bill, isGlPosted: false }, { status: 201 })
  }
}

// ── PUT ───────────────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const {
    id, name, amount, accountId, categoryId, frequency,
    dayOfMonth, monthOfYear, nextDueDate, endDate,
    isActive, autoPay, emailReminder, reminderDays,
    notes, memberId, locationId, vendorId,
    billType, recurrenceInterval,
    invoiceReceived, invoiceReceivedDate,
    paid, paidDate, entityId, taxClassification,
    journalLines,
  } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeRecurringBill.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

  const bill = await prisma.financeRecurringBill.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(amount !== undefined && { amount: parseFloat(amount) }),
      ...(accountId !== undefined && { accountId: accountId ?? null }),
      ...(categoryId !== undefined && { categoryId: categoryId ?? null }),
      ...(frequency !== undefined && { frequency }),
      ...(dayOfMonth !== undefined && { dayOfMonth: dayOfMonth != null ? parseInt(dayOfMonth, 10) : null }),
      ...(monthOfYear !== undefined && { monthOfYear: monthOfYear != null ? parseInt(monthOfYear, 10) : null }),
      ...(nextDueDate !== undefined && { nextDueDate: new Date(nextDueDate) }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(isActive !== undefined && { isActive }),
      ...(autoPay !== undefined && { autoPay }),
      ...(emailReminder !== undefined && { emailReminder }),
      ...(reminderDays !== undefined && { reminderDays: parseInt(reminderDays, 10) }),
      ...(notes !== undefined && { notes: notes ?? null }),
      ...(memberId !== undefined && { memberId: memberId ?? null }),
      ...(locationId !== undefined && { locationId: locationId ?? null }),
      ...(vendorId !== undefined && { vendorId: vendorId ?? null }),
      ...(billType !== undefined && { billType }),
      ...(recurrenceInterval !== undefined && { recurrenceInterval: recurrenceInterval ?? null }),
      ...(invoiceReceived !== undefined && { invoiceReceived }),
      ...(invoiceReceivedDate !== undefined && { invoiceReceivedDate: invoiceReceivedDate ? new Date(invoiceReceivedDate) : null }),
      ...(paid !== undefined && { paid }),
      ...(paidDate !== undefined && { paidDate: paidDate ? new Date(paidDate) : null }),
      ...(entityId !== undefined && { entityId: entityId ?? null }),
      ...(taxClassification !== undefined && { taxClassification: taxClassification ?? null }),
    },
    include: BILL_INCLUDE,
  })

  // If invoiceReceived is transitioning false->true, post the GL accrual journal
  const invoiceReceivedTransition = invoiceReceived === true && !existing.invoiceReceived
  const hasCustomLines = Array.isArray(journalLines) && journalLines.length >= 2

  // Step 1: refresh the draft journal from custom lines if provided.
  // GL-FIRST: when the client sends explicit `journalLines`, write them as a
  // draft entry FIRST (or update an existing unposted draft). This ensures any
  // subsequent posting step finds the user's split as a balanced draft to
  // promote, rather than falling back to a hardcoded 2-line auto entry.
  //
  // Skipped when the bill is already posted — a posted journal is locked and
  // must not be silently overwritten by an edit form save.
  let workingJeId: string | null = existing.journalEntryId ?? null
  if (hasCustomLines && !existing.invoiceReceived) {
    try {
      workingJeId = await upsertBillDraftJournal(
        bill.id,
        name ?? existing.name,
        workingJeId,
        journalLines,
        nextDueDate ? new Date(nextDueDate) : existing.nextDueDate,
        session.familyId,
        entityId !== undefined ? (entityId ?? null) : existing.entityId,
      )
      if (workingJeId !== (existing.journalEntryId ?? null)) {
        await prisma.financeRecurringBill.update({
          where: { id: bill.id },
          data: { journalEntryId: workingJeId },
        })
      }
    } catch (err) {
      // Unbalanced or invalid lines. Surface as 422 so the user is told their
      // split was rejected. The bill's other field updates have already been
      // saved; the journal entry is not modified.
      console.error('[bills PUT] Failed to upsert draft journal:', err)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json(
        { error: `Failed to save journal lines: ${msg}` },
        { status: 422 }
      )
    }
  }

  // Step 2: promote to posted if the user is transitioning false->true.
  // postBillToGL finds the just-written balanced draft via workingJeId and
  // promotes it as-is, preserving any custom split (e.g. 3-line GST entry).
  if (invoiceReceivedTransition) {
    try {
      const effectiveCategoryId = categoryId ?? existing.categoryId
      if (effectiveCategoryId) {
        const journalEntryId = await postBillToGL(
          bill.id,
          name ?? existing.name,
          amount !== undefined ? parseFloat(amount) : existing.amount,
          effectiveCategoryId,
          entityId !== undefined ? (entityId ?? null) : existing.entityId,
          session.familyId,
          invoiceReceivedDate ? new Date(invoiceReceivedDate) : new Date(),
          workingJeId,
        )
        if (journalEntryId !== workingJeId) {
          await prisma.financeRecurringBill.update({
            where: { id: bill.id },
            data: { journalEntryId },
          })
        }
      }
    } catch (err) {
      console.error('[bills PUT] Failed to post GL on invoiceReceived transition:', err)
    }
  }

  // No separate "else if" for the draft-only update case: handled by Step 1 above.

  const finalBill = await prisma.financeRecurringBill.findFirst({
    where: { id, familyId: session.familyId },
    include: BILL_INCLUDE,
  })
  return NextResponse.json(finalBill
    ? { ...finalBill, isGlPosted: (finalBill as any).journalEntry?.isPosted === true }
    : { ...bill, isGlPosted: false }
  )
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeRecurringBill.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

  // Pre-fetch all journals and transaction IDs OUTSIDE the transaction so
  // nextJournalReference reads committed DB state before any writes occur.

  // 1. Accrual journal (DR Expense / CR AP)
  const accrualJeId = existing.journalEntryId ?? null
  const accrualJe = accrualJeId
    ? await prisma.financeJournalEntry.findFirst({
        where: { id: accrualJeId, familyId: session.familyId },
        include: { lines: true },
      })
    : null
  const needsAccrualReversal = accrualJe?.isPosted === true && !accrualJe.isReversed

  // 2. Payment journals (DR AP / CR Bank) — one per installment
  const allPayments = await prisma.financeBillPayment.findMany({
    where: { billId: id, familyId: session.familyId },
    select: { transactionId: true, journalEntryId: true },
  })
  type JournalWithLines = NonNullable<Awaited<ReturnType<typeof prisma.financeJournalEntry.findFirst<{ include: { lines: true } }>>>>
  const paymentJournalsToReverse: JournalWithLines[] = []
  for (const p of allPayments) {
    if (!p.journalEntryId) continue
    const je = await prisma.financeJournalEntry.findFirst({
      where: { id: p.journalEntryId, familyId: session.familyId },
      include: { lines: true },
    })
    if (je?.isPosted && !je.isReversed) paymentJournalsToReverse.push(je)
  }

  // Generate all reversal refs in one call (nextJournalReference reads committed MAX)
  const totalRefs = (needsAccrualReversal ? 1 : 0) + paymentJournalsToReverse.length
  const allRefs = await nextNJournalReferences(session.familyId, totalRefs)
  let refIdx = 0
  const accrualRef  = needsAccrualReversal ? allRefs[refIdx++] : null
  const paymentRefs = paymentJournalsToReverse.map(() => allRefs[refIdx++])

  // Collect all transaction IDs to delete
  const txIdsToDelete = [
    existing.invoiceTxId,
    existing.paymentTxId,
    ...allPayments.map(p => p.transactionId),
  ].filter((v): v is string => !!v)

  // Atomic: reverse all GL journals, delete all transactions, delete the bill
  await prisma.$transaction(async (tx) => {
    // Reverse accrual journal (DR Expense / CR AP → DR AP / CR Expense)
    if (accrualJe && needsAccrualReversal && accrualRef) {
      await tx.financeJournalEntry.create({
        data: {
          reference: accrualRef,
          date: new Date(),
          description: `VOID: ${accrualJe.reference ?? accrualJe.id} — ${accrualJe.description}`,
          type: 'reversal',
          isPosted: true,
          reversalOfId: accrualJe.id,
          entityId: accrualJe.entityId,
          familyId: session.familyId,
          lines: {
            create: accrualJe.lines.map(l => ({
              glAccountId: l.glAccountId,
              side: l.side === 'debit' ? 'credit' : 'debit',
              amount: l.amount,
              description: l.description,
            })),
          },
        },
      })
      await tx.financeJournalEntry.update({ where: { id: accrualJe.id }, data: { isReversed: true } })
    }

    // Reverse payment journals (DR AP / CR Bank → DR Bank / CR AP)
    for (let i = 0; i < paymentJournalsToReverse.length; i++) {
      const je = paymentJournalsToReverse[i]
      await tx.financeJournalEntry.create({
        data: {
          reference: paymentRefs[i],
          date: new Date(),
          description: `VOID: ${je.reference ?? je.id} — ${je.description}`,
          type: 'reversal',
          isPosted: true,
          reversalOfId: je.id,
          entityId: je.entityId,
          familyId: session.familyId,
          lines: {
            create: je.lines.map(l => ({
              glAccountId: l.glAccountId,
              side: l.side === 'debit' ? 'credit' : 'debit',
              amount: l.amount,
              description: l.description,
            })),
          },
        },
      })
      await tx.financeJournalEntry.update({ where: { id: je.id }, data: { isReversed: true } })
    }

    // Delete all associated transactions (invoice + payment legs)
    if (txIdsToDelete.length > 0) {
      await tx.financeTransaction.deleteMany({ where: { id: { in: txIdsToDelete }, familyId: session.familyId } })
    }

    // Delete the bill — FinanceBillPayment and BillAttachment cascade automatically
    await tx.financeRecurringBill.delete({ where: { id } })
  })
  return NextResponse.json({ success: true })
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const {
    id, paid, paidDate: paidDateRaw,
    invoiceReceived, invoiceReceivedDate,
    payFromAccountId, payFromGlAccountId, paymentAmount,
    void: doVoid, voidNote,
  } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeRecurringBill.findFirst({
    where: { id, familyId: session.familyId },
    include: { payments: { select: { amount: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

  // ══════════════════════════════════════════════════════════════════════════
  // UNDO invoiceReceived: reverse accrual + payment GL journals atomically
  // ══════════════════════════════════════════════════════════════════════════
  if (invoiceReceived === false && existing.invoiceReceived === true) {
    // Pre-fetch all journals and generate all reversal refs OUTSIDE the transaction.
    // nextJournalReference reads committed DB state — calls inside a $transaction
    // would all return the same reference number (uncommitted creates are invisible).
    // We collect everything here, then run a single atomic transaction with
    // pre-computed values.

    // 1. Accrual journal
    const accrualJeId = existing.journalEntryId ?? null
    const accrualJe = accrualJeId
      ? await prisma.financeJournalEntry.findFirst({
          where: { id: accrualJeId, familyId: session.familyId },
          include: { lines: true },
        })
      : null
    const needsAccrualReversal = accrualJe?.isPosted === true && !accrualJe.isReversed

    // 2. Payment journals (only if the bill was also paid)
    type PaymentInfo = { transactionId: string | null; journalEntryId: string | null }
    let paymentsInfo: PaymentInfo[] = []
    let paymentJournalsToReverse: Awaited<ReturnType<typeof prisma.financeJournalEntry.findFirst<{ include: { lines: true } }>>>[] = []
    if (existing.paid) {
      paymentsInfo = await prisma.financeBillPayment.findMany({
        where: { billId: id, familyId: session.familyId },
        select: { transactionId: true, journalEntryId: true },
      })
      for (const p of paymentsInfo) {
        if (!p.journalEntryId) continue
        const je = await prisma.financeJournalEntry.findFirst({
          where: { id: p.journalEntryId, familyId: session.familyId },
          include: { lines: true },
        })
        if (je?.isPosted && !je.isReversed) paymentJournalsToReverse.push(je)
      }
    }

    // Generate sequential refs: first for accrual (if needed), then for each payment
    const totalRefs = (needsAccrualReversal ? 1 : 0) + paymentJournalsToReverse.length
    const allRefs = await nextNJournalReferences(session.familyId, totalRefs)
    let refIdx = 0
    const accrualRef = needsAccrualReversal ? allRefs[refIdx++] : null
    const paymentRefs = paymentJournalsToReverse.map(() => allRefs[refIdx++])

    await prisma.$transaction(async (tx) => {
      // 1. Reverse the accrual GL journal (DR Expense / CR AP → DR AP / CR Expense)
      if (accrualJe && needsAccrualReversal && accrualRef) {
        await tx.financeJournalEntry.create({
          data: {
            reference: accrualRef,
            date: new Date(),
            description: `Reversal: ${accrualJe.description}`,
            type: 'reversal',
            isPosted: true,
            reversalOfId: accrualJe.id,
            entityId: accrualJe.entityId,
            familyId: session.familyId,
            lines: {
              create: accrualJe.lines.map(l => ({
                glAccountId: l.glAccountId,
                side: l.side === 'debit' ? 'credit' : 'debit',
                amount: l.amount,
                description: l.description,
              })),
            },
          },
        })
        await tx.financeJournalEntry.update({ where: { id: accrualJe.id }, data: { isReversed: true } })
      }

      // 2. Delete invoice transaction
      const invoiceTxId: string | null = existing.invoiceTxId ?? null
      if (invoiceTxId) {
        await tx.financeTransaction.deleteMany({ where: { id: invoiceTxId, familyId: session.familyId } })
      }

      // 3. If also paid: reverse payment GL journals + delete payment records
      if (existing.paid) {
        // Reverse payment journals (DR AP / CR Bank → DR Bank / CR AP)
        for (let i = 0; i < paymentJournalsToReverse.length; i++) {
          const je = paymentJournalsToReverse[i]
          if (!je) continue
          await tx.financeJournalEntry.create({
            data: {
              reference: paymentRefs[i],
              date: new Date(),
              description: `VOID: ${je.reference ?? je.id} — ${je.description}`,
              type: 'reversal',
              isPosted: true,
              reversalOfId: je.id,
              entityId: je.entityId,
              familyId: session.familyId,
              lines: {
                create: je.lines.map(l => ({
                  glAccountId: l.glAccountId,
                  side: l.side === 'debit' ? 'credit' : 'debit',
                  amount: l.amount,
                  description: l.description,
                })),
              },
            },
          })
          await tx.financeJournalEntry.update({ where: { id: je.id }, data: { isReversed: true } })
        }

        // Delete payment transactions
        const payTxIds = paymentsInfo.map(p => p.transactionId).filter(Boolean) as string[]
        if (payTxIds.length > 0) {
          await tx.financeTransaction.deleteMany({ where: { id: { in: payTxIds }, familyId: session.familyId } })
        }
        await tx.financeBillPayment.deleteMany({ where: { billId: id, familyId: session.familyId } })

        // Recursively delete all unpaid descendant bills to prevent orphaned chains
        let currentParents = [id]
        while (currentParents.length > 0) {
          const children = await tx.financeRecurringBill.findMany({
            where: { parentBillId: { in: currentParents }, familyId: session.familyId, paid: false },
            select: { id: true },
          })
          const childIds = children.map((c: { id: string }) => c.id)
          if (childIds.length === 0) break
          await tx.financeRecurringBill.deleteMany({ where: { id: { in: childIds }, familyId: session.familyId } })
          currentParents = childIds
        }
      }

      await tx.financeRecurringBill.update({
        where: { id },
        data: {
          invoiceReceived: false,
          invoiceReceivedDate: null,
          invoiceTxId: null,
          transactionId: null,
          paid: false,
          paidDate: null,
          paymentTxId: null,
        },
      })
    })

    const finalBill = await prisma.financeRecurringBill.findFirst({ where: { id, familyId: session.familyId }, include: BILL_INCLUDE })
    return NextResponse.json(finalBill ? { ...finalBill, isGlPosted: (finalBill as any).journalEntry?.isPosted === true } : { id })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UNDO paid: reverse payment GL journal + delete payment records
  // ══════════════════════════════════════════════════════════════════════════
  if (paid === false && existing.paid === true) {
    // Pre-fetch payment journal entries for reversal (outside $transaction)
    const allPayments = await prisma.financeBillPayment.findMany({
      where: { billId: id, familyId: session.familyId },
      select: { transactionId: true, journalEntryId: true },
    })

    // Pre-fetch posted journals that need reversing — collect first, generate
    // all N refs at once. nextJournalReference reads committed MAX so calling
    // it N times in a loop returns the same value each time (nothing committed yet).
    type JournalWithLines = NonNullable<Awaited<ReturnType<typeof prisma.financeJournalEntry.findFirst<{ include: { lines: true } }>>>>
    const journalsToReverse: JournalWithLines[] = []
    for (const p of allPayments) {
      if (!p.journalEntryId) continue
      const je = await prisma.financeJournalEntry.findFirst({
        where: { id: p.journalEntryId, familyId: session.familyId },
        include: { lines: true },
      })
      if (je?.isPosted && !je.isReversed) journalsToReverse.push(je)
    }
    const reversalRefs = await nextNJournalReferences(session.familyId, journalsToReverse.length)
    const reversalOps = journalsToReverse.map((journal, i) => ({ journal, ref: reversalRefs[i] }))

    await prisma.$transaction(async (tx) => {
      // 1. Create reversal journals for each posted payment journal
      for (const { journal, ref } of reversalOps) {
        await tx.financeJournalEntry.create({
          data: {
            reference: ref,
            date: new Date(),
            description: `VOID: ${journal.reference ?? journal.id} — ${journal.description}`,
            type: 'reversal',
            isPosted: true,
            reversalOfId: journal.id,
            entityId: journal.entityId,
            familyId: session.familyId,
            lines: {
              create: journal.lines.map(l => ({
                glAccountId: l.glAccountId,
                side: l.side === 'debit' ? 'credit' : 'debit',
                amount: l.amount,
                description: l.description,
              })),
            },
          },
        })
        await tx.financeJournalEntry.update({
          where: { id: journal.id },
          data: { isReversed: true },
        })
      }

      // 2. Delete payment transaction records
      const txIds = allPayments.map(p => p.transactionId).filter(Boolean) as string[]
      if (txIds.length > 0) {
        await tx.financeTransaction.deleteMany({ where: { id: { in: txIds }, familyId: session.familyId } })
      }

      // 3. Delete payment records
      await tx.financeBillPayment.deleteMany({ where: { billId: id, familyId: session.familyId } })
      // Recursively delete all unpaid descendant bills (Bug 6 fix)
      let currentParents = [id]
      while (currentParents.length > 0) {
        const children = await tx.financeRecurringBill.findMany({
          where: { parentBillId: { in: currentParents }, familyId: session.familyId, paid: false },
          select: { id: true },
        })
        const childIds = children.map((c: { id: string }) => c.id)
        if (childIds.length === 0) break
        await tx.financeRecurringBill.deleteMany({
          where: { id: { in: childIds }, familyId: session.familyId },
        })
        currentParents = childIds
      }
      // Re-open invoice tx so AP is outstanding again
      const invoiceTxId: string | null = existing.invoiceTxId ?? null
      if (invoiceTxId) {
        await tx.financeTransaction.updateMany({
          where: { id: invoiceTxId, familyId: session.familyId },
          data: { isCleared: false, reconciledDate: null },
        })
      }
      await tx.financeRecurringBill.update({
        where: { id },
        data: { paid: false, paidDate: null, paymentTxId: null },
      })
    })

    const finalBill = await prisma.financeRecurringBill.findFirst({ where: { id, familyId: session.familyId }, include: BILL_INCLUDE })
    return NextResponse.json(finalBill ? { ...finalBill, isGlPosted: (finalBill as any).journalEntry?.isPosted === true } : { id })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STAGE 1: Invoice received → ATOMIC GL WRITE (DR Expense / CR AP)
  // ══════════════════════════════════════════════════════════════════════════
  if (invoiceReceived === true && !existing.invoiceReceived) {
    if (!existing.categoryId) {
      return NextResponse.json({ error: 'Bill must have an expense category before posting' }, { status: 400 })
    }

    const invoiceDate = invoiceReceivedDate ? new Date(invoiceReceivedDate) : new Date()

    // ATOMIC: post to GL + update bill status together
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Post the journal entry to the GL
        const apCategoryId = await ensureAccountsPayableCategory(session.familyId)

        // Check for existing draft journal to post
        const existingJeId: string | null = existing.journalEntryId ?? null
        let journalEntryId: string

        // GL-FIRST: if a draft journal exists with balanced lines (e.g. a user-entered
        // GST split), promote it to posted rather than discarding it and building a
        // generic 2-line DR expense / CR AP entry. The user's custom split IS the
        // authoritative GL record — always honour it.
        if (existingJeId) {
          const existingJe = await tx.financeJournalEntry.findFirst({
            where: { id: existingJeId, familyId: session.familyId },
            include: { lines: true },
          })
          if (existingJe && !existingJe.isPosted && existingJe.lines.length >= 2) {
            const dr = existingJe.lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
            const cr = existingJe.lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
            if (Math.abs(dr - cr) <= 0.005) {
              // ✅ Balanced draft — promote as-is; preserves GST splits and any
              //    custom lines the user configured in the journal lines editor.
              await tx.financeJournalEntry.update({
                where: { id: existingJeId },
                data: { isPosted: true, date: invoiceDate },
              })
              journalEntryId = existingJeId
            } else {
              // Unbalanced draft — fall back to standard 2-line auto entry
              const reference = await nextJournalReference(session.familyId)
              const je = await tx.financeJournalEntry.create({
                data: {
                  reference,
                  date: invoiceDate,
                  description: existing.name,
                  type: 'auto_transaction',
                  isPosted: true,
                  entityId: existing.entityId ?? null,
                  familyId: session.familyId,
                  lines: {
                    create: [
                      { glAccountId: existing.categoryId!, side: 'debit',  amount: existing.amount, description: existing.name },
                      { glAccountId: apCategoryId,         side: 'credit', amount: existing.amount, description: `AP: ${existing.name}` },
                    ],
                  },
                },
                select: { id: true },
              })
              journalEntryId = je.id
            }
          } else {
            // Already posted or has no lines — create fresh standard entry
            const reference = await nextJournalReference(session.familyId)
            const je = await tx.financeJournalEntry.create({
              data: {
                reference,
                date: invoiceDate,
                description: existing.name,
                type: 'auto_transaction',
                isPosted: true,
                entityId: existing.entityId ?? null,
                familyId: session.familyId,
                lines: {
                  create: [
                    { glAccountId: existing.categoryId!, side: 'debit',  amount: existing.amount, description: existing.name },
                    { glAccountId: apCategoryId,         side: 'credit', amount: existing.amount, description: `AP: ${existing.name}` },
                  ],
                },
              },
              select: { id: true },
            })
            journalEntryId = je.id
          }
        } else {
          // No draft journal at all — create standard 2-line entry
          const reference = await nextJournalReference(session.familyId)
          const je = await tx.financeJournalEntry.create({
            data: {
              reference,
              date: invoiceDate,
              description: existing.name,
              type: 'auto_transaction',
              isPosted: true,
              entityId: existing.entityId ?? null,
              familyId: session.familyId,
              lines: {
                create: [
                  { glAccountId: existing.categoryId!, side: 'debit',  amount: existing.amount, description: existing.name },
                  { glAccountId: apCategoryId,         side: 'credit', amount: existing.amount, description: `AP: ${existing.name}` },
                ],
              },
            },
            select: { id: true },
          })
          journalEntryId = je.id
        }

        // 2. Create the invoice transaction record (for backward compat tracking)
        const invoiceTx = await tx.financeTransaction.create({
          data: {
            type: 'expense',
            amount: existing.amount,
            accountId: existing.accountId,
            categoryId: existing.categoryId,
            description: `${existing.name} (invoice received)`,
            date: invoiceDate,
            isRecurring: existing.billType !== 'one-off',
            recurringBillId: existing.id,
            vendorId: existing.vendorId,
            notes: existing.notes,
            memberId: existing.memberId,
            locationId: existing.locationId,
            isCleared: false,
            isTransfer: false,
            createdBy: session.id,
            familyId: session.familyId,
            entityId: existing.entityId,
            taxClassification: existing.taxClassification ?? null,
          },
        })

        // 3. Update bill status ATOMICALLY with the GL write
        await tx.financeRecurringBill.update({
          where: { id },
          data: {
            invoiceReceived: true,
            invoiceReceivedDate: invoiceDate,
            invoiceTxId: invoiceTx.id,
            transactionId: invoiceTx.id,
            journalEntryId,
          },
        })
      })
    } catch (err) {
      console.error('[bills PATCH] ATOMIC invoice posting failed:', err)
      return NextResponse.json(
        { error: 'Failed to post bill to General Ledger. No changes were saved.' },
        { status: 422 }
      )
    }

    const finalBill = await prisma.financeRecurringBill.findFirst({ where: { id, familyId: session.familyId }, include: BILL_INCLUDE })
    return NextResponse.json(finalBill ? { ...finalBill, isGlPosted: (finalBill as any).journalEntry?.isPosted === true } : { id })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STAGE 2: Bill paid → ATOMIC GL WRITE
  // ══════════════════════════════════════════════════════════════════════════
  if (paid === true && !existing.paid) {
    const actualPaidDate = paidDateRaw ? new Date(paidDateRaw) : new Date()
    const payAmount = paymentAmount ?? existing.amount
    const bankGlAccountId: string | null = payFromGlAccountId ?? null
    const paymentAccountId = payFromAccountId ?? existing.accountId

    // Determine if this payment fully covers the bill (including prior partial payments)
    const priorPaid = (existing.payments ?? []).reduce((s, p) => s + p.amount, 0)
    const isFullyPaid = (priorPaid + payAmount) >= existing.amount - 0.005

    let spawnedBillId: string | null = null
    let spawnedBillDueDate: Date | null = null

    try {
      await prisma.$transaction(async (tx) => {
        const apCategoryId = await ensureAccountsPayableCategory(session.familyId)

        // ── GL-FIRST payment journal logic ────────────────────────────────────
        //
        // Two accounting paths depending on whether the bill was accrued first:
        //
        // PATH A — Invoice was posted first (invoiceReceived=true):
        //   Stage 1 created: DR Expense / CR AP  (liability recognised)
        //   Stage 2 clears:  DR AP     / CR Bank  (liability settled)
        //   Net effect:      DR Expense / CR Bank  ✓ expense hits P&L via stage 1
        //
        // PATH B — Direct payment, no prior accrual (invoiceReceived=false):
        //   No stage 1 journal exists — AP was never credited.
        //   Wrong:  DR AP / CR Bank  → debits a liability that was never created;
        //           expense never reaches P&L (the original bug).
        //   Correct: DR Expense / CR Bank → single combined journal; expense hits
        //            P&L immediately and the GL remains balanced.
        //
        // We detect the path via existing.invoiceReceived rather than checking
        // whether a journal entry physically exists — invoiceReceived is the
        // canonical flag for "stage 1 has been committed".
        const wasAccrued = existing.invoiceReceived === true
        const expenseCategoryId = existing.categoryId  // may be null — handled below

        // Create payment GL journal — only if we have a bank GL account to credit
        let paymentJournalId: string | null = null
        if (bankGlAccountId) {
          const reference = await nextJournalReference(session.familyId)

          let journalLines: { glAccountId: string; side: 'debit' | 'credit'; amount: number; description: string }[]

          if (wasAccrued) {
            // PATH A: clear the AP liability that stage 1 created
            journalLines = [
              { glAccountId: apCategoryId,    side: 'debit',  amount: payAmount, description: `Clear AP: ${existing.name}` },
              { glAccountId: bankGlAccountId, side: 'credit', amount: payAmount, description: `Payment: ${existing.name}` },
            ]
          } else if (expenseCategoryId) {
            // PATH B: no prior accrual — combine expense recognition + cash outflow
            // into a single journal so the expense hits the P&L in the same period
            // as the cash payment. This is correct cash-basis accounting.
            journalLines = [
              { glAccountId: expenseCategoryId, side: 'debit',  amount: payAmount, description: existing.name },
              { glAccountId: bankGlAccountId,   side: 'credit', amount: payAmount, description: `Payment: ${existing.name}` },
            ]
          } else {
            // No expense category and no prior accrual — fall back to AP debit so
            // the journal at least balances, but flag it (same behaviour as before
            // for uncategorised bills; user should assign a category).
            journalLines = [
              { glAccountId: apCategoryId,    side: 'debit',  amount: payAmount, description: `Payment (no category): ${existing.name}` },
              { glAccountId: bankGlAccountId, side: 'credit', amount: payAmount, description: `Payment: ${existing.name}` },
            ]
          }

          const paymentJe = await tx.financeJournalEntry.create({
            data: {
              reference,
              date: actualPaidDate,
              description: `Payment: ${existing.name}`,
              type: 'auto_transaction',
              isPosted: true,
              entityId: existing.entityId ?? null,
              familyId: session.familyId,
              lines: { create: journalLines },
            },
            select: { id: true },
          })
          paymentJournalId = paymentJe.id
        }

        // Create payment transaction
        const paymentTx = await tx.financeTransaction.create({
          data: {
            type: 'expense',
            amount: payAmount,
            accountId: paymentAccountId,
            categoryId: existing.categoryId,
            description: `${existing.name} (payment)`,
            date: actualPaidDate,
            isRecurring: false,
            recurringBillId: existing.id,
            vendorId: existing.vendorId,
            notes: existing.notes,
            memberId: existing.memberId,
            locationId: existing.locationId,
            isCleared: true,
            reconciledDate: actualPaidDate,
            isTransfer: false,
            glAccountId: bankGlAccountId,
            createdBy: session.id,
            familyId: session.familyId,
            entityId: existing.entityId,
            taxClassification: existing.taxClassification ?? null,
          },
        })

        // Create FinanceBillPayment record — journalEntryId links the GL entry for reversal on undo
        await tx.financeBillPayment.create({
          data: {
            billId: id,
            amount: payAmount,
            paymentDate: actualPaidDate,
            accountId: paymentAccountId ?? null,
            glAccountId: bankGlAccountId,
            transactionId: paymentTx.id,
            journalEntryId: paymentJournalId,
            createdBy: session.id,
            familyId: session.familyId,
          },
        })

        // Mark invoice tx as cleared
        const invoiceTxId: string | null = existing.invoiceTxId ?? null
        if (invoiceTxId) {
          await tx.financeTransaction.updateMany({
            where: { id: invoiceTxId, familyId: session.familyId },
            data: {
              isCleared: true,
              reconciledDate: actualPaidDate,
              ...(bankGlAccountId ? { glAccountId: bankGlAccountId } : {}),
              ...(paymentAccountId ? { accountId: paymentAccountId } : {}),
            },
          })
        }

        // Update bill status atomically — only mark paid when fully covered
        await tx.financeRecurringBill.update({
          where: { id },
          data: isFullyPaid
            ? { paid: true, paidDate: actualPaidDate, paymentTxId: paymentTx.id }
            : { paymentTxId: paymentTx.id },
        })

        // Spawn next occurrence INSIDE the transaction — prevents disappearing bill bug
        // where the payment commits but the spawn fails (Bug 2 fix)
        if (existing.billType !== 'one-off' && isFullyPaid) {
          const newDueDate = advanceNextDueDate(existing.nextDueDate, existing.frequency)
          if (!existing.endDate || newDueDate <= existing.endDate) {
            const spawned = await tx.financeRecurringBill.create({
              data: {
                name: existing.name,
                amount: existing.amount,
                accountId: existing.accountId,
                categoryId: existing.categoryId,
                vendorId: existing.vendorId,
                frequency: existing.frequency,
                dayOfMonth: existing.dayOfMonth,
                monthOfYear: existing.monthOfYear,
                nextDueDate: newDueDate,
                endDate: existing.endDate,
                isActive: existing.isActive,
                autoPay: existing.autoPay,
                emailReminder: existing.emailReminder,
                reminderDays: existing.reminderDays,
                notes: existing.notes,
                memberId: existing.memberId,
                locationId: existing.locationId,
                billType: existing.billType,
                recurrenceInterval: existing.recurrenceInterval,
                invoiceReceived: false,
                invoiceReceivedDate: null,
                paid: false,
                paidDate: null,
                parentBillId: existing.id,
                entityId: existing.entityId,
                taxClassification: existing.taxClassification,
                familyId: session.familyId,
              },
              select: { id: true },
            })
            spawnedBillId = spawned.id
            spawnedBillDueDate = newDueDate
          }
        }
      })
    } catch (err) {
      console.error('[bills PATCH] ATOMIC payment posting failed:', err)
      return NextResponse.json(
        { error: 'Failed to record payment in General Ledger. No changes were saved.' },
        { status: 422 }
      )
    }

    // Copy parent journal lines to spawned bill draft — preserves custom splits (GST, etc.)
    // Must run OUTSIDE the payment transaction because upsertBillDraftJournal uses its own $transaction.
    if (spawnedBillId && spawnedBillDueDate && existing.journalEntryId) {
      try {
        const parentLines = await prisma.financeJournalLine.findMany({
          where: { journalEntryId: existing.journalEntryId },
          select: { glAccountId: true, side: true, amount: true, description: true },
        })
        if (parentLines.length >= 2) {
          const lines: JournalLine[] = parentLines.map(l => ({
            glAccountId: l.glAccountId,
            side: l.side as 'debit' | 'credit',
            amount: l.amount,
            description: l.description ?? undefined,
          }))
          const draftJeId = await upsertBillDraftJournal(
            spawnedBillId, existing.name, null, lines, spawnedBillDueDate, session.familyId, existing.entityId ?? null,
          )
          await prisma.financeRecurringBill.update({
            where: { id: spawnedBillId },
            data: { journalEntryId: draftJeId },
          })
        }
      } catch (err) {
        console.error('[bills PATCH] Failed to create draft journal for spawned bill:', err)
        // Non-fatal — spawned bill exists; user can set lines manually
      }
    }

    const finalBill = await prisma.financeRecurringBill.findFirst({ where: { id, familyId: session.familyId }, include: BILL_INCLUDE })
    return NextResponse.json(finalBill ? { ...finalBill, isGlPosted: (finalBill as any).journalEntry?.isPosted === true } : { id })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VOID: soft delete — reverse all GL journals, keep records for audit trail
  // ══════════════════════════════════════════════════════════════════════════
  if (doVoid === true && !existing.isVoided) {
    const accrualJeId = existing.journalEntryId ?? null
    const accrualJe = accrualJeId
      ? await prisma.financeJournalEntry.findFirst({
          where: { id: accrualJeId, familyId: session.familyId },
          include: { lines: true },
        })
      : null
    const needsAccrualReversal = accrualJe?.isPosted === true && !accrualJe.isReversed

    const allPayments = await prisma.financeBillPayment.findMany({
      where: { billId: id, familyId: session.familyId },
      select: { transactionId: true, journalEntryId: true },
    })
    type JournalWithLines = NonNullable<Awaited<ReturnType<typeof prisma.financeJournalEntry.findFirst<{ include: { lines: true } }>>>>
    const paymentJournalsToReverse: JournalWithLines[] = []
    for (const p of allPayments) {
      if (!p.journalEntryId) continue
      const je = await prisma.financeJournalEntry.findFirst({
        where: { id: p.journalEntryId, familyId: session.familyId },
        include: { lines: true },
      })
      if (je?.isPosted && !je.isReversed) paymentJournalsToReverse.push(je)
    }

    const totalRefs = (needsAccrualReversal ? 1 : 0) + paymentJournalsToReverse.length
    const allRefs = await nextNJournalReferences(session.familyId, totalRefs)
    let refIdx = 0
    const accrualRef = needsAccrualReversal ? allRefs[refIdx++] : null
    const paymentRefs = paymentJournalsToReverse.map(() => allRefs[refIdx++])

    await prisma.$transaction(async (tx) => {
      if (accrualJe && needsAccrualReversal && accrualRef) {
        await tx.financeJournalEntry.create({
          data: {
            reference: accrualRef,
            date: new Date(),
            description: `VOID: ${accrualJe.reference ?? accrualJe.id} — ${accrualJe.description}`,
            type: 'reversal',
            isPosted: true,
            reversalOfId: accrualJe.id,
            entityId: accrualJe.entityId,
            familyId: session.familyId,
            lines: {
              create: accrualJe.lines.map(l => ({
                glAccountId: l.glAccountId,
                side: l.side === 'debit' ? 'credit' : 'debit',
                amount: l.amount,
                description: l.description,
              })),
            },
          },
        })
        await tx.financeJournalEntry.update({ where: { id: accrualJe.id }, data: { isReversed: true } })
      }
      for (let i = 0; i < paymentJournalsToReverse.length; i++) {
        const je = paymentJournalsToReverse[i]
        await tx.financeJournalEntry.create({
          data: {
            reference: paymentRefs[i],
            date: new Date(),
            description: `VOID: ${je.reference ?? je.id} — ${je.description}`,
            type: 'reversal',
            isPosted: true,
            reversalOfId: je.id,
            entityId: je.entityId,
            familyId: session.familyId,
            lines: {
              create: je.lines.map(l => ({
                glAccountId: l.glAccountId,
                side: l.side === 'debit' ? 'credit' : 'debit',
                amount: l.amount,
                description: l.description,
              })),
            },
          },
        })
        await tx.financeJournalEntry.update({ where: { id: je.id }, data: { isReversed: true } })
      }
      await tx.financeRecurringBill.update({
        where: { id },
        data: { isVoided: true, voidedAt: new Date(), voidNote: voidNote ?? null },
      })
    })

    return NextResponse.json({ success: true, voided: true })
  }

  // ── Simple field update (no GL event) ────────────────────────────────────
  const updateData: Record<string, any> = {}
  if (paid !== undefined) { updateData.paid = paid; updateData.paidDate = paid ? (paidDateRaw ? new Date(paidDateRaw) : new Date()) : null }
  if (invoiceReceived !== undefined) { updateData.invoiceReceived = invoiceReceived; updateData.invoiceReceivedDate = invoiceReceived ? (invoiceReceivedDate ? new Date(invoiceReceivedDate) : new Date()) : null }

  const bill = await prisma.financeRecurringBill.update({ where: { id }, data: updateData, include: BILL_INCLUDE })
  return NextResponse.json({ ...bill, isGlPosted: (bill as any).journalEntry?.isPosted === true })
}
