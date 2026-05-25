import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
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
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const entry = await prisma.financeJournalEntry.findFirst({
    where: { id, familyId: user.familyId },
    include: ENTRY_INCLUDE,
  })
  if (!entry) {
    return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 })
  }
  return NextResponse.json(entry)
}
