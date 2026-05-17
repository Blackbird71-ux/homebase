import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

// GET /api/trips/tags — list all trip tags for the family
export async function GET() {
  const user = await requireSession()

  const tags = await prisma.tripTag.findMany({
    where: { familyId: user.familyId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      _count: { select: { activities: true } },
    },
  })

  return NextResponse.json(tags.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    usageCount: t._count.activities,
  })))
}

// POST /api/trips/tags — create a new trip tag
export async function POST(req: NextRequest) {
  const user = await requireSession()
  const body = await req.json()
  const { name, emoji, color } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Check for duplicate
  const existing = await prisma.tripTag.findFirst({
    where: { familyId: user.familyId, name: name.trim() },
  })
  if (existing) {
    return NextResponse.json({ error: 'A tag with this name already exists' }, { status: 409 })
  }

  const maxOrder = await prisma.tripTag.aggregate({
    where: { familyId: user.familyId },
    _max: { sortOrder: true },
  })

  const tag = await prisma.tripTag.create({
    data: {
      familyId: user.familyId,
      name: name.trim(),
      emoji: emoji?.trim() || null,
      color: color || null,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })

  return NextResponse.json({ ...tag, createdAt: tag.createdAt.toISOString(), usageCount: 0 }, { status: 201 })
}
