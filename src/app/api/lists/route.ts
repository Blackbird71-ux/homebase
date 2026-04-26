import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET() {
  const user = await requireSession()
  const lists = await prisma.list.findMany({
    where: { familyId: user.familyId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { items: { where: { isCompleted: false } } } },
    },
  })
  return NextResponse.json(lists)
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { name, type } = body

  if (!name || !type) {
    return NextResponse.json({ error: 'name and type are required' }, { status: 400 })
  }
  if (type !== 'SHOPPING' && type !== 'TODO') {
    return NextResponse.json({ error: 'type must be SHOPPING or TODO' }, { status: 400 })
  }

  const list = await prisma.list.create({
    data: { name, type, familyId: user.familyId },
  })
  return NextResponse.json(list, { status: 201 })
}
