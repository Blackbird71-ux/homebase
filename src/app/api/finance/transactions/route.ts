import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { createGstJournalEntry, resolveAccountGlCategoryId } from '@/lib/finance-opening-balance'
import { nextNJournalReferences } from '@/lib/finance-journal-ref'
import { reverseJournalEntry, postJournalEntry, postJournalWarning } from '@/lib/finance-posting'
import type { JournalLine } from '@/lib/finance-posting'
import { DEFAULT_TIMEZONE, localMidnightToUtc } from '@/lib/timezone'

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

  // Flag transactions whose value is already represented in the GL P&L: those
  // with a live (posted, non-reversed) auto-journal touching an income/expense
  // account. The P&L screen reads both raw transactions and the GL trial
  // balance, so it must exclude these from its raw-transaction bucket to avoid
  // double-counting (see useProfitLoss txItems).
  const txIds = transactions.map(t => t.id)
  const pnlJournalTxIds = new Set<string>()
  if (txIds.length) {
    const linked = await prisma.financeJournalEntry.findMany({
      where: {
        sourceTransactionId: { in: txIds },
        isPosted: true,
        isReversed: false,
        lines: { some: { glAccount: { type: { in: ['income', 'expense'] } } } },
      },
      select: { sourceTransactionId: true },
    })
    for (const e of linked) if (e.sourceTransactionId) pnlJournalTxIds.add(e.sourceTransactionId)
  }
  const withFlags = transactions.map(t => ({
    ...t,
    hasPostedPnlJournal: pnlJournalTxIds.has(t.id),
  }))

  return NextResponse.json({ transactions: withFlags, total, page, limit })
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
    journalLines,   // optional: JournalLine[] for double-entry accrual
  } = json

  if (!type || amount === undefined) {
    return NextResponse.json({ error: 'Type and amount are required' }, { status: 400 })
  }
  if (!['income', 'expense', 'transfer'].includes(type)) {
    return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 })
  }

  const txDate = date ? new Date(date) : new Date()

  // Cash/asset side of the double-entry. In the Xero "bank = GL account, 1:1"
  // model a selected FinanceAccount IS the cash side — resolve it to its bound GL
  // category so the posting moves that account's displayed balance and the
  // dashboard / Accounts page / Balance Sheet reconcile by construction. An
  // explicit GL category is only the fallback for non-account items (term
  // deposit, property, vehicle) when no account is chosen. The resolved value is
  // persisted as the row's glAccountId so the journal and the PUT edit-sync agree.
  let cashGlId: string | null = null
  if (accountId) {
    cashGlId = await resolveAccountGlCategoryId(accountId, user.familyId)
    if (!cashGlId) {
      return NextResponse.json({ error: 'Selected account not found. Cannot post transaction.' }, { status: 422 })
    }
  } else if (glAccountId) {
    cashGlId = glAccountId
  }

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
      glAccountId: cashGlId,
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
  //
  // FC-12-03: the GST journal can fail to post (missing GST GL account, unbalanced
  // split) while the transaction itself is already committed. Capture that and
  // surface it as a non-fatal warning in the response so a GST tx never silently
  // saves with no GST leg (which would under-report BAS).
  let glWarning: string | null = null
  if (Array.isArray(journalLines) && journalLines.length >= 2) {
    try {
      const outcome = await postJournalEntry({
        description: description?.trim() || payee?.trim() || type,
        lines: journalLines,
        date: txDate,
        familyId: user.familyId,
        entityId: json.entityId ?? null,
        sourceTransactionId: transaction.id,
      })
      glWarning = postJournalWarning(outcome)
    } catch (err) {
      console.error('[transactions POST] Failed to create journal entry:', err)
    }
  } else if (
    transaction.categoryId &&
    cashGlId &&
    (type === 'expense' || type === 'income')
  ) {
    // Auto-journal gate: fires when a cash/asset side exists — either a selected
    // FinanceAccount (resolved to its bound GL category above) or an explicit GL
    // category for non-account items (term deposit, property, vehicle).
    try {
      const cat = await prisma.financeCategory.findFirst({
        where: { id: transaction.categoryId, familyId: user.familyId },
        select: { gstApplicable: true, gstRate: true },
      })

      const desc = description?.trim() || payee?.trim() || type

      if (cat?.gstApplicable) {
        const gstJournalId = await createGstJournalEntry(
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
        if (!gstJournalId) {
          glWarning =
            'The transaction was saved, but its GST journal did not post to the General Ledger ' +
            '(check the GST control accounts are configured). BAS reporting will be incomplete ' +
            'until the GST entry is recorded.'
        }
      } else {
        const autoLines: JournalLine[] = type === 'expense'
          ? [
              { glAccountId: transaction.categoryId, side: 'debit',  amount },
              { glAccountId: cashGlId,               side: 'credit', amount },
            ]
          : [
              { glAccountId: cashGlId,               side: 'debit',  amount },
              { glAccountId: transaction.categoryId, side: 'credit', amount },
            ]
        const outcome = await postJournalEntry({
          description: desc,
          lines: autoLines,
          date: txDate,
          familyId: user.familyId,
          entityId: json.entityId ?? null,
          sourceTransactionId: transaction.id,
        })
        glWarning = postJournalWarning(outcome)
      }
    } catch (err) {
      console.error('[transactions POST] Failed to create journal entry:', err)
    }
  }

  return NextResponse.json(
    glWarning ? { ...transaction, warning: glWarning } : transaction,
    { status: 201 },
  )
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

  // Resolve the cash/asset side the same way POST does: a selected FinanceAccount
  // is the cash side (its bound GL category); else an explicit GL category for
  // non-account items. Only recompute when the caller actually touched the
  // account or GL fields — bare edits like handleClear ({ id, isCleared }) leave
  // both undefined and must not disturb the existing glAccountId. The resolved
  // value drives both the row update and the journal edit-sync below.
  let resolvedCashGlId: string | null | undefined = undefined
  if (accountId !== undefined || glAccountId !== undefined) {
    if (accountId) {
      resolvedCashGlId = await resolveAccountGlCategoryId(accountId, user.familyId)
      if (!resolvedCashGlId) {
        return NextResponse.json({ error: 'Selected account not found. Cannot post transaction.' }, { status: 422 })
      }
    } else {
      resolvedCashGlId = glAccountId ?? null
    }
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
      ...(resolvedCashGlId !== undefined && { glAccountId: resolvedCashGlId }),
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
  const glAccountChanged   = resolvedCashGlId !== undefined && resolvedCashGlId !== existing.glAccountId
  const typeChanged        = type       !== undefined && type        !== existing.type

  let glWarning: string | null = null
  if (amountChanged || dateChanged || descriptionChanged || payeeChanged || categoryChanged || glAccountChanged || typeChanged) {
    const glAccountEditPending = categoryChanged || glAccountChanged || typeChanged
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
          glAccountEditPending &&
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

        // A GL-account change was requested but the journal wasn't in canonical shape
        // (hand-adjusted, or the new type/accounts weren't both present), so only the
        // amounts synced and the journal's GL accounts are now stale vs. the row.
        if (glAccountEditPending && !repoint) {
          glWarning = 'The transaction was saved, but its linked journal entry could not be ' +
            're-pointed to the new account(s) automatically — its General Ledger accounts may ' +
            'be out of date. Review the journal entry.'
        }
      } else if (linkedJournal) {
        // 3-line GST journal (or any non-2-line shape): deliberately not auto-synced, so its
        // amounts/accounts are now stale vs. the edited row. Surface it instead of swallowing.
        glWarning = 'The transaction was saved, but its linked GST/multi-line journal entry was ' +
          'not updated automatically — its General Ledger amounts may be out of date. Correct ' +
          'the journal entry manually.'
      }
    } catch (err) {
      console.error('[transactions PUT] Failed to sync journal entry:', err)
      glWarning = 'The transaction was saved, but updating its linked journal entry in the ' +
        'General Ledger failed — the GL may be out of date. Please retry the edit.'
    }
  }

  return NextResponse.json(
    glWarning ? { ...transaction, warning: glWarning } : transaction,
  )
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

  const reversalRefs = await nextNJournalReferences(user.familyId, linkedJournals.length)

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < linkedJournals.length; i++) {
      await reverseJournalEntry(tx, linkedJournals[i], {
        reference: reversalRefs[i],
        date: new Date(),
        familyId: user.familyId,
      })
    }
    await tx.financeTransaction.delete({ where: { id } })
  })

  return NextResponse.json({ success: true })
}