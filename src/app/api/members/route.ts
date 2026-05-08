import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET() {
  const session = await requireSession()

  const members = await prisma.user.findMany({
    where: { familyId: session.familyId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(members)
}
