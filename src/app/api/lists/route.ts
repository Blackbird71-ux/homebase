import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'
import { jsonWithETag } from '@/lib/http-cache'

export async function GET(req: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const filter = searchParams.get('filter') // 'mine' | null (family)

  const where: Record<string, unknown> = { familyId: user.familyId, isActive: true }
  if (type === 'SHOPPING' || type === 'TODO') {
    where.type = type
  }
  if (filter === 'mine') {
    where.OR = [{ createdBy: user.id }, { createdBy: '' }]
  }

  const lists = await prisma.list.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { items: { where: { isCompleted: false } } } },
      items: { orderBy: { sortOrder: 'asc' } },
    },
  })
  return jsonWithETag(req, lists)
}

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, type, createdBy } = body

  if (!name || !type) {
    return NextResponse.json({ error: 'name and type are required' }, { status: 400 })
  }
  // Validate createdBy if provided — must be the current user or a family member
  if (createdBy !== undefined && createdBy !== user.id) {
    const member = await prisma.user.findFirst({
      where: { id: createdBy, familyId: user.familyId },
    })
    if (!member) {
      return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
    }
  }
  if (type !== 'SHOPPING' && type !== 'TODO') {
    return NextResponse.json({ error: 'type must be SHOPPING or TODO' }, { status: 400 })
  }

  const list = await prisma.list.create({
    data: { name, type, familyId: user.familyId, createdBy: user.id },
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
