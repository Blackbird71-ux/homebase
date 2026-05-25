import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()

  const existing = await prisma.wishlistItem.findUnique({ where: { id } })
  if (!existing || existing.familyId !== user.familyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { title, url, notes, estimatedPrice, occasion, contactId, isPurchased } = body

  const data: Record<string, unknown> = {}
  if (title !== undefined) data.title = title.trim()
  if (url !== undefined) data.url = url ?? null
  if (notes !== undefined) data.notes = notes ?? null
  if (estimatedPrice !== undefined) data.estimatedPrice = estimatedPrice ?? null
  if (occasion !== undefined) data.occasion = occasion ?? null
  if (contactId !== undefined) data.contactId = contactId ?? null
  if (isPurchased !== undefined) {
    data.isPurchased = isPurchased
    data.purchasedById = isPurchased ? user.id : null
    data.purchasedAt = isPurchased ? new Date() : null
  }

  const item = await prisma.wishlistItem.update({
    where: { id },
    data,
    include: {
      contact: { select: { id: true, name: true } },
      suggestedBy: { select: { id: true, name: true } },
      purchasedBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(item)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  const { id } = await params

  const existing = await prisma.wishlistItem.findUnique({ where: { id } })
  if (!existing || existing.familyId !== user.familyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.wishlistItem.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
