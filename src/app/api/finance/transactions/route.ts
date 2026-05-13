import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { createGstJournalEntry } from '@/lib/finance-opening-balance'
import { nextJournalReference } from '@/lib/finance-journal-ref'

// ── Journal lines helper ────────────────────────────────────────────────────
// If journalLines are supplied with a transaction POST, create a posted
// double-entry journal entry alongside the single-sided transaction record.
// For a quick-add expense: DR expense GL / CR AP (or bank) — posted immediately.

interface JournalLineInput {
  glAccountId: string
  side: 'debit' | 'credit'
  amount: number
  description?: string
}

async function createTransactionJournalEntry(
  description: string,
  lines: JournalLineInput[],
  date: Date,
  familyId: string,
  entityId: string | null,
  sourceTransactionId?: string,
): Promise<void> {
  const glIds = [...new Set(lines.map(l => l.glAccountId))]
  const valid = await prisma.financeCategory.findMany({
    where: { id: { in: glIds }, familyId },
    select: { id: true },
  })
  if (valid.length !== glIds.length) return   // silently skip if any account missing

  // Validate balance
  const dr = lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
  const cr = lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
  const balanced = Math.abs(dr - cr) < 0.005

  const MAX_RETRIES = 10
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const reference = await nextJournalReference(familyId)

    try {
      await prisma.financeJournalEntry.create({
        data: {
          reference,
          date,
          description,
          type: 'auto_transaction',
          isPosted: balanced,   // post immediately if balanced; save as draft otherwise
          entityId: entityId ?? null,
          familyId,
          sourceTransactionId: sourceTransactionId ?? null,
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
      return  // success
    } catch (err: any) {
      if (err.code === 'P2002' && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')
  const categoryId = searchParams.get('categoryId')
  const memberId = searchParams.get('memberId')
  const locationId = searchParams.get('locationId')
  const type = searchParams.get('type')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const isCleared = searchParams.get('isCleared')
  const isRecurring = searchParams.get('isRecurring')
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = parseInt(searchParams.get('limit') ?? '50', 10)

  const where: any = { familyId: session.familyId }
  if (accountId) where.accountId = accountId
  if (categoryId) where.categoryId = categoryId
  if (memberId) where.memberId = memberId
  if (locationId) where.locationId = locationId
  if (type) where.type = type
  if (searchParams.get('entityId')) where.entityId = searchParams.get('entityId')
  if (startDate) where.date = { ...(where.date || {}), gte: new Date(startDate) }
  if (endDate) where.date = { ...(where.date || {}), lte: new Date(endDate) }
  if (isCleared !== null) where.isCleared = isCleared === 'true'
  if (isRecurring !== null) where.isRecurring = isRecurring === 'true'

  const [transactions, total] = await Promise.all([
    prisma.financeTransaction.findMany({
      where,
      include: {
        category: true,
        account: true,
        location: { select: { id: true, name: true } },
        entity: { select: { id: true, name: true, color: true, isDefault: true } },
      },
      orderBy: { date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.financeTransaction.count({ where }),
  ])

  return NextResponse.json({ transactions, total, page, limit })
}

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const {
    accountId, categoryId, type, amount, payee,
    description, date, isRecurring, isCleared, isPrivate,
    memberId, locationId, taxClassification, isTransfer, glAccountId,
    journalLines,   // optional: JournalLineInput[] for double-entry accrual
  } = json

  if (!type || amount === undefined) {
    return NextResponse.json({ error: 'Type and amount are required' }, { status: 400 })
  }
  if (!['income', 'expense', 'transfer'].includes(type)) {
    return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 })
  }

  const txDate = date ? new Date(date) : new Date()

  const transaction = await prisma.financeTransaction.create({
    data: {
      accountId: accountId ?? null,
      categoryId: categoryId ?? null,
      type,
      amount,
      payee: payee ?? null,
      description: description ?? null,
      date: txDate,
      isRecurring: isRecurring ?? false,
      isCleared: isCleared ?? false,
      isPrivate: isPrivate ?? false,
      memberId: memberId ?? null,
      locationId: locationId ?? null,
      entityId: json.entityId ?? null,
      taxClassification: taxClassification ?? null,
      isTransfer: isTransfer ?? false,
      glAccountId: glAccountId ?? null,
      createdBy: session.id,
      familyId: session.familyId,
    },
    include: {
      category: true,
      account: true,
      location: { select: { id: true, name: true } },
      entity: { select: { id: true, name: true, color: true, isDefault: true } },
    },
  })

  // ── Journal entry for this transaction ──────────────────────────────────
  //
  // Priority:
  //   1. Caller-supplied journalLines — used as-is (full control).
  //   2. GST-applicable category — a 3-line GST journal replaces the simple
  //      2-line auto-journal so the expense/income and GST accounts are
  //      split correctly without double-posting.
  //   3. Auto-generated 2-line journal — DR/CR the category and the account.
  //
  // Transfers are excluded: they require paired entries across two accounts
  // and must be handled by the caller.
  if (Array.isArray(journalLines) && journalLines.length >= 2) {
    try {
      await createTransactionJournalEntry(
        description?.trim() || payee?.trim() || type,
        journalLines,
        txDate,
        session.familyId,
        json.entityId ?? null,
        transaction.id,
      )
    } catch (err) {
      console.error('[transactions POST] Failed to create journal entry:', err)
    }
  } else if (
    transaction.categoryId &&
    (transaction.accountId || glAccountId) &&
    (type === 'expense' || type === 'income')
  ) {
    // Auto-journal gate: fires when EITHER a bank account OR a GL category account
    // is provided as the cash/asset side of the double-entry.
    // glAccountId = a FinanceCategory (asset/liability type) used instead of a bank account.
    // This supports term deposits, properties, vehicles, and any non-FinanceAccount GL item.
    try {
      const cat = await prisma.financeCategory.findFirst({
        where: { id: transaction.categoryId, familyId: session.familyId },
        select: { gstApplicable: true, gstRate: true },
      })

      const desc = description?.trim() || payee?.trim() || type

      // The cash/asset side: prefer explicit glAccountId, fall back to bank accountId
      // Both are valid FinanceCategory IDs in the GL context.
      // Note: accountId (FinanceAccount) is NOT a FinanceCategory ID.
      // We use glAccountId for the journal; accountId is tracked separately on the tx.
      const cashGlId = glAccountId ?? null

      // Only auto-create journal if we have a valid GL account for the cash side
      if (cashGlId) {
        if (cat?.gstApplicable) {
          await createGstJournalEntry(
            type as 'expense' | 'income',
            amount,
            cat.gstRate ?? 10,
            transaction.categoryId,
            cashGlId,
            accountId ?? null,
            txDate,
            desc,
            session.familyId,
            json.entityId ?? null,
            session.id,
            transaction.id,
          )
        } else {
          const autoLines: JournalLineInput[] = type === 'expense'
            ? [
                { glAccountId: transaction.categoryId, side: 'debit',  amount },
                { glAccountId: cashGlId,               side: 'credit', amount },
              ]
            : [
                { glAccountId: cashGlId,               side: 'debit',  amount },
                { glAccountId: transaction.categoryId, side: 'credit', amount },
              ]
          await createTransactionJournalEntry(
            desc, autoLines, txDate, session.familyId, json.entityId ?? null, transaction.id,
          )
        }
      } else if (transaction.accountId) {
        // Bank account selected but no glAccountId — log a warning.
        // To get a GL entry, the user must also set glAccountId.
        // This is by design: the GL requires both sides to be FinanceCategory IDs.
        console.warn(
          `[transactions POST] No glAccountId for tx ${transaction.id} — ` +
          `bank account ${transaction.accountId} is not a GL category. ` +
          `Set glAccountId to get a GL journal entry.`
        )
      }
    } catch (err) {
      console.error('[transactions POST] Failed to create journal entry:', err)
    }
  }

  return NextResponse.json(transaction, { status: 201 })
}

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const {
    id, accountId, categoryId, type, amount, payee,
    description, date, isRecurring, isCleared, isPrivate,
    memberId, locationId, taxClassification, isTransfer, glAccountId,
  } = json

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeTransaction.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  const transaction = await prisma.financeTransaction.update({
    where: { id },
    data: {
      ...(accountId !== undefined && { accountId }),
      ...(categoryId !== undefined && { categoryId }),
      ...(type !== undefined && { type }),
      ...(amount !== undefined && { amount }),
      ...(payee !== undefined && { payee }),
      ...(description !== undefined && { description }),
      ...(date !== undefined && { date: new Date(date) }),
      ...(isRecurring !== undefined && { isRecurring }),
      ...(isCleared !== undefined && { isCleared }),
      ...(isPrivate !== undefined && { isPrivate }),
      ...(memberId !== undefined && { memberId: memberId ?? null }),
      ...(locationId !== undefined && { locationId: locationId ?? null }),
      ...(json.entityId !== undefined && { entityId: json.entityId ?? null }),
      ...(taxClassification !== undefined && { taxClassification: taxClassification ?? null }),
      ...(isTransfer !== undefined && { isTransfer }),
      ...(glAccountId !== undefined && { glAccountId: glAccountId ?? null }),
    },
    include: {
      category: true,
      account: true,
      location: { select: { id: true, name: true } },
      entity: { select: { id: true, name: true, color: true, isDefault: true } },
    },
  })

  // ── Sync the linked auto-generated journal entry if amount/date/description changed ──
  // Only update if the changed fields could affect the journal (amount, date, description/payee).
  // We only sync non-GST auto journals here (type='auto_transaction'). GST journals have
  // 3 lines with split amounts and would require a full recalculation — leave those for manual
  // correction until a dedicated recalc path is added.
  const amountChanged      = amount     !== undefined && amount     !== existing.amount
  const dateChanged        = date       !== undefined && new Date(date).getTime() !== existing.date.getTime()
  const descriptionChanged = description !== undefined && description !== existing.description
  const payeeChanged       = payee      !== undefined && payee      !== existing.payee

  if (amountChanged || dateChanged || descriptionChanged || payeeChanged) {
    try {
      const linkedJournal = await prisma.financeJournalEntry.findFirst({
        where: { sourceTransactionId: id, familyId: session.familyId, type: 'auto_transaction' },
        include: { lines: true },
      })

      if (linkedJournal && linkedJournal.lines.length === 2) {
        // Only sync balanced 2-line auto journals. GST journals (3 lines) are skipped.
        const newAmount      = amount      ?? existing.amount
        const newDate        = date        ? new Date(date) : existing.date
        const newDescription = description ?? existing.description ?? payee ?? existing.payee ?? existing.type

        const updatedLines = linkedJournal.lines.map(l => ({ ...l, amount: newAmount }))

        await prisma.$transaction([
          prisma.financeJournalEntry.update({
            where: { id: linkedJournal.id },
            data: {
              date:        newDate,
              description: newDescription,
            },
          }),
          ...updatedLines.map(l =>
            prisma.financeJournalLine.update({
              where: { id: l.id },
              data: { amount: newAmount },
            }),
          ),
        ])
      }
    } catch (err) {
      console.error('[transactions PUT] Failed to sync journal entry:', err)
    }
  }

  return NextResponse.json(transaction)
}

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeTransaction.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  await prisma.financeTransaction.delete({ where: { id } })
  return NextResponse.json({ success: true })
}