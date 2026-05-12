import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { addMonths, addWeeks } from 'date-fns'
import { ensureAccountsReceivableCategory } from '@/lib/finance-opening-balance'

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

// ── Journal lines helper ────────────────────────────────────────────────────
// Creates or replaces the accrual journal entry linked to an income entry.
// Lines: DR Accounts Receivable / CR income account(s) [+ GST Payable]
// The entry is posted immediately when balanced (DR = CR within 0.005).
// A draft is saved only when lines are unbalanced so the user can complete them.

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
          description: incomeName,
          entityId: entityId ?? null,
          // Post immediately if balanced — unposted journals are invisible to Trial Balance / P&L / Balance Sheet
          isPosted: isBalanced,
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

  const jeEntries = await prisma.financeJournalEntry.findMany({
    where: { familyId, reference: { not: null } },
    select: { reference: true },
  })
  let jeMax = 0
  for (const e of jeEntries) {
    if (!e.reference) continue
    const m = e.reference.match(/^JE-(\d+)$/)
    if (m) { const n = parseInt(m[1], 10); if (n > jeMax) jeMax = n }
  }
  const reference = `JE-${String(jeMax + 1).padStart(4, '0')}`

  const entry = await prisma.financeJournalEntry.create({
    data: {
      reference,
      date,
      description: incomeName,
      type: 'auto_transaction',
      // Post immediately when balanced — unposted journals don't feed P&L / Balance Sheet / Trial Balance
      isPosted: isBalanced,
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
    isTaxTracked, taxRate, taxClassification,
    journalLines,   // optional: JournalLine[] for double-entry accrual
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
      familyId: session.familyId,
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
        session.familyId,
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
    isTaxTracked, taxRate, taxClassification,
    journalLines,   // optional: JournalLine[] for double-entry accrual
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
      ...(taxClassification !== undefined && { taxClassification: taxClassification ?? null }),
    },
    include: INCOME_INCLUDE,
  })

  // Upsert journal entry if lines provided
  if (Array.isArray(journalLines) && journalLines.length >= 2) {
    try {
      const existingJeId: string | null = existing.journalEntryId ?? null
      const journalEntryId = await upsertIncomeJournalEntry(
        name ?? existing.name,
        existingJeId,
        journalLines,
        nextExpectedDate ? new Date(nextExpectedDate) : existing.nextExpectedDate,
        session.familyId,
        entityId !== undefined ? (entityId ?? null) : existing.entityId,
      )
      if (journalEntryId !== existingJeId) {
        await prisma.financeIncomeEntry.update({
          where: { id: entry.id },
          data: { journalEntryId },
        })
      }
    } catch (err) {
      console.error('[income PUT] Failed to upsert journal entry:', err)
    }
  }

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
  const { id, received, receivedDate: receivedDateRaw, invoiceReceived, invoiceReceivedDate, receiveToAccountId, receiveToGlAccountId } = json

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const existing = await prisma.financeIncomeEntry.findFirst({ where: { id, familyId: session.familyId } })
  if (!existing) return NextResponse.json({ error: 'Income entry not found' }, { status: 404 })

  const updateData: Record<string, any> = {}

  if (received !== undefined) {
    updateData.received = received
    const stampDate = receivedDateRaw ? new Date(receivedDateRaw) : new Date()
    updateData.receivedDate = received ? stampDate : null
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
        where: { id: invoiceTxId, familyId: session.familyId },
      })
      updateData.invoiceTxId = null
      if (existing.transactionId === invoiceTxId) updateData.transactionId = null
    }
    // Undo received too if it was set
    if (existing.received) {
      const receiptTxId: string | null = existing.receiptTxId ?? null
      if (receiptTxId) {
        await prisma.financeTransaction.deleteMany({
          where: { id: receiptTxId, familyId: session.familyId },
        })
        updateData.receiptTxId = null
        if (existing.transactionId === receiptTxId) updateData.transactionId = null
      }
      updateData.received = false
      updateData.receivedDate = null
      await prisma.financeIncomeEntry.deleteMany({
        where: { parentIncomeId: id, familyId: session.familyId, received: false },
      })
    }
  }

  // ── Undo received: delete stage-2 receipt transaction + spawned children ──
  if (received === false && existing.received === true) {
    const receiptTxId: string | null = existing.receiptTxId ?? null
    if (receiptTxId) {
      await prisma.financeTransaction.deleteMany({
        where: { id: receiptTxId, familyId: session.familyId },
      })
      updateData.receiptTxId = null
      if (existing.transactionId === receiptTxId) updateData.transactionId = null
    } else if (existing.transactionId) {
      // Legacy: older records stored receipt in transactionId directly
      await prisma.financeTransaction.deleteMany({
        where: { id: existing.transactionId, familyId: session.familyId },
      })
      updateData.transactionId = null
    }
    // Re-open stage-1 remittance tx (income still recognised, just not yet received)
    const invoiceTxId: string | null = existing.invoiceTxId ?? null
    if (invoiceTxId) {
      await prisma.financeTransaction.updateMany({
        where: { id: invoiceTxId, familyId: session.familyId },
        data: { isCleared: false, reconciledDate: null },
      })
    }
    await prisma.financeIncomeEntry.deleteMany({
      where: { parentIncomeId: id, familyId: session.familyId, received: false },
    })
  }

  // Apply status field updates
  const entry = await prisma.financeIncomeEntry.update({
    where: { id },
    data: updateData,
    include: INCOME_INCLUDE,
  })

  // ── Stage 1: Remittance received → create income transaction (CR income) ──
  //
  // Accounting: when remittance advice arrives, income is recognised (accrual).
  // Creates an uncleared income transaction. The AR asset side is tracked
  // implicitly — the uncleared income tx represents money owed to us.
  //
  // P&L effect: income appears from this point forward.
  // Balance sheet: uncleared income tx increases net worth (AR asset).
  if (invoiceReceived === true && !existing.invoiceReceived) {
    const remittanceDate = invoiceReceivedDate ? new Date(invoiceReceivedDate) : new Date()
    try {
      const arCategoryId = await ensureAccountsReceivableCategory(session.familyId)
      const remittanceTx = await prisma.financeTransaction.create({
        data: {
          type: 'income',
          amount: existing.amount,
          accountId: existing.accountId,
          categoryId: existing.categoryId,
          description: `${existing.name} (remittance received)`,
          date: remittanceDate,
          isRecurring: existing.incomeType !== 'one-off',
          vendorId: existing.vendorId,
          notes: existing.notes,
          memberId: existing.memberId,
          locationId: existing.locationId,
          isCleared: false,   // Uncleared = awaiting cash (AR outstanding)
          isTransfer: false,
          createdBy: session.id,
          familyId: session.familyId,
          entityId: existing.entityId,
          // Reference encodes the AR category for the balance sheet to read
          reference: `AR:${arCategoryId}`,
        },
      })
      await prisma.financeIncomeEntry.update({
        where: { id },
        data: {
          invoiceTxId: remittanceTx.id,
          transactionId: remittanceTx.id,  // keep legacy pointer
        },
      })
    } catch (err) {
      console.error('[income PATCH] Failed to create remittance transaction:', err)
    }
  }

  // ── Stage 2: Cash received → create receipt transaction (DR bank) ─────────
  //
  // Accounting: cash arrives in the bank account. If a stage-1 remittance tx
  // exists it is marked cleared (income already on P&L); otherwise a fresh
  // income tx is created and immediately cleared.
  //
  // P&L effect: no change if remittance was already received.
  // Balance sheet effect: bank account balance increases; AR asset clears.
  if (received === true && !existing.received) {
    const actualReceivedDate = receivedDateRaw ? new Date(receivedDateRaw) : new Date()
    // receiveToGlAccountId (GL category) takes precedence over legacy receiveToAccountId (bank account)
    const receiptAccountId = receiveToAccountId ?? existing.accountId
    const receiptGlAccountId: string | null = receiveToGlAccountId ?? null
    // Re-read to get latest invoiceTxId (may have just been written above)
    const freshEntry = await prisma.financeIncomeEntry.findFirst({
      where: { id, familyId: session.familyId },
    })

    try {
      const invoiceTxId: string | null = freshEntry?.invoiceTxId ?? null

      if (invoiceTxId) {
        // ── Case A: remittance was received — mark that tx cleared (cash in) ─
        await prisma.financeTransaction.update({
          where: { id: invoiceTxId },
          data: {
            isCleared: true,
            reconciledDate: actualReceivedDate,
            date: actualReceivedDate,
            // Use glAccountId when a GL category was selected; fall back to bank account
            ...(receiptGlAccountId
              ? { glAccountId: receiptGlAccountId, accountId: receiptAccountId }
              : { accountId: receiptAccountId }
            ),
          },
        })
        // receiptTxId points to the same tx
        await prisma.financeIncomeEntry.update({
          where: { id },
          data: { receiptTxId: invoiceTxId, transactionId: invoiceTxId },
        })
      } else {
        // ── Case B: no prior remittance — create cleared income tx now ────────
        const tx = await prisma.financeTransaction.create({
          data: {
            type: 'income',
            amount: existing.amount,
            accountId: receiptAccountId,
            categoryId: existing.categoryId,
            description: existing.name,
            date: actualReceivedDate,
            isRecurring: existing.incomeType !== 'one-off',
            vendorId: existing.vendorId,
            notes: existing.notes,
            memberId: existing.memberId,
            locationId: existing.locationId,
            isCleared: true,
            reconciledDate: actualReceivedDate,
            isTransfer: false,
            glAccountId: receiptGlAccountId,
            createdBy: session.id,
            familyId: session.familyId,
            entityId: existing.entityId,
          },
        })
        await prisma.financeIncomeEntry.update({
          where: { id },
          data: {
            receiptTxId: tx.id,
            transactionId: tx.id,
          },
        })
      }
    } catch (err) {
      console.error('[income PATCH] Failed to create receipt transaction:', err)
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
            taxClassification: existing.taxClassification,
            parentIncomeId: existing.id,
            familyId: session.familyId,
          },
        })
      }
    }
  }

  // Re-fetch with includes so the response is fresh
  const finalEntry = await prisma.financeIncomeEntry.findFirst({
    where: { id, familyId: session.familyId },
    include: INCOME_INCLUDE,
  })
  return NextResponse.json(finalEntry ?? entry)
}
