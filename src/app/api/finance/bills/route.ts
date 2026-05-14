import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { addMonths, addWeeks } from 'date-fns'
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
async function upsertBillDraftJournal(
  billId: string,
  billName: string,
  existingJournalEntryId: string | null | undefined,
  lines: JournalLine[],
  date: Date,
  familyId: string,
  entityId: string | null,
): Promise<string> {
  const glIds = [...new Set(lines.map(l => l.glAccountId))]
  const validAccounts = await prisma.financeCategory.findMany({
    where: { id: { in: glIds }, familyId },
    select: { id: true },
  })
  if (validAccounts.length !== glIds.length) {
    throw new Error('One or more GL accounts not found')
  }

  if (existingJournalEntryId) {
    const existing = await prisma.financeJournalEntry.findFirst({
      where: { id: existingJournalEntryId, familyId },
    })
    if (existing && !existing.isPosted) {
      await prisma.financeJournalLine.deleteMany({ where: { journalEntryId: existingJournalEntryId } })
      await prisma.financeJournalEntry.update({
        where: { id: existingJournalEntryId },
        data: {
          date,
          description: billName,
          entityId: entityId ?? null,
          isPosted: false,   // Always draft — posting happens at invoiceReceived=true
          lines: {
            create: lines.map(l => ({
              glAccountId: l.glAccountId,
              side: l.side,
              amount: l.amount,
              description: l.description ?? null,
            })),
          },
        },
      })
      return existingJournalEntryId
    }
  }

  const reference = await nextJournalReference(familyId)
  const entry = await prisma.financeJournalEntry.create({
    data: {
      reference,
      date,
      description: billName,
      type: 'auto_transaction',
      isPosted: false,   // Draft until invoice received
      entityId: entityId ?? null,
      familyId,
      lines: {
        create: lines.map(l => ({
          glAccountId: l.glAccountId,
          side: l.side,
          amount: l.amount,
          description: l.description ?? null,
        })),
      },
    },
    select: { id: true },
  })
  return entry.id
}

