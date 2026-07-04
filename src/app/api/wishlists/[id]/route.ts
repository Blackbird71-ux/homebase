import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

async function _DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await prisma.wishlistItem.findUnique({ where: { id } })
  if (!existing || existing.familyId !== user.familyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.wishlistItem.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}

export const PATCH = withRouteErrors(_PATCH)
export const DELETE = withRouteErrors(_DELETE)
