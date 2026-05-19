import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSystemAdmin } from '@/lib/auth-helpers'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireSystemAdmin()
  if (check instanceof NextResponse) return check

  const { id } = await params

  const users = await prisma.user.findMany({
    where: { familyId: id },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(users)
}
