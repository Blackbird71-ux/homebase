import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const members = await prisma.user.findMany({
    where: { familyId: user.familyId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(members)
}
