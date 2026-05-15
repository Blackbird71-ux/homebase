import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

const RECEIVED_INCOME_INCLUDE = {
  account: { select: { id: true, name: true } },
  category: true,
  location: { select: { id: true, name: true } },
  entity: { select: { id: true, name: true, color: true, type: true } },
}

export async function GET() {
  const session = await requireSession()
  const entries = await prisma.financeIncomeEntry.findMany({
    where: { familyId: session.familyId, received: true, isVoided: false },
    include: RECEIVED_INCOME_INCLUDE,
    orderBy: { receivedDate: 'desc' },
  })
  return NextResponse.json(entries)
}
