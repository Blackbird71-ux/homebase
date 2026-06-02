import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { createGstJournalEntry } from '@/lib/finance-opening-balance'
import { nextJournalReference } from '@/lib/finance-journal-ref'
import { DEFAULT_TIMEZONE, localMidnightToUtc } from '@/lib/timezone'

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
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  const where: any = { familyId: user.familyId }
  if (accountId) where.accountId = accountId
  if (categoryId) where.categoryId = categoryId
  if (memberId) where.memberId = memberId
  if (locationId) where.locationId = locationId
  if (type) where.type = type
  if (searchParams.get('entityId')) where.entityId = searchParams.get('entityId')
  if (startDate || endDate) {
    // startDate/endDate are local YYYY-MM-DD calendar days. Interpret them in the
    // family tz: gte = local midnight of startDate; lte = end of the local day endDate.
    const family = await prisma.family.findUnique({
      where: { id: user.familyId },
      select: { timezone: true },
    })
    const tz = family?.timezone ?? DEFAULT_TIMEZONE
    if (startDate) where.date = { ...(where.date || {}), gte: localMidnightToUtc(startDate, tz) }
    if (endDate) where.date = { ...(where.date || {}), lte: new Date(localMidnightToUtc(endDate, tz).getTime() + 86_400_000 - 1) }
  }
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
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      createdBy: user.id,
      familyId: user.familyId,
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
        user.familyId,
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
        where: { id: transaction.categoryId, familyId: user.familyId },
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
            user.familyId,
            json.entityId ?? null,
            user.id,
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
            desc, autoLines, txDate, user.familyId, json.entityId ?? null, transaction.id,
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
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    where: { id, familyId: user.familyId },
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

  // ── Sync the linked auto-generated journal entry when journal-affecting fields change ──
  // Triggers on amount/date/description/payee (entry header + line amounts) AND on
  // category/glAccount/type (line GL accounts — previously left stale, so the journal kept
  // debiting/crediting the old buckets after the row was re-categorised). We only sync
  // non-GST auto journals here (type='auto_transaction', exactly 2 lines). GST journals have
  // 3 split lines and would require a full recalculation — leave those for manual correction.
  const amountChanged      = amount     !== undefined && amount     !== existing.amount
  const dateChanged        = date       !== undefined && new Date(date).getTime() !== existing.date.getTime()
  const descriptionChanged = description !== undefined && description !== existing.description
  const payeeChanged       = payee      !== undefined && payee      !== existing.payee
  const categoryChanged    = categoryId !== undefined && categoryId  !== existing.categoryId
  const glAccountChanged   = glAccountId !== undefined && glAccountId !== existing.glAccountId
  const typeChanged        = type       !== undefined && type        !== existing.type

  if (amountChanged || dateChanged || descriptionChanged || payeeChanged || categoryChanged || glAccountChanged || typeChanged) {
    try {
      const linkedJournal = await prisma.financeJournalEntry.findFirst({
        where: { sourceTransactionId: id, familyId: user.familyId, type: 'auto_transaction' },
        include: { lines: true },
      })

      if (linkedJournal && linkedJournal.lines.length === 2) {
        // Only sync balanced 2-line auto journals. GST journals (3 lines) are skipped.
        const newAmount      = amount      ?? existing.amount
        const newDate        = date        ? new Date(date) : existing.date
        const newDescription = description ?? existing.description ?? payee ?? existing.payee ?? existing.type

        // Re-point line GL accounts when category/glAccount/type changed, using the same
        // mapping the POST auto-journal uses: expense → DR category / CR cash; income → DR
        // cash / CR category. Guarded so we only touch a journal still in its canonical
        // auto-generated shape (its two lines match the transaction's PREVIOUS accounts) and
        // only when the new type is expense/income with both accounts present — otherwise a
        // hand-adjusted or partially-configured entry's accounts are left untouched (amounts
        // still sync, matching prior behaviour).
        const oldDebitGl  = existing.type === 'expense' ? existing.categoryId : existing.glAccountId
        const oldCreditGl = existing.type === 'expense' ? existing.glAccountId : existing.categoryId
        const debitLine   = linkedJournal.lines.find(l => l.side === 'debit')
        const creditLine  = linkedJournal.lines.find(l => l.side === 'credit')
        const canonicalShape =
          !!debitLine && !!creditLine &&
          debitLine.glAccountId === oldDebitGl &&
          creditLine.glAccountId === oldCreditGl

        const repoint =
          (categoryChanged || glAccountChanged || typeChanged) &&
          canonicalShape &&
          (transaction.type === 'expense' || transaction.type === 'income') &&
          !!transaction.categoryId && !!transaction.glAccountId

        const newDebitGl  = transaction.type === 'expense' ? transaction.categoryId : transaction.glAccountId
        const newCreditGl = transaction.type === 'expense' ? transaction.glAccountId : transaction.categoryId

        await prisma.$transaction([
          prisma.financeJournalEntry.update({
            where: { id: linkedJournal.id },
            data: {
              date:        newDate,
              description: newDescription,
            },
          }),
          ...linkedJournal.lines.map(l =>
            prisma.financeJournalLine.update({
              where: { id: l.id },
              data: {
                amount: newAmount,
                ...(repoint && { glAccountId: l.side === 'debit' ? newDebitGl! : newCreditGl! }),
              },
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
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeTransaction.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  // ── Reverse-not-delete: unwind any linked posted journal before removing the row ──
  // Deleting the transaction must not leave its posted auto_transaction journal in the GL
  // (the reports read only from posted lines, so a phantom entry would silently survive).
  // Find every posted, non-reversed auto_transaction journal for this tx — both the 2-line
  // auto journal AND the 3-line GST companion the PUT sync deliberately skips — and post a
  // balanced reversal (swapped debit/credit, type 'reversal', reversalOfId) for each, marking
  // the original isReversed. Generate the reversal refs BEFORE the $transaction so
  // nextJournalReference sees committed DB state (SQLite uncommitted-read ref-collision rule).
  const linkedJournals = await prisma.financeJournalEntry.findMany({
    where: {
      sourceTransactionId: id,
      familyId: user.familyId,
      type: 'auto_transaction',
      isPosted: true,
      isReversed: false,
    },
    include: { lines: true },
  })

  let reversalRefs: string[] = []
  if (linkedJournals.length > 0) {
    const firstRef = await nextJournalReference(user.familyId)
    const base = parseInt(firstRef.match(/^JE-(\d+)$/)?.[1] ?? '0', 10)
    reversalRefs = linkedJournals.map((_, i) => `JE-${String(base + i).padStart(4, '0')}`)
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < linkedJournals.length; i++) {
      const je = linkedJournals[i]
      await tx.financeJournalEntry.create({
        data: {
          reference: reversalRefs[i],
          date: new Date(),
          description: `VOID: ${je.reference} — ${je.description}`,
          type: 'reversal',
          isPosted: true,
          reversalOfId: je.id,
          entityId: je.entityId,
          familyId: user.familyId,
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
    await tx.financeTransaction.delete({ where: { id } })
  })

  return NextResponse.json({ success: true })
}