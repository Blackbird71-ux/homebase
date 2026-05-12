import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { createGstJournalEntry } from '@/lib/finance-opening-balance'

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

  // Retry loop for unique reference — uses MAX not COUNT to handle gaps from deletions
  const MAX_RETRIES = 10
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const entries = await prisma.financeJournalEntry.findMany({
      where: { familyId, reference: { not: null } },
      select: { reference: true },
    })
    let max = 0
    for (const e of entries) {
      if (!e.reference) continue
      const m = e.reference.match(/^JE-(\d+)$/)
      if (m) { const n = parseInt(m[1], 10); if (n > max) max = n }
    }
    const reference = `JE-${String(max + 1).padStart(4, '0')}`

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

  // Create a double-entry journal entry if lines provided
  if (Array.isArray(journalLines) && journalLines.length >= 2) {
    try {
      await createTransactionJournalEntry(
        description?.trim() || payee?.trim() || type,
        journalLines,
        txDate,
        session.familyId,
        json.entityId ?? null,
      )
    } catch (err) {
      console.error('[transactions POST] Failed to create journal entry:', err)
    }
  }

  // ── Auto GST split ───────────────────────────────────────────────────────
  // If the category is marked gstApplicable and the transaction is cleared,
  // auto-post a 3-line GST journal entry (ex-GST + ITC/Collected + cash).
  // Only fires for expense and income types — transfers and opening balances
  // are excluded. The user can disable this per-category in Chart of Accounts.
  if (
    transaction.isCleared &&
    transaction.categoryId &&
    (type === 'expense' || type === 'income')
  ) {
    try {
      const cat = await prisma.financeCategory.findFirst({
        where: { id: transaction.categoryId, familyId: session.familyId },
        select: { gstApplicable: true, gstRate: true },
      })
      if (cat?.gstApplicable) {
        const desc = (description?.trim() || payee?.trim() || type)
        await createGstJournalEntry(
          type as 'expense' | 'income',
          amount,
          cat.gstRate ?? 10,
          transaction.categoryId,
          glAccountId ?? null,
          accountId ?? null,
          txDate,
          desc,
          session.familyId,
          json.entityId ?? null,
          session.id,
        )
      }
    } catch (err) {
      console.error('[transactions POST] Failed to create GST journal:', err)
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