function advanceNextDueDate(date: Date, frequency: string): Date {
  if (frequency === 'monthly')     return addMonths(date, 1)
  if (frequency === 'fortnightly') return addWeeks(date, 2)
  if (frequency === 'weekly')      return addWeeks(date, 1)
  if (frequency === 'quarterly')   return addMonths(date, 3)
  if (frequency === 'halfyearly')  return addMonths(date, 6)
  if (frequency === 'yearly')      return addMonths(date, 12)
  return addMonths(date, 1)
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await requireSession()
  const bills = await prisma.financeRecurringBill.findMany({
    where: { familyId: session.familyId },
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
        null,
      )
      await prisma.financeRecurringBill.update({
        where: { id: bill.id },
        data: { journalEntryId },
      })
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
  } else if (!shouldPostInvoice && Array.isArray(journalLines) && journalLines.length >= 2) {
    // Save draft journal lines for later posting
    try {
      const journalEntryId = await upsertBillDraftJournal(
        bill.id, name, null, journalLines, dueDate, session.familyId, entityId ?? null,
      )
      await prisma.financeRecurringBill.update({
        where: { id: bill.id },
        data: { journalEntryId },
      })
    } catch (err) {
      console.error('[bills POST] Failed to save draft journal:', err)
    }
  }

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

  // Update draft journal lines if provided and bill is not yet posted
  if (Array.isArray(journalLines) && journalLines.length >= 2 && !existing.invoiceReceived) {
    try {
      const existingJeId: string | null = existing.journalEntryId ?? null
      const journalEntryId = await upsertBillDraftJournal(
        bill.id,
        name ?? existing.name,
        existingJeId,
        journalLines,
        nextDueDate ? new Date(nextDueDate) : existing.nextDueDate,
        session.familyId,
        entityId !== undefined ? (entityId ?? null) : existing.entityId,
      )
      if (journalEntryId !== existingJeId) {
        await prisma.financeRecurringBill.update({
          where: { id: bill.id },
          data: { journalEntryId },
        })
      }
    } catch (err) {
      console.error('[bills PUT] Failed to upsert draft journal:', err)
    }
  }

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

  // If a posted journal entry exists, create a reversal before deleting
  if (existing.journalEntryId) {
    const je = await prisma.financeJournalEntry.findFirst({
      where: { id: existing.journalEntryId, familyId: session.familyId },
      include: { lines: true },
    })
    if (je?.isPosted && !je.isReversed) {
      // Create reversal journal
      const reference = await nextJournalReference(session.familyId)
      await prisma.financeJournalEntry.create({
        data: {
          reference,
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
      await prisma.financeJournalEntry.update({
        where: { id: je.id },
        data: { isReversed: true },
      })
    }
  }

  await prisma.financeRecurringBill.delete({ where: { id } })
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
  } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeRecurringBill.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

  // ══════════════════════════════════════════════════════════════════════════
  // UNDO invoiceReceived: reverse the GL journal entry + delete invoice tx
  // ══════════════════════════════════════════════════════════════════════════
  if (invoiceReceived === false && existing.invoiceReceived === true) {
    await prisma.$transaction(async (tx) => {
      // Reverse the GL journal if posted
      const jeId: string | null = existing.journalEntryId ?? null
      if (jeId) {
        const je = await tx.financeJournalEntry.findFirst({
          where: { id: jeId, familyId: session.familyId },
          include: { lines: true },
        })
        if (je?.isPosted && !je.isReversed) {
          const reference = await nextJournalReference(session.familyId)
          await tx.financeJournalEntry.create({
            data: {
              reference,
              date: new Date(),
              description: `Reversal: ${je.description}`,
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
      }

      // Delete invoice transaction
      const invoiceTxId: string | null = existing.invoiceTxId ?? null
      if (invoiceTxId) {
        await tx.financeTransaction.deleteMany({ where: { id: invoiceTxId, familyId: session.familyId } })
      }

      // If also paid, undo payment too
      if (existing.paid) {
        const payments = await tx.financeBillPayment.findMany({
          where: { billId: id, familyId: session.familyId },
          select: { transactionId: true },
        })
        const txIds = payments.map(p => p.transactionId).filter(Boolean) as string[]
        if (txIds.length > 0) {
          await tx.financeTransaction.deleteMany({ where: { id: { in: txIds }, familyId: session.familyId } })
        }
        await tx.financeBillPayment.deleteMany({ where: { billId: id, familyId: session.familyId } })
        await tx.financeRecurringBill.deleteMany({
          where: { parentBillId: id, familyId: session.familyId, paid: false },
        })
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
    await prisma.$transaction(async (tx) => {
      const payments = await tx.financeBillPayment.findMany({
        where: { billId: id, familyId: session.familyId },
        select: { transactionId: true },
      })
      const txIds = payments.map(p => p.transactionId).filter(Boolean) as string[]
      if (txIds.length > 0) {
        await tx.financeTransaction.deleteMany({ where: { id: { in: txIds }, familyId: session.familyId } })
      }
      await tx.financeBillPayment.deleteMany({ where: { billId: id, familyId: session.familyId } })
      await tx.financeRecurringBill.deleteMany({
        where: { parentBillId: id, familyId: session.familyId, paid: false },
      })
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

        if (existingJeId) {
          const existingJe = await tx.financeJournalEntry.findFirst({
            where: { id: existingJeId, familyId: session.familyId },
            include: { lines: true },
          })
          if (existingJe && !existingJe.isPosted && existingJe.lines.length >= 2) {
            const dr = existingJe.lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
            const cr = existingJe.lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
            if (Math.abs(dr - cr) <= 0.005) {
              await tx.financeJournalEntry.update({
                where: { id: existingJeId },
                data: { isPosted: true, date: invoiceDate },
              })
              journalEntryId = existingJeId
            } else {
              // Unbalanced draft — create fresh auto journal
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
            // Posted or no lines — create fresh
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
          // No existing journal — create fresh
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
  // STAGE 2: Bill paid → ATOMIC GL WRITE (DR AP / CR Bank)
  // ══════════════════════════════════════════════════════════════════════════
  if (paid === true && !existing.paid) {
    const actualPaidDate = paidDateRaw ? new Date(paidDateRaw) : new Date()
    const payAmount = paymentAmount ?? existing.amount
    const bankGlAccountId: string | null = payFromGlAccountId ?? null
    const paymentAccountId = payFromAccountId ?? existing.accountId

    try {
      await prisma.$transaction(async (tx) => {
        const apCategoryId = await ensureAccountsPayableCategory(session.familyId)

        // Create payment GL journal: DR AP / CR Bank — only if we have a bank GL account
        if (bankGlAccountId) {
          const reference = await nextJournalReference(session.familyId)
          await tx.financeJournalEntry.create({
            data: {
              reference,
              date: actualPaidDate,
              description: `Payment: ${existing.name}`,
              type: 'auto_transaction',
              isPosted: true,
              entityId: existing.entityId ?? null,
              familyId: session.familyId,
              lines: {
                create: [
                  { glAccountId: apCategoryId,    side: 'debit',  amount: payAmount, description: `Clear AP: ${existing.name}` },
                  { glAccountId: bankGlAccountId, side: 'credit', amount: payAmount, description: `Payment: ${existing.name}` },
                ],
              },
            },
          })
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

        // Create FinanceBillPayment record
        await tx.financeBillPayment.create({
          data: {
            billId: id,
            amount: payAmount,
            paymentDate: actualPaidDate,
            accountId: paymentAccountId ?? null,
            glAccountId: bankGlAccountId,
            transactionId: paymentTx.id,
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

        // Update bill status atomically
        await tx.financeRecurringBill.update({
          where: { id },
          data: {
            paid: true,
            paidDate: actualPaidDate,
            paymentTxId: paymentTx.id,
          },
        })
      })

      // Spawn next occurrence for recurring bills
      if (existing.billType !== 'one-off') {
        const newDueDate = advanceNextDueDate(existing.nextDueDate, existing.frequency)
        if (!existing.endDate || newDueDate <= existing.endDate) {
          await prisma.financeRecurringBill.create({
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
          })
        }
      }
    } catch (err) {
      console.error('[bills PATCH] ATOMIC payment posting failed:', err)
      return NextResponse.json(
        { error: 'Failed to record payment in General Ledger. No changes were saved.' },
        { status: 422 }
      )
    }

    const finalBill = await prisma.financeRecurringBill.findFirst({ where: { id, familyId: session.familyId }, include: BILL_INCLUDE })
    return NextResponse.json(finalBill ? { ...finalBill, isGlPosted: (finalBill as any).journalEntry?.isPosted === true } : { id })
  }

  // ── Simple field update (no GL event) ────────────────────────────────────
  const updateData: Record<string, any> = {}
  if (paid !== undefined) { updateData.paid = paid; updateData.paidDate = paid ? (paidDateRaw ? new Date(paidDateRaw) : new Date()) : null }
  if (invoiceReceived !== undefined) { updateData.invoiceReceived = invoiceReceived; updateData.invoiceReceivedDate = invoiceReceived ? (invoiceReceivedDate ? new Date(invoiceReceivedDate) : new Date()) : null }

  const bill = await prisma.financeRecurringBill.update({ where: { id }, data: updateData, include: BILL_INCLUDE })
  return NextResponse.json({ ...bill, isGlPosted: (bill as any).journalEntry?.isPosted === true })
}
