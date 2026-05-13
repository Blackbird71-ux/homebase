import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { nextJournalReference } from '@/lib/finance-journal-ref'

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
  // Return shallow amendment children so the row can display "Amended by JE-XXXX"
  amendments: {
    select: { id: true, reference: true },
  },
}


/** Maximum attempts to retry a create when the unique constraint on (familyId, reference) fires (P1-5). */
const MAX_REF_RETRIES = 10

/**
 * Generate a unique reference and attempt the create callback.
 * If Prisma P2002 fires (duplicate reference from a concurrent request),
 * loop and try again with a fresh reference.
 */
async function createEntryWithRetry(
  buildData: (reference: string) => any,
  familyId: string,
): Promise<any> {
  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    const reference = await nextJournalReference(familyId)
    try {
      return await prisma.financeJournalEntry.create({
        data: buildData(reference),
        include: ENTRY_INCLUDE,
      })
    } catch (err: any) {
      if (err.code === 'P2002' && attempt < MAX_REF_RETRIES - 1) continue
      throw err
    }
  }
}

/**
 * Same as createEntryWithRetry but within a $transaction. Returns the
 * first element of the transaction result (e.g. [createdEntry, ...]).
 */
async function createEntryInTxWithRetry(
  buildTx: (reference: string) => any,
  familyId: string,
): Promise<any> {
  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    const reference = await nextJournalReference(familyId)
    try {
      const result = await prisma.$transaction(buildTx(reference))
      return result[0]
    } catch (err: any) {
      if (err.code === 'P2002' && attempt < MAX_REF_RETRIES - 1) continue
      throw err
    }
  }
}

