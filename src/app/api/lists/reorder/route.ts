import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _PATCH(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { items } = body

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 })
  }

  for (const item of items) {
    if (typeof item.id !== 'string' || typeof item.sortOrder !== 'number') {
      return NextResponse.json(
        { error: 'each item must have id (string) and sortOrder (number)' },
        { status: 400 }
      )
    }
  }

  // Verify all items belong to this family
  const ids = (items as { id: string; sortOrder: number }[]).map((i) => i.id)
  const owned = await prisma.list.findMany({
    where: { id: { in: ids }, familyId: user.familyId },
    select: { id: true },
  })
  if (owned.length !== ids.length) {
    return NextResponse.json({ error: 'Some lists not found' }, { status: 404 })
  }

  await prisma.$transaction(
    (items as { id: string; sortOrder: number }[]).map(({ id, sortOrder }) =>
      prisma.list.update({ where: { id }, data: { sortOrder } })
    )
  )

  return NextResponse.json({ ok: true })
}

export const PATCH = withRouteErrors(_PATCH)
