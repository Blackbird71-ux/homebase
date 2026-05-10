import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// ── Include shape used for all queries ───────────────────────────────────────

const ENTRY_INCLUDE = {
  lines: {
    include: {
      glAccount: {
        select: { id: true, name: true, type: true, glCode: true },
      },
    },
    orderBy: [{ side: 'asc' as const }, { amount: 'desc' as const }],
  },
  entity: {
    select: { id: true, name: true, color: true },
  },
}

// ── Auto-generate reference (JE-XXXX) ────────────────────────────────────────

async function nextReference(familyId: string): Promise<string> {
  const count = await prisma.financeJournalEntry.count({ where: { familyId } })
  return `JE-${String(count + 1).padStart(4, '0')}`
}

// ── GET /api/finance/journals ─────────────────────────────────────────────────
// Query params: page, limit, isPosted

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)

  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10))
  const skip  = (page - 1) * limit

  const isPostedParam = searchParams.get('isPosted')
  const where: { familyId: string; isPosted?: boolean } = { familyId: session.familyId }
  if (isPostedParam === 'true')  where.isPosted = true
  if (isPostedParam === 'false') where.isPosted = false

  const [entries, total] = await Promise.all([
    prisma.financeJournalEntry.findMany({
      where,
      include: ENTRY_INCLUDE,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.financeJournalEntry.count({ where }),
  ])

  return NextResponse.json({ entries, total })
}

// ── POST /api/finance/journals ────────────────────────────────────────────────
// Create a new journal entry (draft or post immediately)

export async function POST(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { date, description, type, entityId, postImmediately, lines } = json

  if (!date || !description?.trim()) {
    return NextResponse.json({ error: 'date and description are required' }, { status: 400 })
  }
  if (!Array.isArray(lines) || lines.length < 2) {
    return NextResponse.json({ error: 'At least 2 journal lines are required' }, { status: 400 })
  }

  // Validate balance before posting
  if (postImmediately) {
    const debit  = lines.filter((l: { side: string }) => l.side === 'debit') .reduce((s: number, l: { amount: number }) => s + (l.amount ?? 0), 0)
    const credit = lines.filter((l: { side: string }) => l.side === 'credit').reduce((s: number, l: { amount: number }) => s + (l.amount ?? 0), 0)
    if (Math.abs(debit - credit) > 0.005) {
      return NextResponse.json({ error: 'Debits must equal credits before posting' }, { status: 400 })
    }
  }

  // Verify all GL accounts belong to this family
  const glIds = [...new Set(lines.map((l: { glAccountId: string }) => l.glAccountId))]
  const validAccounts = await prisma.financeCategory.findMany({
    where: { id: { in: glIds as string[] }, familyId: session.familyId },
    select: { id: true },
  })
  if (validAccounts.length !== glIds.length) {
    return NextResponse.json({ error: 'One or more GL accounts not found' }, { status: 400 })
  }

  const reference = await nextReference(session.familyId)

  const entry = await prisma.financeJournalEntry.create({
    data: {
      reference,
      date:        new Date(date),
      description: description.trim(),
      type:        type ?? 'manual',
      isPosted:    postImmediately ?? false,
      entityId:    entityId || null,
      familyId:    session.familyId,
      lines: {
        create: lines.map((l: { glAccountId: string; side: string; amount: number; description?: string; memberId?: string }) => ({
          glAccountId: l.glAccountId,
          side:        l.side,
          amount:      l.amount,
          description: l.description || null,
          memberId:    l.memberId    || null,
        })),
      },
    },
    include: ENTRY_INCLUDE,
  })

  return NextResponse.json(entry, { status: 201 })
}

// ── PUT /api/finance/journals ─────────────────────────────────────────────────
// Update a draft entry (posted entries cannot be edited)

export async function PUT(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, date, description, type, entityId, postImmediately, lines } = json

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeJournalEntry.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 })
  }
  if (existing.isPosted) {
    return NextResponse.json({ error: 'Posted entries cannot be edited' }, { status: 400 })
  }

  if (!Array.isArray(lines) || lines.length < 2) {
    return NextResponse.json({ error: 'At least 2 journal lines are required' }, { status: 400 })
  }

  if (postImmediately) {
    const debit  = lines.filter((l: { side: string }) => l.side === 'debit') .reduce((s: number, l: { amount: number }) => s + (l.amount ?? 0), 0)
    const credit = lines.filter((l: { side: string }) => l.side === 'credit').reduce((s: number, l: { amount: number }) => s + (l.amount ?? 0), 0)
    if (Math.abs(debit - credit) > 0.005) {
      return NextResponse.json({ error: 'Debits must equal credits before posting' }, { status: 400 })
    }
  }

  const glIds = [...new Set(lines.map((l: { glAccountId: string }) => l.glAccountId))]
  const validAccounts = await prisma.financeCategory.findMany({
    where: { id: { in: glIds as string[] }, familyId: session.familyId },
    select: { id: true },
  })
  if (validAccounts.length !== glIds.length) {
    return NextResponse.json({ error: 'One or more GL accounts not found' }, { status: 400 })
  }

  // Delete existing lines then recreate — simplest correct approach for edit
  await prisma.financeJournalLine.deleteMany({ where: { journalEntryId: id } })

  const entry = await prisma.financeJournalEntry.update({
    where: { id },
    data: {
      date:        new Date(date),
      description: description.trim(),
      type:        type ?? existing.type,
      isPosted:    postImmediately ?? false,
      entityId:    entityId || null,
      lines: {
        create: lines.map((l: { glAccountId: string; side: string; amount: number; description?: string; memberId?: string }) => ({
          glAccountId: l.glAccountId,
          side:        l.side,
          amount:      l.amount,
          description: l.description || null,
          memberId:    l.memberId    || null,
        })),
      },
    },
    include: ENTRY_INCLUDE,
  })

  return NextResponse.json(entry)
}

