import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { addMonths, addWeeks } from 'date-fns'
import {
  ensureAccountsPayableCategory,
} from '@/lib/finance-opening-balance'

const BILL_INCLUDE = {
  account: { select: { id: true, name: true } },
  category: true,
  location: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
  entity: { select: { id: true, name: true, color: true, type: true } },
  attachments: {
    select: { id: true, billId: true, title: true, fileName: true, fileSize: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
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
  if (frequency === 'yearly')      return addMonths(date, 12)
  return addMonths(date, 1)
}

export async function PATCH(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, paid, paidDate: paidDateRaw, invoiceReceived, invoiceReceivedDate } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeRecurringBill.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

  const existingAny = existing as any
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
    const invoiceTxId: string | null = existingAny.invoiceTxId ?? null
    if (invoiceTxId) {
      await prisma.financeTransaction.deleteMany({
        where: { id: invoiceTxId, familyId: session.familyId },
      })
      updateData.invoiceTxId = null
      // Also clear transactionId if it pointed to the same tx
      if (existingAny.transactionId === invoiceTxId) updateData.transactionId = null
    }
    // If we undo the invoice we must also undo paid (can't be paid without invoice)
    if (existing.paid) {
      const paymentTxId: string | null = existingAny.paymentTxId ?? null
      if (paymentTxId) {
        await prisma.financeTransaction.deleteMany({
          where: { id: paymentTxId, familyId: session.familyId },
        })
        updateData.paymentTxId = null
        if (existingAny.transactionId === paymentTxId) updateData.transactionId = null
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
    const paymentTxId: string | null = existingAny.paymentTxId ?? null
    if (paymentTxId) {
      await prisma.financeTransaction.deleteMany({
        where: { id: paymentTxId, familyId: session.familyId },
      })
      updateData.paymentTxId = null
      if (existingAny.transactionId === paymentTxId) updateData.transactionId = null
    } else if (existingAny.transactionId) {
      // Legacy: older records stored payment in transactionId directly
      await prisma.financeTransaction.deleteMany({
        where: { id: existingAny.transactionId, familyId: session.familyId },
      })
      updateData.transactionId = null
    }
    // Re-open stage-1 invoice tx (mark uncleared again so the expense stays on P&L
    // but is no longer treated as cash-out)
    const invoiceTxId: string | null = existingAny.invoiceTxId ?? null
    if (invoiceTxId) {
      await prisma.financeTransaction.updateMany({
        where: { id: invoiceTxId, familyId: session.familyId },
        data: { isCleared: false, reconciledDate: null },
      })
    }
    // Remove pending child occurrences that were spawned when paid
    await prisma.financeRecurringBill.deleteMany({
      where: { parentBillId: id, familyId: session.familyId, paid: false },
    })
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
          taxClassification: (existing as any).taxClassification ?? null,
          // Reference encodes the AP category for the balance sheet to read
          reference: `AP:${apCategoryId}`,
        },
      })
      await prisma.financeRecurringBill.update({
        where: { id },
        data: {
          invoiceTxId: invoiceTx.id,
          transactionId: invoiceTx.id,  // keep legacy pointer
        } as any,
      })
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
    // Re-read the bill to get latest invoiceTxId (may have just been written above)
    const freshBill = await prisma.financeRecurringBill.findFirst({
      where: { id, familyId: session.familyId },
    }) as any

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
            // Ensure linked to the correct bank account
            accountId: existing.accountId,
          },
        })
        // paymentTxId points to the same tx (cleared invoice tx IS the payment)
        await prisma.financeRecurringBill.update({
          where: { id },
          data: { paymentTxId: invoiceTxId, transactionId: invoiceTxId } as any,
        })
      } else {
        // ── Case B: no prior invoice — create a cleared expense tx now ──────
        // This is the single-step path (user marks paid without ticking invoice).
        // Expense and payment happen simultaneously.
        const tx = await prisma.financeTransaction.create({
          data: {
            type: 'expense',
            amount: existing.amount,
            accountId: existing.accountId,
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
            createdBy: session.id,
            familyId: session.familyId,
            entityId: existing.entityId,
            taxClassification: (existing as any).taxClassification ?? null,
          },
        })
        await prisma.financeRecurringBill.update({
          where: { id },
          data: {
            paymentTxId: tx.id,
            transactionId: tx.id,
          } as any,
        })
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

  // Re-fetch with includes so the response is fresh
  const finalBill = await prisma.financeRecurringBill.findFirst({
    where: { id, familyId: session.familyId },
    include: BILL_INCLUDE,
  })
  return NextResponse.json(finalBill ?? bill)
}
