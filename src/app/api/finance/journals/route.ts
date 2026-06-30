import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { nextJournalReference, nextNJournalReferences } from '@/lib/finance-journal-ref'
import { getPeriodLockWarning } from '@/lib/finance-period-lock'
import { reverseJournalEntry, type ReversibleJournalEntry } from '@/lib/finance-posting'

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
 * Reverse a single posted entry via the shared reverseJournalEntry helper,
 * retrying on a P2002 reference collision. The reference is generated from
 * committed MAX *before* each $transaction attempt (SQLite committed-read rule);
 * a collision rolls back and retries with a fresh reference.
 */
async function reverseEntryWithRetry(
  je: ReversibleJournalEntry,
  familyId: string,
  opts: { date: Date; description?: string },
): Promise<{ reversalId: string }> {
  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    const reference = await nextJournalReference(familyId)
    try {
      return await prisma.$transaction((tx) =>
        reverseJournalEntry(tx, je, { reference, date: opts.date, familyId, description: opts.description }),
      )
    } catch (err: any) {
      if (err.code === 'P2002' && attempt < MAX_REF_RETRIES - 1) continue
      throw err
    }
  }
  throw new Error('Failed to generate a unique journal reference after retries')
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
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  } = { familyId: user.familyId }

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
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    where: { id: { in: glIds as string[] }, familyId: user.familyId },
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
      familyId:    user.familyId,
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
    user.familyId,
  )

  const periodWarning = postImmediately
    ? await getPeriodLockWarning(user.familyId, new Date(date))
    : null

  return NextResponse.json(periodWarning ? { ...entry, periodWarning } : entry, { status: 201 })
}

// ── PUT /api/finance/journals ─────────────────────────────────────────────────
// Update a draft entry (posted entries cannot be edited)