// ── PATCH /api/finance/journals ───────────────────────────────────────────────
// action: 'post' — post a draft to the ledger
// action: 'reverse' — create a reversal of a posted entry

export async function PATCH(request: NextRequest) {
  const session = await requireSession()
  const json = await request.json()
  const { id, action } = json

  if (!id || !action) {
    return NextResponse.json({ error: 'id and action are required' }, { status: 400 })
  }

  const existing = await prisma.financeJournalEntry.findFirst({
    where: { id, familyId: session.familyId },
    include: { lines: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 })
  }

  // ── Post a draft ─────────────────────────────────────────────────────────

  if (action === 'post') {
    if (existing.isPosted) {
      return NextResponse.json({ error: 'Entry is already posted' }, { status: 400 })
    }

    const debit  = existing.lines.filter(l => l.side === 'debit') .reduce((s, l) => s + l.amount, 0)
    const credit = existing.lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
    if (Math.abs(debit - credit) > 0.005) {
      return NextResponse.json({ error: 'Debits must equal credits before posting' }, { status: 400 })
    }

    const entry = await prisma.financeJournalEntry.update({
      where: { id },
      data:  { isPosted: true },
      include: ENTRY_INCLUDE,
    })
    return NextResponse.json(entry)
  }

  // ── Reverse a posted entry ───────────────────────────────────────────────

  if (action === 'reverse') {
    if (!existing.isPosted) {
      return NextResponse.json({ error: 'Only posted entries can be reversed' }, { status: 400 })
    }
    if (existing.isReversed) {
      return NextResponse.json({ error: 'Entry has already been reversed' }, { status: 400 })
    }

    const { reversalDate, reversalDescription } = json
    const reference = await nextReference(session.familyId)

    const [reversal] = await prisma.$transaction([
      prisma.financeJournalEntry.create({
        data: {
          reference,
          date:         new Date(reversalDate ?? new Date()),
          description:  reversalDescription?.trim() ?? `Reversal of ${existing.reference}: ${existing.description}`,
          type:         'reversal',
          isPosted:     true,
          reversalOfId: existing.id,
          entityId:     existing.entityId,
          familyId:     session.familyId,
          lines: {
            create: existing.lines.map(l => ({
              glAccountId: l.glAccountId,
              side:        l.side === 'debit' ? 'credit' : 'debit',
              amount:      l.amount,
              description: l.description,
              memberId:    l.memberId,
            })),
          },
        },
        include: ENTRY_INCLUDE,
      }),
      prisma.financeJournalEntry.update({
        where: { id: existing.id },
        data:  { isReversed: true },
      }),
    ])

    return NextResponse.json(reversal, { status: 201 })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}

// ── DELETE /api/finance/journals ──────────────────────────────────────────────
// Delete a draft by ?id= (posted entries cannot be deleted)

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeJournalEntry.findFirst({
    where: { id, familyId: session.familyId },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 })
  }
  if (existing.isPosted) {
    return NextResponse.json({ error: 'Posted entries cannot be deleted. Create a reversal instead.' }, { status: 400 })
  }

  await prisma.financeJournalEntry.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
