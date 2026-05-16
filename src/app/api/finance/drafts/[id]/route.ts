import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit-log'

// PATCH /api/finance/drafts/[id]
// Edits a draft's basic fields and nulls spawnedSnapshotHash so the draft
// is treated as "changed" by bulkApproveUnchanged.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { kind, ...fields } = body

  try {
    if (kind === 'bill') {
      const existing = await prisma.financeRecurringBill.findFirst({
        where: { id, familyId: user.familyId, status: 'draft' },
        select: { id: true, name: true },
      })
      if (!existing) {
        return NextResponse.json({ error: 'Draft bill not found' }, { status: 404 })
      }

      const data: Record<string, unknown> = { spawnedSnapshotHash: null }
      if (fields.name !== undefined) data.name = fields.name
      if (fields.amount !== undefined) data.amount = parseFloat(fields.amount)
      if (fields.nextDueDate !== undefined) data.nextDueDate = new Date(fields.nextDueDate)
      if (fields.categoryId !== undefined) data.categoryId = fields.categoryId || null
      if (fields.vendorId !== undefined) data.vendorId = fields.vendorId || null
      if (fields.notes !== undefined) data.notes = fields.notes || null

      const updated = await prisma.financeRecurringBill.update({
        where: { id },
        data,
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
        select: { id: true, name: true },
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
      if (fields.notes !== undefined) data.notes = fields.notes || null

      const updated = await prisma.financeIncomeEntry.update({
        where: { id },
        data,
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