export async function PUT(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { id, date, description, type, entityId, postImmediately, lines } = json

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeJournalEntry.findFirst({
    where: { id, familyId: user.familyId },
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
    where: { id: { in: glIds as string[] }, familyId: user.familyId },
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
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const json = await request.json()
  const { id, action } = json

  if (!id || !action) {
    return NextResponse.json({ error: 'id and action are required' }, { status: 400 })
  }

  const existing = await prisma.financeJournalEntry.findFirst({
    where: { id, familyId: user.familyId },
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

    const { reversalId } = await reverseEntryWithRetry(existing, user.familyId, {
      date:        new Date(reversalDate ?? new Date()),
      description: reversalDescription?.trim() ?? `Reversal of ${existing.reference}: ${existing.description}`,
    })

    const reversal = await prisma.financeJournalEntry.findUnique({
      where: { id: reversalId },
      include: ENTRY_INCLUDE,
    })

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

    // Description omitted → helper default `VOID: ${reference ?? id} — ${description}`,
    // which is exactly the text this handler produced inline.
    const { reversalId } = await reverseEntryWithRetry(existing, user.familyId, {
      date: new Date(voidDate ?? new Date()),
    })

    const voidEntry = await prisma.financeJournalEntry.findUnique({
      where: { id: reversalId },
      include: ENTRY_INCLUDE,
    })

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
      where: { id: { in: corrGlIds as string[] }, familyId: user.familyId },
      select: { id: true },
    })
    if (validCorrAccounts.length !== corrGlIds.length) {
      return NextResponse.json({ error: 'One or more GL accounts in the corrected entry not found' }, { status: 400 })
    }

    // We need two new references: one for the reversal, one for the corrective entry.
    // nextJournalReference reads committed MAX, so calling it twice with no commit
    // between returns the SAME value — which collides on the unique (familyId,
    // reference) index. Use nextNJournalReferences(…, 2) to get two DISTINCT
    // sequential refs in one shot. Both are pre-generated before the $transaction
    // opens (SQLite committed-read rule); a P2002 collision (concurrent request)
    // rolls back and retries the whole block with fresh refs.
    let amendmentEntry: any
    for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
      const [reversalRef, correctionRef] = await nextNJournalReferences(user.familyId, 2)
      try {
        amendmentEntry = await prisma.$transaction(async (tx) => {
          // Steps 1+2: reverse the original via the shared helper — creates the
          // flipped-line reversal entry (zeroes out the GL effect) and marks the
          // original isReversed. The non-VOID "Reversal of …" description is preserved.
          await reverseJournalEntry(tx, existing, {
            reference:   reversalRef,
            date:        new Date(correctionDate),
            familyId:    user.familyId,
            description: `Reversal of ${existing.reference ?? existing.id}: ${existing.description}`,
          })
          // Step 3: Create the new corrective entry
          return tx.financeJournalEntry.create({
            data: {
              reference:     correctionRef,
              date:          new Date(correctionDate),
              description:   correctionDescription?.trim()
                               ?? `Amendment of ${existing.reference ?? existing.id}: ${existing.description}`,
              type:          existing.type, // preserve manual | adjustment
              isPosted:      true,
              amendmentOfId: existing.id,
              entityId:      correctionEntityId ?? existing.entityId ?? null,
              familyId:      user.familyId,
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
          })
        })
        break
      } catch (err: any) {
        if (err.code === 'P2002' && attempt < MAX_REF_RETRIES - 1) continue
        throw err
      }
    }

    return NextResponse.json(amendmentEntry, { status: 201 })
  }

  // ── Edit a posted entry in place ─────────────────────────────────────────
  // Direct, Xero-style edit of an already-posted journal: the user (a qualified
  // accountant) can correct the date, description, entity, and the DR/CR lines
  // of any posted entry without spawning a reversal/repost pair.
  //
  // Safety rails that are NOT negotiable:
  //   • Debits must still equal credits (a posted entry must always balance).
  //   • Every GL account must belong to this family.
  //   • At least 2 lines.
  // Preserved (never touched here): type, isPosted, isReversed, reversalOfId,
  // amendmentOfId, reference. Editing these would corrupt the audit graph
  // (e.g. a reversal that no longer points at its parent). Use the dedicated
  // Reverse / Amend / Void actions for structural changes.
  //
  // Note: editing an entry that participates in a reversal/amendment pair, or an
  // auto-generated entry, is allowed but the UI warns the user first — those
  // changes can unbalance a reversal pair or be overwritten by the originating
  // module. The period-lock warning is returned (non-blocking) like POST.

  if (action === 'edit-posted') {
    if (!existing.isPosted) {
      return NextResponse.json(
        { error: 'This action is for posted entries. Use the draft editor for drafts.' },
        { status: 400 },
      )
    }

    const { date, description, entityId, lines } = json

    if (!date || !description?.trim()) {
      return NextResponse.json({ error: 'date and description are required' }, { status: 400 })
    }
    if (!Array.isArray(lines) || lines.length < 2) {
      return NextResponse.json({ error: 'At least 2 journal lines are required' }, { status: 400 })
    }

    const debit  = lines.filter((l: { side: string }) => l.side === 'debit') .reduce((s: number, l: { amount: number }) => s + (l.amount ?? 0), 0)
    const credit = lines.filter((l: { side: string }) => l.side === 'credit').reduce((s: number, l: { amount: number }) => s + (l.amount ?? 0), 0)
    if (Math.abs(debit - credit) > 0.005) {
      return NextResponse.json({ error: 'Debits must equal credits' }, { status: 400 })
    }

    const glIds = [...new Set(lines.map((l: { glAccountId: string }) => l.glAccountId))]
    const validAccounts = await prisma.financeCategory.findMany({
      where: { id: { in: glIds as string[] }, familyId: user.familyId },
      select: { id: true },
    })
    if (validAccounts.length !== glIds.length) {
      return NextResponse.json({ error: 'One or more GL accounts not found' }, { status: 400 })
    }

    // Replace lines and update scalar fields atomically. Audit-graph fields
    // (type, isPosted, isReversed, reversalOfId, amendmentOfId, reference) are
    // deliberately omitted from the update so they are preserved as-is.
    const [, entry] = await prisma.$transaction([
      prisma.financeJournalLine.deleteMany({ where: { journalEntryId: id } }),
      prisma.financeJournalEntry.update({
        where: { id },
        data: {
          date:        new Date(date),
          description: description.trim(),
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
      }),
    ])

    const periodWarning = await getPeriodLockWarning(user.familyId, new Date(date))
    return NextResponse.json(periodWarning ? { ...entry, periodWarning } : entry)
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
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const existing = await prisma.financeJournalEntry.findFirst({
    where: { id, familyId: user.familyId },
    include: {
      reversals:  { select: { id: true } },
      amendments: { select: { id: true } },
    },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 })
  }

  // Case 1: draft — simple delete
  if (!existing.isPosted) {
    await prisma.financeJournalEntry.delete({ where: { id } })
    return NextResponse.json({ success: true })
  }

  // Case 2: reversed/amended original — delete original + all reversal children + all amendment children atomically
  if (existing.isPosted && existing.isReversed) {
    const childIds = [
      ...existing.reversals.map((r: { id: string }) => r.id),
      ...existing.amendments.map((a: { id: string }) => a.id),
    ]
    await prisma.$transaction([
      prisma.financeJournalEntry.deleteMany({
        where: { id: { in: childIds }, familyId: user.familyId },
      }),
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
        where: { id: parentId, familyId: user.familyId },
        data: { isReversed: false },
      }),
    ])
    return NextResponse.json({ success: true })
  }

  // Case 4: posted auto_transaction (system-created via bill/income/payment flows) —
  // REFUSE direct deletion. These journals are the GL backbone of a bill, income,
  // or payment: the originating subledger record holds their id (journalEntryId /
  // sourceTransactionId). Hard-deleting one orphans that record (it still points at
  // a now-missing entry), erases the GL effect with NO reversal audit trail, and
  // pushes the AP/AR subledger out of step with the GL — exactly the immutability /
  // reconciliation breakage QA §4.6 forbids. The correct way to unwind one is from
  // the originating module (un-receive the bill, void the bill/income, or delete the
  // transaction) which posts a balanced reversal. Reject here.
  if (existing.isPosted && existing.type === 'auto_transaction') {
    return NextResponse.json(
      {
        error:
          'This is a system-generated journal for a bill, income, or payment. It cannot be ' +
          'deleted directly — unwind it from the originating record (un-receive or void the ' +
          'bill/income, or delete the transaction) so a balanced reversal is posted.',
      },
      { status: 400 },
    )
  }

  // Case 5: corrective entry (amendment child) — undo the amendment by:
  //   a) deleting this corrective entry
  //   b) deleting the reversal entry that was created alongside it
  //   c) restoring isReversed=false on the original so it is active again
  if (existing.isPosted && existing.amendmentOfId) {
    const originalId = existing.amendmentOfId
    const original = await prisma.financeJournalEntry.findFirst({
      where: { id: originalId, familyId: user.familyId },
      include: { reversals: { select: { id: true } } },
    })
    if (!original) {
      // Original already gone — just remove the orphaned corrective entry
      await prisma.financeJournalEntry.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }
    const reversalIds = original.reversals.map((r: { id: string }) => r.id)
    await prisma.$transaction([
      // Delete the reversal entries that zeroed out the original
      prisma.financeJournalEntry.deleteMany({
        where: { id: { in: reversalIds }, familyId: user.familyId },
      }),
      // Delete this corrective entry
      prisma.financeJournalEntry.delete({ where: { id } }),
      // Restore the original to active (un-reversed) status
      prisma.financeJournalEntry.update({
        where: { id: originalId },
        data: { isReversed: false },
      }),
    ])
    return NextResponse.json({ success: true })
  }

  // Posted, not voided, not a reversal, not auto — refuse
  return NextResponse.json(
    { error: 'Posted entries cannot be deleted. Void the entry first, then delete.' },
    { status: 400 },
  )
}
