import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit-log'

// PATCH /api/finance/drafts/[id]
// Edits a draft's basic fields and nulls spawnedSnapshotHash so the draft
// is treated as "changed" by bulkApproveUnchanged.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const { kind, ...fields } = body

  try {
    if (kind === 'bill') {
      const existing = await prisma.financeRecurringBill.findFirst({
        where: { id, familyId: user.familyId, status: 'draft' },
        select: { id: true, name: true, journalEntryId: true, billDate: true, nextDueDate: true },
      })
      if (!existing) {
        return NextResponse.json({ error: 'Draft bill not found' }, { status: 404 })
      }

      const data: Record<string, unknown> = { spawnedSnapshotHash: null }
      if (fields.name !== undefined) data.name = fields.name
      if (fields.amount !== undefined) data.amount = parseFloat(fields.amount)
      if (fields.nextDueDate !== undefined) data.nextDueDate = new Date(fields.nextDueDate)
      if (fields.billDate !== undefined) data.billDate = fields.billDate ? new Date(fields.billDate) : null
      if (fields.categoryId !== undefined) data.categoryId = fields.categoryId || null
      if (fields.vendorId !== undefined) data.vendorId = fields.vendorId || null
      if (fields.memberId !== undefined) data.memberId = fields.memberId || null
      if (fields.entityId !== undefined) data.entityId = fields.entityId || null
      if (fields.taxClassification !== undefined) data.taxClassification = fields.taxClassification || null
      if (fields.frequency !== undefined) data.frequency = fields.frequency || null
      if (fields.notes !== undefined) data.notes = fields.notes || null

      const hasLines = fields.lines && Array.isArray(fields.lines) && fields.lines.length >= 2
      const journalEntryId = existing.journalEntryId

      const lineData = hasLines
        ? (fields.lines as Record<string, unknown>[]).map(l => ({
            glAccountId: String(l.glAccountId),
            side: String(l.side),
            amount: parseFloat(String(l.amount)) || 0,
            description: l.description ? String(l.description) : null,
          }))
        : []

      const updated = await prisma.$transaction(async (tx) => {
        const bill = await tx.financeRecurringBill.update({ where: { id }, data })

        if (hasLines) {
          if (journalEntryId) {
            await tx.financeJournalEntry.update({
              where: { id: journalEntryId },
              data: { lines: { deleteMany: {}, create: lineData } },
            })
          } else {
            // Old draft without a pre-spawn journal — create one now so approval
            // can promote it via branch (a) of postBillAccrualJournal.
            const draftJournal = await tx.financeJournalEntry.create({
              data: {
                reference: null,
                date: existing.billDate ?? existing.nextDueDate,
                description: existing.name,
                type: 'auto_transaction',
                isPosted: false,
                familyId: user.familyId,
                lines: { create: lineData },
              },
              select: { id: true },
            })
            await tx.financeRecurringBill.update({
              where: { id },
              data: { journalEntryId: draftJournal.id },
            })
          }
        }

        return bill
      })

      await createAuditLog(
        user, 'update', 'financeDraftBill', id,
        `Edited bill draft "${existing.name}"`,
        { action: 'edit', fields: Object.keys(data).filter(k => k !== 'spawnedSnapshotHash') },
      )

      return NextResponse.json(updated)
    } else if (kind === 'income') {
      const existing = await prisma.financeIncomeEntry.findFirst({
        where: { id, familyId: user.familyId, status: 'draft' },
        select: { id: true, name: true, journalEntryId: true, nextExpectedDate: true },
      })
      if (!existing) {
        return NextResponse.json({ error: 'Draft income entry not found' }, { status: 404 })
      }

      const data: Record<string, unknown> = { spawnedSnapshotHash: null }
      if (fields.name !== undefined) data.name = fields.name
      if (fields.amount !== undefined) data.amount = parseFloat(fields.amount)
      if (fields.nextExpectedDate !== undefined) data.nextExpectedDate = new Date(fields.nextExpectedDate)
      if (fields.categoryId !== undefined) data.categoryId = fields.categoryId || null
      if (fields.vendorId !== undefined) data.vendorId = fields.vendorId || null
      if (fields.memberId !== undefined) data.memberId = fields.memberId || null
      if (fields.entityId !== undefined) data.entityId = fields.entityId || null
      if (fields.taxClassification !== undefined) data.taxClassification = fields.taxClassification || null
      if (fields.frequency !== undefined) data.frequency = fields.frequency || null
      if (fields.notes !== undefined) data.notes = fields.notes || null

      const hasLines = fields.lines && Array.isArray(fields.lines) && fields.lines.length >= 2
      const journalEntryId = existing.journalEntryId

      const lineData = hasLines
        ? (fields.lines as Record<string, unknown>[]).map(l => ({
            glAccountId: String(l.glAccountId),
            side: String(l.side),
            amount: parseFloat(String(l.amount)) || 0,
            description: l.description ? String(l.description) : null,
          }))
        : []

      const updated = await prisma.$transaction(async (tx) => {
        const entry = await tx.financeIncomeEntry.update({ where: { id }, data })

        if (hasLines) {
          if (journalEntryId) {
            await tx.financeJournalEntry.update({
              where: { id: journalEntryId },
              data: { lines: { deleteMany: {}, create: lineData } },
            })
          } else {
            // Old draft without a pre-spawn journal — create one now so approval
            // can promote it via branch (a) of postIncomeAccrualJournal.
            const draftJournal = await tx.financeJournalEntry.create({
              data: {
                reference: null,
                date: existing.nextExpectedDate,
                description: existing.name,
                type: 'auto_transaction',
                isPosted: false,
                familyId: user.familyId,
                lines: { create: lineData },
              },
              select: { id: true },
            })
            await tx.financeIncomeEntry.update({
              where: { id },
              data: { journalEntryId: draftJournal.id },
            })
          }
        }

        return entry
      })

      await createAuditLog(
        user, 'update', 'financeDraftIncome', id,
        `Edited income draft "${existing.name}"`,
        { action: 'edit', fields: Object.keys(data).filter(k => k !== 'spawnedSnapshotHash') },
      )

      return NextResponse.json(updated)
    } else {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
