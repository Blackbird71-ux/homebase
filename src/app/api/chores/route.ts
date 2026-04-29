import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET() {
  const user = await requireSession()

  const chores = await prisma.chore.findMany({
    where: { familyId: user.familyId, isActive: true },
    include: {
      currentAssignee: { select: { id: true, name: true } },
      completions: {
        orderBy: { completedAt: 'desc' },
        take: 1,
        include: { completedBy: { select: { id: true, name: true } } },
      },
      _count: { select: { completions: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(chores)
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { title, description, frequency, dayOfWeek, dayOfMonth, rotationInterval, currentAssigneeId } = body

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const chore = await prisma.chore.create({
    data: {
      title,
      description: description ?? null,
      frequency: frequency ?? 'weekly',
      dayOfWeek: dayOfWeek ?? null,
      dayOfMonth: dayOfMonth ?? null,
      rotationInterval: rotationInterval ?? 1,
      currentAssigneeId: currentAssigneeId ?? null,
      familyId: user.familyId,
    },
    include: {
      currentAssignee: { select: { id: true, name: true } },
      completions: {
        orderBy: { completedAt: 'desc' },
        take: 1,
        include: { completedBy: { select: { id: true, name: true } } },
      },
      _count: { select: { completions: true } },
    },
  })

  return NextResponse.json(chore, { status: 201 })
}
