import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { addMonths, addWeeks } from 'date-fns'
import { ensureAccountsPayableCategory } from '@/lib/finance-opening-balance'

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
  if (frequency === 'monthly') return addMonths(date, 1)
  if (frequency === 'fortnightly') return addWeeks(date, 2)
  if (frequency === 'weekly') return addWeeks(date, 1)
  if (frequency === 'quarterly') return addMonths(date, 3)
  if (frequency === 'yearly') return addMonths(date, 12)
  return addMonths(date, 1)
}

export async function PATCH(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, paid, paidDate: paidDateRaw, invoiceReceived, invoiceReceivedDate } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeRecurringBill.findFirst({ where: { id, familyId: session.familyId } })
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

  // ── Undo invoiceReceived: delete the AP staging transaction if it exists ────
  const existingAny = existing as any
  if (invoiceReceived === false && existing.invoiceReceived === true && existingAny.invoiceTxId) {
    await prisma.financeTransaction.deleteMany({
      where: { id: existingAny.invoiceTxId, familyId: session.familyId },
    })
    updateData.invoiceTxId = null
  }

  // ── Undo paid: delete spawned child bills & the auto-transaction ────────────
  if (paid === false && existing.paid === true) {
    if (existing.transactionId) {
      await prisma.financeTransaction.deleteMany({
        where: { id: existing.transactionId, familyId: session.familyId },
      })
      updateData.transactionId = null
    }
    await prisma.financeRecurringBill.deleteMany({
      where: { parentBillId: id, familyId: session.familyId, paid: false },
    })
  }

  const bill = await prisma.financeRecurringBill.update({
    where: { id },
    data: updateData,
    include: BILL_INCLUDE,
  })

  // ── Mark invoice received: create expense transaction (DR expense / notation) ──
  // Per finance notes: when invoice is received, the expense is recognised.
  // This creates the expense transaction so P&L shows the cost.
  // When subsequently paid, the payment transaction records cash leaving the bank.
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
          isCleared: false,  // Not yet cleared — cleared when actually paid
          isTransfer: false,
          createdBy: session.id,
          familyId: session.familyId,
          entityId: existing.entityId,
          taxClassification: (existing as any).taxClassification ?? null,
          reference: `AP:${apCategoryId}`,  // Tag as AP-linked for future reconciliation
        },
      })
      await prisma.financeRecurringBill.update({
        where: { id },
        data: { invoiceTxId: invoiceTx.id } as any,
      })
    } catch {
      // Best-effort; don't fail the whole invoice toggle
    }
  }

  // ── Mark paid: create/clear expense transaction + spawn next occurrence ────
  if (paid === true && !existing.paid) {
    const actualPaidDate = paidDateRaw ? new Date(paidDateRaw) : new Date()

    // If invoice was already received, there's an existing expense transaction to clear.
    // If not, create a new one. Either way, mark it cleared (cash has left the bank).
    try {
      const invoiceTxId = (existing as any).invoiceTxId
      let txId: string | null = invoiceTxId ?? null

      if (invoiceTxId) {
        // Invoice was already received — just mark that transaction as cleared
        await prisma.financeTransaction.update({
          where: { id: invoiceTxId },
          data: {
            isCleared: true,
            reconciledDate: actualPaidDate,
            date: actualPaidDate,
            accountId: existing.accountId,  // ensure linked to bank account
          },
        })
      } else {
        // No prior invoice transaction — create expense transaction now
        const tx = await prisma.financeTransaction.create({
          data: {
            type: 'expense',
            amount: existing.amount,
            accountId: existing.accountId,
            categoryId: existing.categoryId,
            payee: null,
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
            createdBy: session.id,
            familyId: session.familyId,
          },
        })
        txId = tx.id
      }

      await prisma.financeRecurringBill.update({
        where: { id },
        data: { transactionId: txId },
      })
    } catch {
      // Best-effort; don't fail the whole mark-paid
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

  return NextResponse.json(bill)
}
