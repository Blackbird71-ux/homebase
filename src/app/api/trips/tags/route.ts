import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

// GET /api/trips/tags — list all trip-scoped tags for the family
export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tags = await prisma.tag.findMany({
    where: { familyId: user.familyId, scope: 'trip' },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(tags.map((t) => ({
    id: t.id,
    name: t.name,
    emoji: t.emoji,
    color: t.color,
    sortOrder: t.sortOrder,
    createdAt: t.createdAt.toISOString(),
    usageCount: 0,
  })))
}

// POST /api/trips/tags — create a new trip-scoped tag
export async function POST(req: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, emoji, color } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Check for duplicate within family
  const existing = await prisma.tag.findFirst({
    where: { familyId: user.familyId, name: name.trim() },
  })
  if (existing) {
    return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 })
  }

  const maxOrder = await prisma.tag.aggregate({
    where: { familyId: user.familyId, scope: 'trip' },
    _max: { sortOrder: true },
  })

  const tag = await prisma.tag.create({
    data: {
      familyId: user.familyId,
      name: name.trim(),
      emoji: emoji?.trim() || null,
      color: color || null,
      scope: 'trip',
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })

  return NextResponse.json({
    id: tag.id,
    name: tag.name,
    emoji: tag.emoji,
    color: tag.color,
    sortOrder: tag.sortOrder,
    createdAt: tag.createdAt.toISOString(),
    usageCount: 0,
  }, { status: 201 })
}
