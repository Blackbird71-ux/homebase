import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

const ENTRY_INCLUDE = {
  lines: {
    include: {
      glAccount: { select: { id: true, name: true, type: true, glCode: true } },
    },
    orderBy: [{ side: 'asc' as const }, { amount: 'desc' as const }],
  },
  entity: { select: { id: true, name: true, color: true } },
  amendments: { select: { id: true, reference: true } },
}

// GET /api/finance/journals/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  const { id } = await params
  const entry = await prisma.financeJournalEntry.findFirst({
    where: { id, familyId: session.familyId },
    include: ENTRY_INCLUDE,
  })
  if (!entry) {
    return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 })
  }
  return NextResponse.json(entry)
}
