import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { prisma } from '@/lib/prisma'

const RECEIVED_INCOME_INCLUDE = {
  account: { select: { id: true, name: true } },
  category: true,
  location: { select: { id: true, name: true } },
  entity: { select: { id: true, name: true, color: true, type: true } },
}

export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const entries = await prisma.financeIncomeEntry.findMany({
    where: { familyId: user.familyId, received: true, isVoided: false },
    include: RECEIVED_INCOME_INCLUDE,
    orderBy: { receivedDate: 'desc' },
  })
  return NextResponse.json(entries)
}
