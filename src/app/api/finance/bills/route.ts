import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { addMonths, addWeeks } from 'date-fns'

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
    paid, paidDate, entityId,
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
    paid, paidDate, entityId,
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
  const { id, paid, invoiceReceived, invoiceReceivedDate } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeRecurringBill.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

  const updateData: Record<string, any> = {}
  if (paid !== undefined) {
    updateData.paid = paid
    updateData.paidDate = paid ? new Date() : null
  }
  if (invoiceReceived !== undefined) {
    updateData.invoiceReceived = invoiceReceived
    updateData.invoiceReceivedDate = invoiceReceived
      ? (invoiceReceivedDate ? new Date(invoiceReceivedDate) : new Date())
      : null
  }

  if (paid === false && existing.paid === true) {
    await prisma.financeRecurringBill.deleteMany({
      where: { parentBillId: id, familyId: session.familyId, paid: false },
    })
  }

  const bill = await prisma.financeRecurringBill.update({
    where: { id },
    data: updateData,
    include: BILL_INCLUDE,
  })

  if (paid === true && existing.billType !== 'one-off') {
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
          entityId: existing.entityId,  // carry entity to next occurrence
          familyId: session.familyId,
        },
      })
    }
  }

  return NextResponse.json(bill)
}
