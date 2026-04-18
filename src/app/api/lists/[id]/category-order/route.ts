import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import type { ShoppingCategory } from '@/lib/list-helpers'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { categoryOrder } = body

  if (!Array.isArray(categoryOrder)) {
    return NextResponse.json({ error: 'categoryOrder must be an array' }, { status: 400 })
  }

  const valid = new Set<string>(SHOPPING_CATEGORIES)
  const invalid = (categoryOrder as string[]).filter((c) => !valid.has(c))
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Unknown categories: ${invalid.join(', ')}` },
      { status: 400 }
    )
  }

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.list.update({
    where: { id },
    data: { categoryOrder: JSON.stringify(categoryOrder as ShoppingCategory[]) },
  })
  return NextResponse.json(updated)
}
