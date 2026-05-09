import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { addMonths, addWeeks } from 'date-fns'

const INCOME_INCLUDE = {
  account: { select: { id: true, name: true } },
  category: true,
  location: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
  entity: { select: { id: true, name: true, color: true, type: true, isDefault: true } },
  attachments: {
    select: { id: true, incomeId: true, title: true, fileName: true, fileSize: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
}

export async function GET() {
  const session = await requireSession()
  const entries = await prisma.financeIncomeEntry.findMany({
    where: { familyId: session.familyId },
    include: INCOME_INCLUDE,
    orderBy: { nextExpectedDate: 'asc' },
  })
  return NextResponse.json(entries)
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const {
    name, amount, accountId, categoryId, frequency,
    incomeType, nextExpectedDate, endDate,
    isActive, received, receivedDate,
    autoPay, emailReminder, reminderDays,
    dayOfMonth, monthOfYear, recurrenceInterval,
    invoiceReceived, invoiceReceivedDate,
    notes, memberId, locationId, entityId, vendorId,
    isTaxTracked, taxRate,
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
      familyId: session.familyId,
    },
    include: INCOME_INCLUDE,
  })

  return NextResponse.json(entry, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const {
    id, name, amount, accountId, categoryId, frequency,
    incomeType, nextExpectedDate, endDate,
    isActive, received, receivedDate,
    autoPay, emailReminder, reminderDays,
    dayOfMonth, monthOfYear, recurrenceInterval,
    invoiceReceived, invoiceReceivedDate,
    notes, memberId, locationId, entityId, vendorId,
    isTaxTracked, taxRate,
  } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeIncomeEntry.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Income entry not found' }, { status: 404 })

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
    },
    include: INCOME_INCLUDE,
  })

  return NextResponse.json(entry)
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeIncomeEntry.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Income entry not found' }, { status: 404 })

  await prisma.financeIncomeEntry.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

function advanceNextExpectedDate(date: Date, frequency: string): Date {
  if (frequency === 'monthly') return addMonths(date, 1)
  if (frequency === 'fortnightly') return addWeeks(date, 2)
  if (frequency === 'weekly') return addWeeks(date, 1)
  if (frequency === 'quarterly') return addMonths(date, 3)
  if (frequency === 'halfyearly') return addMonths(date, 6)
  if (frequency === 'yearly') return addMonths(date, 12)
  return addMonths(date, 1)
}

export async function PATCH(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, received, receivedDate: receivedDateRaw, invoiceReceived, invoiceReceivedDate } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeIncomeEntry.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Income entry not found' }, { status: 404 })

  const updateData: Record<string, any> = {}

  if (received !== undefined) {
    updateData.received = received
    // Use the caller-supplied date (which may be backdated) or fall back to now
    const stampDate = receivedDateRaw ? new Date(receivedDateRaw) : new Date()
    updateData.receivedDate = received ? stampDate : null
  }

  if (invoiceReceived !== undefined) {
    updateData.invoiceReceived = invoiceReceived
    updateData.invoiceReceivedDate = invoiceReceived
      ? (invoiceReceivedDate ? new Date(invoiceReceivedDate) : new Date())
      : null
  }

  // ── Undo received: delete spawned child occurrences & the auto-transaction ──
  if (received === false && existing.received === true) {
    // Delete the auto-created transaction if one exists
    if (existing.transactionId) {
      await prisma.financeTransaction.deleteMany({
        where: { id: existing.transactionId, familyId: session.familyId },
      })
      updateData.transactionId = null
    }
    // Remove pending child occurrences that were spawned when marked received
    await prisma.financeIncomeEntry.deleteMany({
      where: { parentIncomeId: id, familyId: session.familyId, received: false },
    })
  }

  const entry = await prisma.financeIncomeEntry.update({
    where: { id },
    data: updateData,
    include: INCOME_INCLUDE,
  })

  // ── Mark received: create income transaction + spawn next occurrence ────────
  if (received === true && !existing.received) {
    const actualReceivedDate = receivedDateRaw ? new Date(receivedDateRaw) : new Date()

    // Auto-create a FinanceTransaction so account balances and the transaction
    // feed stay accurate (cash-basis accounting — income recorded on receipt)
    let newTransactionId: string | null = null
    try {
      const tx = await prisma.financeTransaction.create({
        data: {
          type: 'income',
          amount: existing.amount,
          accountId: existing.accountId,
          categoryId: existing.categoryId,
          payee: null,           // income has a vendor/payer, not a payee
          description: existing.name,
          date: actualReceivedDate,
          isRecurring: existing.incomeType !== 'one-off',
          vendorId: existing.vendorId,
          notes: existing.notes,
          memberId: existing.memberId,
          locationId: existing.locationId,
          isCleared: true,       // money is already in hand
          reconciledDate: actualReceivedDate,
          createdBy: session.id,
          familyId: session.familyId,
        },
      })
      newTransactionId = tx.id
      await prisma.financeIncomeEntry.update({
        where: { id },
        data: { transactionId: newTransactionId },
      })
    } catch {
      // Transaction creation is best-effort; don't fail the whole mark-received
    }

    // Spawn the next occurrence for recurring income
    if (existing.incomeType !== 'one-off') {
      const newExpectedDate = advanceNextExpectedDate(existing.nextExpectedDate, existing.frequency)
      if (!existing.endDate || newExpectedDate <= existing.endDate) {
        await prisma.financeIncomeEntry.create({
          data: {
            name: existing.name,
            amount: existing.amount,
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
            parentIncomeId: existing.id,
            familyId: session.familyId,
          },
        })
      }
    }
  }

  return NextResponse.json(entry)
}