// ── GET /api/finance/journals ─────────────────────────────────────────────────
// Query params:
//   page, limit
//   isPosted   — 'true' | 'false' | omit for all
//   typeFilter — 'manual' (default) | 'all'
//               'manual' = type IN (manual, adjustment, reversal)
//                          These are entries created via the Journals page editor.
//               'all'    = no type restriction — forensic catch-all including
//                          auto_transaction, opening_balance, and orphaned entries.

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)

  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10))
  const skip  = (page - 1) * limit

  const isPostedParam = searchParams.get('isPosted')
  const typeFilter    = searchParams.get('typeFilter') ?? 'manual'

  const where: {
    familyId: string
    isPosted?: boolean
    type?: { in: string[] }
  } = { familyId: session.familyId }

  if (isPostedParam === 'true')  where.isPosted = true
  if (isPostedParam === 'false') where.isPosted = false

  // 'manual' scope: only entries created via the Journals page editor
  // 'all' scope:    everything — forensic view, no type restriction
  if (typeFilter === 'manual') {
    where.type = { in: ['manual', 'adjustment', 'reversal'] }
  }

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

  const entry = await createEntryWithRetry(
    (reference) => ({
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
    }),
    session.familyId,
  )

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

    const reversal = await createEntryInTxWithRetry(
      (reference) => [
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
      ],
      session.familyId,
    )

    return NextResponse.json(reversal, { status: 201 })
  }

  // ── Void a posted entry (reverse + mark isReversed) ──────────────────────
  // This is the same as reverse but the description always reads "Void of ..."
  // and the original is labelled VOID in the UI. The voiding reversal entry
  // can then be deleted via DELETE ?id=... (see below).

  if (action === 'void') {
    if (!existing.isPosted) {
      return NextResponse.json({ error: 'Only posted entries can be voided' }, { status: 400 })
    }
    if (existing.isReversed) {
      return NextResponse.json({ error: 'Entry has already been voided / reversed' }, { status: 400 })
    }

    const { voidDate } = json

    const voidEntry = await createEntryInTxWithRetry(
      (reference) => [
        prisma.financeJournalEntry.create({
          data: {
            reference,
            date:         new Date(voidDate ?? new Date()),
            description:  `VOID: ${existing.reference ?? existing.id} — ${existing.description}`,
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
      ],
      session.familyId,
    )

    return NextResponse.json(voidEntry, { status: 201 })
  }

  // ── Amend a posted entry (reverse + repost corrected version) ──────────
  // This is the proper accounting workflow for correcting a posted entry:
  //   1. A reversal entry is posted (type='reversal', reversalOfId → original) to zero out the GL effect.
  //   2. The original is marked isReversed=true.
  //   3. A new corrective entry is posted (type='manual', amendmentOfId → original) with the user's corrections.
  // All three writes happen atomically in a single $transaction.
  // The corrective entry gets its own new reference number (e.g. JE-0047).
  // The reversal also gets a new reference number (e.g. JE-0046).
  // Both are posted immediately — amendments are never saved as drafts.

  if (action === 'amend') {
    if (!existing.isPosted) {
      return NextResponse.json({ error: 'Only posted entries can be amended' }, { status: 400 })
    }
    if (existing.isReversed) {
      return NextResponse.json({ error: 'Entry has already been reversed or amended' }, { status: 400 })
    }
    // Only manual/adjustment entries can be amended via this flow.
    // Auto-generated entries (bills, income, opening balances) are managed by their own modules.
    if (!['manual', 'adjustment'].includes(existing.type)) {
      return NextResponse.json(
        { error: 'Only manual and adjustment entries can be amended. Use the originating module to correct auto-generated entries.' },
        { status: 400 },
      )
    }

    const { correctionDate, correctionDescription, correctionLines, correctionEntityId } = json

    if (!correctionDate) {
      return NextResponse.json({ error: 'correctionDate is required' }, { status: 400 })
    }
    if (!Array.isArray(correctionLines) || correctionLines.length < 2) {
      return NextResponse.json({ error: 'At least 2 corrected journal lines are required' }, { status: 400 })
    }

    // Validate corrective lines balance
    const corrDebit  = correctionLines.filter((l: { side: string }) => l.side === 'debit') .reduce((s: number, l: { amount: number }) => s + (l.amount ?? 0), 0)
    const corrCredit = correctionLines.filter((l: { side: string }) => l.side === 'credit').reduce((s: number, l: { amount: number }) => s + (l.amount ?? 0), 0)
    if (Math.abs(corrDebit - corrCredit) > 0.005) {
      return NextResponse.json({ error: 'Corrected entry: debits must equal credits' }, { status: 400 })
    }

    // Verify all GL accounts in the corrective lines belong to this family
    const corrGlIds = [...new Set(correctionLines.map((l: { glAccountId: string }) => l.glAccountId))]
    const validCorrAccounts = await prisma.financeCategory.findMany({
      where: { id: { in: corrGlIds as string[] }, familyId: session.familyId },
      select: { id: true },
    })
    if (validCorrAccounts.length !== corrGlIds.length) {
      return NextResponse.json({ error: 'One or more GL accounts in the corrected entry not found' }, { status: 400 })
    }

    // We need two new references: one for the reversal, one for the corrective entry.
    // createEntryInTxWithRetry only generates one reference per attempt, so we generate
    // both upfront and build the transaction with both. Retry the whole block on P2002.
    let amendmentEntry: any
    for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
      const reversalRef   = await nextJournalReference(session.familyId)
      const correctionRef = await nextJournalReference(session.familyId)
      try {
        const result = await prisma.$transaction([
          // Step 1: Create the reversing entry (zeroes out the GL effect of the original)
          prisma.financeJournalEntry.create({
            data: {
              reference:    reversalRef,
              date:         new Date(correctionDate),
              description:  `Reversal of ${existing.reference ?? existing.id}: ${existing.description}`,
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
          }),
          // Step 2: Mark the original as reversed
          prisma.financeJournalEntry.update({
            where: { id: existing.id },
            data:  { isReversed: true },
          }),
          // Step 3: Create the new corrective entry
          prisma.financeJournalEntry.create({
            data: {
              reference:     correctionRef,
              date:          new Date(correctionDate),
              description:   correctionDescription?.trim()
                               ?? `Amendment of ${existing.reference ?? existing.id}: ${existing.description}`,
              type:          existing.type, // preserve manual | adjustment
              isPosted:      true,
              amendmentOfId: existing.id,
              entityId:      correctionEntityId ?? existing.entityId ?? null,
              familyId:      session.familyId,
              lines: {
                create: correctionLines.map((l: { glAccountId: string; side: string; amount: number; description?: string; memberId?: string }) => ({
                  glAccountId: l.glAccountId,
                  side:        l.side,
                  amount:      l.amount,
                  description: l.description || null,
                  memberId:    l.memberId    || null,
                })),
              },
            },
            include: ENTRY_INCLUDE,
          }),
        ])
        amendmentEntry = result[2] // the corrective entry with full include
        break
      } catch (err: any) {
        if (err.code === 'P2002' && attempt < MAX_REF_RETRIES - 1) continue
        throw err
      }
    }

    return NextResponse.json(amendmentEntry, { status: 201 })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}

// ── DELETE /api/finance/journals ──────────────────────────────────────────────
// Allowed cases:
//   1. Draft (isPosted=false) — delete directly.
//   2. Voided original (isPosted=true, isReversed=true) — delete original + all
//      its reversal children atomically.
//   3. Reversal/void child (type='reversal', isPosted=true, reversalOfId set) —
//      delete the reversal entry and restore isReversed=false on the parent.
//      Lets users delete from either entry in a void pair.
//
// Posted entries that are not voided and not reversals cannot be deleted.

export async function DELETE(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeJournalEntry.findFirst({
    where: { id, familyId: session.familyId },
    include: { reversals: { select: { id: true } } },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 })
  }

  // Case 1: draft — simple delete
  if (!existing.isPosted) {
    await prisma.financeJournalEntry.delete({ where: { id } })
    return NextResponse.json({ success: true })
  }

  // Case 2: voided original — delete original + all its reversal children atomically
  if (existing.isPosted && existing.isReversed) {
    const reversalIds = existing.reversals.map((r: { id: string }) => r.id)
    await prisma.$transaction([
      // Delete the reversal entries first (they reference the original via reversalOfId)
      prisma.financeJournalEntry.deleteMany({
        where: { id: { in: reversalIds }, familyId: session.familyId },
      }),
      // Now delete the original
      prisma.financeJournalEntry.delete({ where: { id } }),
    ])
    return NextResponse.json({ success: true })
  }

  // Case 3: reversal/void child — delete it and restore the parent to un-reversed.
  // This lets users delete from either entry in the void pair.
  if (existing.isPosted && existing.type === 'reversal' && existing.reversalOfId) {
    const parentId = existing.reversalOfId
    await prisma.$transaction([
      prisma.financeJournalEntry.delete({ where: { id } }),
      prisma.financeJournalEntry.updateMany({
        where: { id: parentId, familyId: session.familyId },
        data: { isReversed: false },
      }),
    ])
    return NextResponse.json({ success: true })
  }

  // Case 4: posted auto_transaction (system-created via income/bill dialogs) — allow direct deletion.
  // These are never created manually so void-first is not required.
  if (existing.isPosted && existing.type === 'auto_transaction') {
    await prisma.financeJournalEntry.delete({ where: { id } })
    return NextResponse.json({ success: true })
  }

  // Posted, not voided, not a reversal, not auto — refuse
  return NextResponse.json(
    { error: 'Posted entries cannot be deleted. Void the entry first, then delete.' },
    { status: 400 },
  )
}
