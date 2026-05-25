import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await prisma.wishlistItem.findMany({
    where: { familyId: user.familyId },
    include: {
      contact: { select: { id: true, name: true } },
      suggestedBy: { select: { id: true, name: true } },
      purchasedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ isPurchased: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json(items)
}

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, url, notes, estimatedPrice, occasion, contactId } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const item = await prisma.wishlistItem.create({
    data: {
      familyId: user.familyId,
      title: title.trim(),
      url: url ?? null,
      notes: notes ?? null,
      estimatedPrice: estimatedPrice ?? null,
      occasion: occasion ?? null,
      contactId: contactId ?? null,
      suggestedById: user.id,
    },
    include: {
      contact: { select: { id: true, name: true } },
      suggestedBy: { select: { id: true, name: true } },
      purchasedBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(item, { status: 201 })
}
