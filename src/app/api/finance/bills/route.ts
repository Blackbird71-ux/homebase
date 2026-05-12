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
  category: true,
  location: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
  entity: { select: { id: true, name: true, color: true, type: true } },
  payments: {
    select: { amount: true },
  },
  attachments: {
    select: { id: true, billId: true, title: true, fileName: true, fileSize: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
}

// ── Journal lines helper ────────────────────────────────────────────────────
// Creates or replaces the accrual journal entry linked to a bill.
// Lines: DR expense account(s) [+ GST ITC] / CR Accounts Payable
// The entry is posted immediately when balanced (DR = CR within 0.005).
// A draft is saved only when lines are unbalanced so the user can complete them.

interface JournalLine {
  glAccountId: string
  side: 'debit' | 'credit'
  amount: number
  description?: string
}

async function upsertBillJournalEntry(
  billId: string,
  billName: string,
  existingJournalEntryId: string | null | undefined,
  lines: JournalLine[],
  date: Date,
  familyId: string,
  entityId: string | null,
  session: { id: string },
): Promise<string> {
  // Validate GL accounts belong to this family
  const glIds = [...new Set(lines.map(l => l.glAccountId))]
  const validAccounts = await prisma.financeCategory.findMany({
    where: { id: { in: glIds }, familyId },
    select: { id: true },
  })
  if (validAccounts.length !== glIds.length) {
    throw new Error('One or more GL accounts not found')
  }

  // Determine if the lines are balanced — if so, post immediately.
  const totalDR = lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
  const totalCR = lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
  const isBalanced = Math.abs(totalDR - totalCR) <= 0.005

  // ACCOUNTING RULE: Bill journal entries are ALWAYS saved as drafts.
  // They should only be posted when the invoice is actually received (invoiceReceived=true).
  // Auto-posting a bill journal when the bill is merely created (not invoiced) would cause
  // the expense to appear on the P&L and Balance Sheet before any liability exists.
  // The PATCH handler for invoiceReceived=true posts the journal at the right time.
  const shouldPost = false  // Bills: always draft until invoice received
  void isBalanced  // balanced check kept for future use (e.g. validation)

  if (existingJournalEntryId) {
    // Replace lines on the existing draft entry
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
          isPosted: shouldPost,
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
      isPosted: shouldPost,
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

export async function GET() {
  const session = await requireSession()
  const bills = await prisma.financeRecurringBill.findMany({
    where: { familyId: session.familyId },
    include: BILL_INCLUDE,
    orderBy: { nextDueDate: 'asc' },
  })
  return NextResponse.json(bills)
}

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
    journalLines,   // optional: JournalLine[] for double-entry accrual
  } = json

  if (!name || !amount || !frequency) {
    return NextResponse.json({ error: 'Name, amount, and frequency are required' }, { status: 400 })
  }

  const bill = await prisma.financeRecurringBill.create({
    data: {
      name,
      amount: parseFloat(amount),
      accountId: accountId ?? null,
      categoryId: categoryId ?? null,
      vendorId: vendorId ?? null,
      frequency,
      dayOfMonth: dayOfMonth != null ? parseInt(dayOfMonth, 10) : null,
      monthOfYear: monthOfYear != null ? parseInt(monthOfYear, 10) : null,
      nextDueDate: new Date(nextDueDate ?? new Date()),
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
      invoiceReceived: invoiceReceived ?? false,
      invoiceReceivedDate: invoiceReceivedDate ? new Date(invoiceReceivedDate) : null,
      paid: paid ?? false,
      paidDate: paidDate ? new Date(paidDate) : null,
      entityId: entityId ?? null,
      taxClassification: taxClassification ?? null,
      familyId: session.familyId,
    },
    include: BILL_INCLUDE,
  })

  // If journal lines provided, create the draft accrual journal entry
  if (Array.isArray(journalLines) && journalLines.length >= 2) {
    try {
      const journalEntryId = await upsertBillJournalEntry(
        bill.id,
        bill.name,
        null,
        journalLines,
        new Date(nextDueDate ?? new Date()),
        session.familyId,
        entityId ?? null,
        session,
      )
      await prisma.financeRecurringBill.update({
        where: { id: bill.id },
        data: { journalEntryId },
      })
    } catch (err) {
      console.error('[bills POST] Failed to create journal entry:', err)
    }
  }

  return NextResponse.json(bill, { status: 201 })
}

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
    journalLines,   // optional: JournalLine[] for double-entry accrual
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

  // Upsert journal entry if lines provided
  if (Array.isArray(journalLines) && journalLines.length >= 2) {
    try {
      const existingJeId: string | null = existing.journalEntryId ?? null
      const journalEntryId = await upsertBillJournalEntry(
        bill.id,
        name ?? existing.name,
        existingJeId,
        journalLines,
        nextDueDate ? new Date(nextDueDate) : existing.nextDueDate,
        session.familyId,
        entityId !== undefined ? (entityId ?? null) : existing.entityId,
        session,
      )
      if (journalEntryId !== existingJeId) {
        await prisma.financeRecurringBill.update({
          where: { id: bill.id },
          data: { journalEntryId },
        })
      }
    } catch (err) {
      console.error('[bills PUT] Failed to upsert journal entry:', err)
    }
  }

  return NextResponse.json(bill)
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeRecurringBill.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

  await prisma.financeRecurringBill.delete({ where: { id } })
  return NextResponse.json({ success: true })
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

export async function PATCH(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, paid, paidDate: paidDateRaw, invoiceReceived, invoiceReceivedDate, payFromAccountId, payFromGlAccountId, paymentAmount } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeRecurringBill.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

  const updateData: Record<string, any> = {}

  if (paid !== undefined) {
    updateData.paid = paid
    const stampDate = paidDateRaw ? new Date(paidDateRaw) : new Date()
    updateData.paidDate = paid ? stampDate : null
  }

  if (invoiceReceived !== undefined) {
    updateData.invoiceReceived = invoiceReceived
    updateData.invoiceReceivedDate = invoiceReceived
      ? (invoiceReceivedDate ? new Date(invoiceReceivedDate) : new Date())
      : null
  }

  // ── Undo invoiceReceived: delete the expense (stage-1) transaction ────────
  if (invoiceReceived === false && existing.invoiceReceived === true) {
    const invoiceTxId: string | null = existing.invoiceTxId ?? null
    if (invoiceTxId) {
      await prisma.financeTransaction.deleteMany({
        where: { id: invoiceTxId, familyId: session.familyId },
      })
      updateData.invoiceTxId = null
      // Also clear transactionId if it pointed to the same tx
      if (existing.transactionId === invoiceTxId) updateData.transactionId = null
    }
    // Also revert the journal entry back to draft if it was posted with the invoice
    const jeId: string | null = (existing as any).journalEntryId ?? null
    if (jeId) {
      await prisma.financeJournalEntry.updateMany({
        where: { id: jeId, familyId: session.familyId, isPosted: true },
        data: { isPosted: false },
      })
    }
    // If we undo the invoice we must also undo paid (can't be paid without invoice)
    if (existing.paid) {
      const paymentTxId: string | null = existing.paymentTxId ?? null
      if (paymentTxId) {
        await prisma.financeTransaction.deleteMany({
          where: { id: paymentTxId, familyId: session.familyId },
        })
        updateData.paymentTxId = null
        if (existing.transactionId === paymentTxId) updateData.transactionId = null
      }
      updateData.paid = false
      updateData.paidDate = null
      // Remove spawned child occurrences
      await prisma.financeRecurringBill.deleteMany({
        where: { parentBillId: id, familyId: session.familyId, paid: false },
      })
    }
  }

  // ── Undo paid: delete stage-2 payment transaction + spawned children ─────
  if (paid === false && existing.paid === true) {
    // Check if there are FinanceBillPayment records (new partial-payment system)
    const paymentCount = await prisma.financeBillPayment.count({
      where: { billId: id, familyId: session.familyId },
    })

    if (paymentCount > 0) {
      // ── New payment system: delete all FinanceBillPayment records ─────────
      const payments = await prisma.financeBillPayment.findMany({
        where: { billId: id, familyId: session.familyId },
        select: { transactionId: true },
      })
      const txIds = payments.map(p => p.transactionId).filter(Boolean) as string[]

      // Delete linked transactions
      if (txIds.length > 0) {
        await prisma.financeTransaction.deleteMany({
          where: { id: { in: txIds }, familyId: session.familyId },
        })
      }

      // Delete payment records
      await prisma.financeBillPayment.deleteMany({
        where: { billId: id, familyId: session.familyId },
      })

      // Re-open stage-1 invoice tx (uncleared = AP still outstanding)
      const invoiceTxId: string | null = existing.invoiceTxId ?? null
      if (invoiceTxId) {
        await prisma.financeTransaction.updateMany({
          where: { id: invoiceTxId, familyId: session.familyId },
          data: { isCleared: false, reconciledDate: null },
        })
      }

      // Remove spawned children
      await prisma.financeRecurringBill.deleteMany({
        where: { parentBillId: id, familyId: session.familyId, paid: false },
      })

      updateData.paid = false
      updateData.paidDate = null
    } else {
      // ── Legacy payment system (single paymentTxId) ────────────────────────
      const paymentTxId: string | null = existing.paymentTxId ?? null
      if (paymentTxId) {
        await prisma.financeTransaction.deleteMany({
          where: { id: paymentTxId, familyId: session.familyId },
        })
        updateData.paymentTxId = null
        if (existing.transactionId === paymentTxId) updateData.transactionId = null
      } else if (existing.transactionId) {
        // Legacy: older records stored payment in transactionId directly
        await prisma.financeTransaction.deleteMany({
          where: { id: existing.transactionId, familyId: session.familyId },
        })
        updateData.transactionId = null
      }
      // Re-open stage-1 invoice tx (mark uncleared again so the expense stays on P&L
      // but is no longer treated as cash-out)
      const invoiceTxId: string | null = existing.invoiceTxId ?? null
      if (invoiceTxId) {
        await prisma.financeTransaction.updateMany({
          where: { id: invoiceTxId, familyId: session.familyId },
          data: { isCleared: false, reconciledDate: null },
        })
      }
      // Ensure the bill is restored to active/visible state
      updateData.isActive = true
      // Remove pending child occurrences that were spawned when paid
      await prisma.financeRecurringBill.deleteMany({
        where: { parentBillId: id, familyId: session.familyId, paid: false },
      })
    }
  }

  // Apply status field updates
  const bill = await prisma.financeRecurringBill.update({
    where: { id },
    data: updateData,
    include: BILL_INCLUDE,
  })

  // ── Stage 1: Invoice received → create expense transaction (DR expense) ───
  //
  // Accounting: when an invoice arrives, the expense is recognised immediately
  // (accrual basis). This creates an uncleared expense transaction against the
  // expense category. The AP liability side is tracked implicitly — the
  // uncleared transaction represents the amount owed.
  //
  // P&L effect: expense appears on P&L from this point forward.
  // Balance sheet effect: uncleared expense transactions reduce net worth
  //   (the balance sheet API reads uncleared bills for the AP liability line).
  if (invoiceReceived === true && !existing.invoiceReceived) {
    const invoiceDate = invoiceReceivedDate ? new Date(invoiceReceivedDate) : new Date()
    try {
      const apCategoryId = await ensureAccountsPayableCategory(session.familyId)
      const invoiceTx = await prisma.financeTransaction.create({
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
          isCleared: false,   // Uncleared = awaiting payment (AP outstanding)
          isTransfer: false,
          createdBy: session.id,
          familyId: session.familyId,
          entityId: existing.entityId,
          taxClassification: existing.taxClassification ?? null,
          // Reference encodes the AP category for the balance sheet to read
          reference: `AP:${apCategoryId}`,
        },
      })
      await prisma.financeRecurringBill.update({
        where: { id },
        data: {
          invoiceTxId: invoiceTx.id,
          transactionId: invoiceTx.id,  // keep legacy pointer
        },
      })
      // Post the linked journal entry now that the invoice is confirmed.
      // If no draft JE exists (bill created without journal lines), auto-create
      // DR expense / CR Accounts Payable and post it immediately so AP and the
      // expense account appear in the trial balance.
      const jeId: string | null = (existing as any).journalEntryId ?? null
      if (jeId) {
        await prisma.financeJournalEntry.updateMany({
          where: { id: jeId, familyId: session.familyId, isPosted: false },
          data: { isPosted: true, date: invoiceDate },
        })
      } else if (existing.categoryId) {
        const autoLines: JournalLine[] = [
          { glAccountId: existing.categoryId, side: 'debit',  amount: existing.amount },
          { glAccountId: apCategoryId,        side: 'credit', amount: existing.amount },
        ]
        const newJeId = await upsertBillJournalEntry(
          id, existing.name, null, autoLines,
          invoiceDate, session.familyId, existing.entityId ?? null, session,
        )
        await prisma.financeJournalEntry.update({
          where: { id: newJeId },
          data: { isPosted: true },
        })
        await prisma.financeRecurringBill.update({
          where: { id },
          data: { journalEntryId: newJeId },
        })
      }
    } catch (err) {
      console.error('[bills PATCH] Failed to create invoice transaction:', err)
    }
  }

  // ── Stage 2: Bill paid → create payment transaction (DR AP / CR bank) ────
  //
  // Accounting: cash leaves the nominated bank account. This is recorded as a
  // cleared expense transaction against the bank account. If a stage-1 invoice
  // transaction exists it is marked cleared (expense already on P&L); if not,
  // the payment transaction itself carries the expense.
  //
  // P&L effect: no change if invoice was already received (expense already counted).
  //   If skipping straight to paid (no prior invoice), expense hits P&L now.
  // Balance sheet effect: bank account balance decreases; AP liability clears.
  if (paid === true && !existing.paid) {
    const actualPaidDate = paidDateRaw ? new Date(paidDateRaw) : new Date()
    const payAmount = paymentAmount ?? existing.amount
    const isPartial = payAmount < existing.amount

    if (isPartial) {
      // ── PARTIAL PAYMENT path ──────────────────────────────────────────────
      // Record a partial payment via the FinanceBillPayment system, allowing
      // multiple installments against the same bill over time.
      const paymentAccountId = payFromAccountId ?? existing.accountId
      const paymentGlAccountId: string | null = payFromGlAccountId ?? null

      // Calculate total paid so far (excluding this payment)
      const existingPaymentsAgg = await prisma.financeBillPayment.aggregate({
        where: { billId: id, familyId: session.familyId },
        _sum: { amount: true },
      })
      const totalPaidBefore = existingPaymentsAgg._sum.amount ?? 0

      // Create a FinanceTransaction for this partial payment
      let transactionId: string | null = null
      try {
        const freshBill = await prisma.financeRecurringBill.findFirst({
          where: { id, familyId: session.familyId },
        })
        const invoiceTxId: string | null = freshBill?.invoiceTxId ?? null

        if (invoiceTxId) {
          // Case A: Invoice existed — create a cleared payment transaction
          // The uncleared invoice tx stays at full amount (expense already on P&L).
          const tx = await prisma.financeTransaction.create({
            data: {
              type: 'expense',
              amount: payAmount,
              accountId: paymentAccountId,
              categoryId: existing.categoryId,
              description: `${existing.name} (partial payment)`,
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
              glAccountId: paymentGlAccountId ?? null,
              createdBy: session.id,
              familyId: session.familyId,
              entityId: existing.entityId,
              taxClassification: existing.taxClassification ?? null,
            },
          })
          transactionId = tx.id
        } else {
          // Case B: No prior invoice — create a cleared expense tx for this installment
          const tx = await prisma.financeTransaction.create({
            data: {
              type: 'expense',
              amount: payAmount,
              accountId: paymentAccountId,
              categoryId: existing.categoryId,
              description: existing.name,
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
              glAccountId: paymentGlAccountId ?? null,
              createdBy: session.id,
              familyId: session.familyId,
              entityId: existing.entityId,
              taxClassification: existing.taxClassification ?? null,
            },
          })
          transactionId = tx.id
        }
      } catch (err) {
        console.error('[bills PATCH] Failed to create partial payment transaction:', err)
      }

      // Create the FinanceBillPayment record
      if (transactionId) {
        await prisma.financeBillPayment.create({
          data: {
            billId: id,
            amount: payAmount,
            paymentDate: actualPaidDate,
            accountId: paymentAccountId ?? null,
            glAccountId: paymentGlAccountId ?? null,
            transactionId,
            notes: null,
            createdBy: session.id,
            familyId: session.familyId,
          },
        })
      }

      // Update bill paid/paidDate based on cumulative total
      const newTotalPaid = totalPaidBefore + payAmount
      const newPaid = newTotalPaid >= existing.amount

      const latestPayment = await prisma.financeBillPayment.findFirst({
        where: { billId: id, familyId: session.familyId },
        orderBy: { paymentDate: 'desc' },
        select: { paymentDate: true },
      })

      // Override the earlier updateData.paid/paidDate (may have been set at top)
      updateData.paid = newPaid
      updateData.paidDate = latestPayment?.paymentDate ?? null

      // Only spawn next occurrence if fully paid
      if (newPaid && existing.billType !== 'one-off') {
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
              taxClassification: existing.taxClassification ?? null,
              familyId: session.familyId,
            },
          })
        }
      }
    } else {
      // ── FULL PAYMENT path (existing behavior) ──────────────────────────────
      const paymentAccountId = payFromAccountId ?? existing.accountId
      const paymentGlAccountId: string | null = payFromGlAccountId ?? null
      // Re-read the bill to get latest invoiceTxId (may have just been written above)
      const freshBill = await prisma.financeRecurringBill.findFirst({
        where: { id, familyId: session.familyId },
      })

      try {
        const invoiceTxId: string | null = freshBill?.invoiceTxId ?? null

        if (invoiceTxId) {
          // ── Case A: invoice was received — mark that tx cleared (cash out) ──
          await prisma.financeTransaction.update({
            where: { id: invoiceTxId },
            data: {
              isCleared: true,
              reconciledDate: actualPaidDate,
              date: actualPaidDate,
              // Use glAccountId when a GL category was selected; fall back to bank account
              ...(paymentGlAccountId
                ? { glAccountId: paymentGlAccountId, accountId: paymentAccountId }
                : { accountId: paymentAccountId }
              ),
            },
          })
          // paymentTxId points to the same tx (cleared invoice tx IS the payment)
          await prisma.financeRecurringBill.update({
            where: { id },
            data: { paymentTxId: invoiceTxId, transactionId: invoiceTxId },
          })
        } else {
          // ── Case B: no prior invoice — create a cleared expense tx now ──────
          // This is the single-step path (user marks paid without ticking invoice).
          // Expense and payment happen simultaneously.
          const tx = await prisma.financeTransaction.create({
            data: {
              type: 'expense',
              amount: existing.amount,
              accountId: paymentAccountId,
              categoryId: existing.categoryId,
              description: existing.name,
              date: actualPaidDate,
              isRecurring: existing.billType !== 'one-off',
              recurringBillId: existing.id,
              vendorId: existing.vendorId,
              notes: existing.notes,
              memberId: existing.memberId,
              locationId: existing.locationId,
              isCleared: true,
              reconciledDate: actualPaidDate,
              isTransfer: false,
              glAccountId: paymentGlAccountId,
              createdBy: session.id,
              familyId: session.familyId,
              entityId: existing.entityId,
              taxClassification: existing.taxClassification ?? null,
            },
          })
          await prisma.financeRecurringBill.update({
            where: { id },
            data: {
              paymentTxId: tx.id,
              transactionId: tx.id,
            },
          })
          // ── Auto GST split for Case B (direct-paid bill, no prior invoice) ────
          if (existing.categoryId) {
            try {
              const cat = await prisma.financeCategory.findFirst({
                where: { id: existing.categoryId, familyId: session.familyId },
                select: { gstApplicable: true, gstRate: true },
              })
              if (cat?.gstApplicable) {
                await createGstJournalEntry(
                  'expense',
                  existing.amount,
                  cat.gstRate ?? 10,
                  existing.categoryId,
                  paymentGlAccountId ?? null,
                  paymentAccountId ?? null,
                  actualPaidDate,
                  existing.name,
                  session.familyId,
                  existing.entityId ?? null,
                  session.id,
                )
              }
            } catch (err) {
              console.error('[bills PATCH Case B] GST journal failed:', err)
            }
          }
        }
      } catch (err) {
        console.error('[bills PATCH] Failed to create payment transaction:', err)
      }

      // Spawn the next occurrence for recurring bills
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
    }
  }

  // Re-fetch with includes so the response is fresh
  const finalBill = await prisma.financeRecurringBill.findFirst({
    where: { id, familyId: session.familyId },
    include: BILL_INCLUDE,
  })
  return NextResponse.json(finalBill ?? bill)
}
