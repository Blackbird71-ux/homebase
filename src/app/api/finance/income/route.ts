import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { addMonths, addWeeks } from 'date-fns'
import { ensureAccountsReceivableCategory } from '@/lib/finance-opening-balance'
import { nextJournalReference } from '@/lib/finance-journal-ref'

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
//
// GL-FIRST safety guarantees (mirrors upsertBillDraftJournal):
//   1. Balance validation happens BEFORE any delete — unbalanced lines throw;
//      no data is touched.
//   2. deleteMany + update/create are wrapped in $transaction so a partial
//      failure cannot leave an entry with no lines.
//   3. The entry is posted immediately when balanced (DR = CR within 0.005).
//      An error is thrown for unbalanced lines — the UI blocks save first.

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
  const isBalanced = Math.abs(totalDR - totalCR) <= 0.005

  if (!isBalanced) {
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
            description: incomeName,
            entityId: entityId ?? null,
            isPosted: isBalanced,
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
        description: incomeName,
        type: 'auto_transaction',
        isPosted: isBalanced,
        entityId: entityId ?? null,
        familyId,
        lines: { create: lineData },
      },
      select: { id: true },
    })
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

  // Reverse any posted GL journals before deleting (mirrors bills DELETE pattern)
  const jeIds = [
    (existing as any).journalEntryId,
    (existing as any).receiptJournalEntryId,
  ].filter(Boolean) as string[]

  for (const jeId of jeIds) {
    const je = await prisma.financeJournalEntry.findFirst({
      where: { id: jeId, familyId: session.familyId },
      include: { lines: true },
    })
    if (je?.isPosted && !je.isReversed) {
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

  await prisma.financeIncomeEntry.delete({ where: { id } })
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

function advanceNextExpectedDate(date: Date, frequency: string): Date {
  if (frequency === 'weekly')      return addWeeks(date, 1)
  if (frequency === 'fortnightly') return addWeeks(date, 2)
  if (frequency === 'monthly')     return addMonths(date, 1)
  // bimonthly = every 2 months (6×/year). date-fns addMonths already snaps
  // end-of-month correctly (e.g. 31 Dec + 2 months → 28 Feb, not 3 Mar).
  if (frequency === 'bimonthly')   return addMonths(date, 2)
  if (frequency === 'quarterly')   return addMonths(date, 3)
  if (frequency === 'halfyearly')  return addMonths(date, 6)
  if (frequency === 'yearly')      return addMonths(date, 12)
  // Unknown frequency — default to monthly rather than silently misbehaving.
  console.warn(`[advanceNextExpectedDate] Unknown frequency "${frequency}" — defaulting to monthly`)
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
        where: { id: invoiceTxId, familyId: session.familyId },
      })
      updateData.invoiceTxId = null
      if (existing.transactionId === invoiceTxId) updateData.transactionId = null
    }
    // Reverse the accrual journal entry (do NOT delete — preserve audit trail per R4)
    const jeId: string | null = existing.journalEntryId ?? null
    if (jeId) {
      const je = await prisma.financeJournalEntry.findFirst({
        where: { id: jeId, familyId: session.familyId },
        include: { lines: true },
      })
      if (je?.isPosted && !je.isReversed) {
        const reversalRef = await nextJournalReference(session.familyId)
        await prisma.financeJournalEntry.create({
          data: {
            reference:    reversalRef,
            date:         new Date(),
            description:  `VOID: ${je.reference ?? je.id} — ${je.description}`,
            type:         'reversal',
            isPosted:     true,
            reversalOfId: je.id,
            entityId:     je.entityId,
            familyId:     session.familyId,
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
          where: { id: receiptTxId, familyId: session.familyId },
        })
        updateData.receiptTxId = null
        if (existing.transactionId === receiptTxId) updateData.transactionId = null
      }
      updateData.received = false
      updateData.receivedDate = null
      await deleteUnreceivedDescendants(id, session.familyId)
    }
  }

  // ── Undo received: delete stage-2 receipt transaction + receipt GL journal + spawned children ──
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
    // Reverse the receipt GL journal (do NOT delete — preserve audit trail per R4)
    const receiptJeId: string | null = (existing as any).receiptJournalEntryId ?? null
    if (receiptJeId) {
      const je = await prisma.financeJournalEntry.findFirst({
        where: { id: receiptJeId, familyId: session.familyId },
        include: { lines: true },
      })
      if (je?.isPosted && !je.isReversed) {
        const reversalRef = await nextJournalReference(session.familyId)
        await prisma.financeJournalEntry.create({
          data: {
            reference:    reversalRef,
            date:         new Date(),
            description:  `VOID: ${je.reference ?? je.id} — ${je.description}`,
            type:         'reversal',
            isPosted:     true,
            reversalOfId: je.id,
            entityId:     je.entityId,
            familyId:     session.familyId,
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
        where: { id: invoiceTxId, familyId: session.familyId },
        data: { isCleared: false, reconciledDate: null },
      })
    }
    await deleteUnreceivedDescendants(id, session.familyId)
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
        const arCategoryId = await ensureAccountsReceivableCategory(session.familyId)

        // 1. Create GL journal: DR AR / CR Income — posted immediately
        let journalEntryId: string
        const existingJeId: string | null = existing.journalEntryId ?? null

        if (existingJeId) {
          const existingJe = await tx.financeJournalEntry.findFirst({
            where: { id: existingJeId, familyId: session.familyId },
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
              const reference = await nextJournalReference(session.familyId)
              const je = await tx.financeJournalEntry.create({
                data: {
                  reference, date: remittanceDate, description: existing.name,
                  type: 'auto_transaction', isPosted: true,
                  entityId: existing.entityId ?? null, familyId: session.familyId,
                  lines: { create: [
                    { glAccountId: arCategoryId,         side: 'debit',  amount: existing.amount, description: `AR: ${existing.name}` },
                    { glAccountId: existing.categoryId!, side: 'credit', amount: existing.amount, description: existing.name },
                  ]},
                }, select: { id: true },
              })
              journalEntryId = je.id
            }
          } else {
            // Already posted or has no lines — create fresh standard entry
            const reference = await nextJournalReference(session.familyId)
            const je = await tx.financeJournalEntry.create({
              data: {
                reference, date: remittanceDate, description: existing.name,
                type: 'auto_transaction', isPosted: true,
                entityId: existing.entityId ?? null, familyId: session.familyId,
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
          const reference = await nextJournalReference(session.familyId)
          const je = await tx.financeJournalEntry.create({
            data: {
              reference, date: remittanceDate, description: existing.name,
              type: 'auto_transaction', isPosted: true,
              entityId: existing.entityId ?? null, familyId: session.familyId,
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
            createdBy: session.id, familyId: session.familyId, entityId: existing.entityId,
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

  // ── Stage 2: Cash received → ATOMIC GL write (DR Bank / CR AR) ────────────
  //
  // Always routes through AR regardless of whether Stage 1 was done first:
  //   If Stage 1 not yet posted: auto-create it (DR AR / CR Income) in the same transaction.
  //   Stage 2:                   DR Bank / CR AR
  //   Net effect:                DR Bank / CR Income  (AR washes out on Trial Balance).
  //
  // A GL account is required — no legacy tx-only path.
  if (received === true && !existing.received) {
    const actualReceivedDate = receivedDateRaw ? new Date(receivedDateRaw) : new Date()
    const receiptAccountId = receiveToAccountId ?? existing.accountId
    const receiptGlAccountId: string | null = receiveToGlAccountId ?? null

    // Re-read to get latest invoiceTxId (may have just been written above in Stage 1)
    const freshEntry = await prisma.financeIncomeEntry.findFirst({
      where: { id, familyId: session.familyId },
    })
    const invoiceTxId: string | null = freshEntry?.invoiceTxId ?? null

    if (!receiptGlAccountId) {
      return NextResponse.json(
        { error: 'A GL account (bank account) is required to post a cash receipt.' },
        { status: 400 }
      )
    }

    {
      // ── GL path: ATOMIC — auto-accrual (Stage 1) if needed, then receipt (Stage 2) ──
      // Accounting (always via AR):
      //   Stage 1 (if not already posted): DR AR / CR Income
      //   Stage 2:                         DR Bank  / CR AR
      //   Net effect:                      DR Bank  / CR Income  (AR washes out)
      //
      // IMPORTANT: Pre-generate both journal references OUTSIDE the transaction.
      // nextJournalReference reads committed DB state; inside a $transaction the
      // first JE create is not yet committed, so a second call would return the
      // same reference and trigger a unique-constraint violation.
      const needsAutoStage1 = !freshEntry?.invoiceReceived
      const accrualRef  = needsAutoStage1 ? await nextJournalReference(session.familyId) : null
      // Increment base ref so receipt ref is always one higher when both are needed
      const receiptRef  = await nextJournalReference(session.familyId)
      try {
        await prisma.$transaction(async (tx) => {
          const arCategoryId = await ensureAccountsReceivableCategory(session.familyId)

          // ── Auto-post Stage 1 accrual if it hasn't been done yet ─────────────
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
                familyId: session.familyId,
                lines: {
                  create: [
                    { glAccountId: arCategoryId, side: 'debit',  amount: existing.amount, description: `AR: ${existing.name}` },
                    { glAccountId: existing.categoryId, side: 'credit', amount: existing.amount, description: existing.name },
                  ],
                },
              },
              select: { id: true },
            })
            await tx.financeIncomeEntry.update({
              where: { id },
              data: {
                invoiceReceived: true,
                invoiceReceivedDate: actualReceivedDate,
                journalEntryId: accrualJe.id,
              },
            })
          }

          // ── Stage 2: DR Bank / CR AR ──────────────────────────────────────────
          const receiptJe = await tx.financeJournalEntry.create({
            data: {
              reference: receiptRef,
              date: actualReceivedDate,
              description: `${existing.name} (cash received)`,
              type: 'auto_transaction',
              isPosted: true,
              entityId: existing.entityId ?? null,
              familyId: session.familyId,
              lines: {
                create: [
                  { glAccountId: receiptGlAccountId, side: 'debit',  amount: existing.amount, description: `Bank receipt: ${existing.name}` },
                  { glAccountId: arCategoryId,        side: 'credit', amount: existing.amount, description: `AR clear: ${existing.name}` },
                ],
              },
            },
            select: { id: true },
          })

          const receiptStatusData = {
            received: true,
            receivedDate: actualReceivedDate,
            receiptJournalEntryId: receiptJe.id,
          }

          if (invoiceTxId) {
            await tx.financeTransaction.update({
              where: { id: invoiceTxId },
              data: {
                isCleared: true,
                reconciledDate: actualReceivedDate,
                date: actualReceivedDate,
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
                type: 'income', amount: existing.amount,
                accountId: receiptAccountId, categoryId: existing.categoryId,
                description: existing.name, date: actualReceivedDate,
                isRecurring: existing.incomeType !== 'one-off',
                vendorId: existing.vendorId, notes: existing.notes,
                memberId: existing.memberId, locationId: existing.locationId,
                isCleared: true, reconciledDate: actualReceivedDate,
                isTransfer: false, glAccountId: receiptGlAccountId,
                createdBy: session.id, familyId: session.familyId,
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
          { error: 'Failed to post cash receipt to General Ledger. No changes were saved.' },
          { status: 422 }
        )
      }
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
