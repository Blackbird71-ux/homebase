import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { createAuditLog } from '@/lib/audit-log'

export async function GET(req: NextRequest) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  const where: Record<string, unknown> = { familyId: user.familyId, isActive: true }
  if (type === 'SHOPPING' || type === 'TODO') {
    where.type = type
  }

  const lists = await prisma.list.findMany({
    where,
    orderBy: { createdAt: 'desc' },
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

  void createAuditLog(
    user,
    'create',
    'list',
    list.id,
    `Created ${type === 'SHOPPING' ? 'shopping' : 'to-do'} list "${name}"`,
    { list: { name, type } }
  )

  return NextResponse.json(list, { status: 201 })
}
