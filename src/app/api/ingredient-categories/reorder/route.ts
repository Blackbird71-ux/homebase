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

  if (!Array.isArray(items) || items.some((i: any) => typeof i.id !== 'string' || typeof i.sortOrder !== 'number')) {
    return NextResponse.json({ error: 'items must be an array of { id, sortOrder }' }, { status: 400 })
  }

  const ids = items.map((i: any) => i.id as string)

  // Verify all categories belong to this family
  const existing = await (prisma as any).ingredientCategory.findMany({
    where: { id: { in: ids }, familyId: user.familyId },
    select: { id: true },
  })

  if (existing.length !== ids.length) {
    return NextResponse.json({ error: 'One or more categories not found' }, { status: 404 })
  }

  // Fetch the category names for the IDs being reordered so we can sync
  // any duplicate records sharing the same category name (can happen if the
  // learn API previously created keyword mappings with isCustom=true).
  const records = await (prisma as any).ingredientCategory.findMany({
    where: { id: { in: ids }, familyId: user.familyId },
    select: { id: true, category: true },
  })

  const categoryToSortOrder = new Map<string, number>()
  for (const item of items as any[]) {
    const record = (records as any[]).find((r: any) => r.id === item.id)
    if (record) categoryToSortOrder.set(record.category, item.sortOrder)
  }

  // Update all records sharing each category name so the dedup in GET always
  // returns the same relative position regardless of which record it picks.
  await (prisma as any).$transaction(
    Array.from(categoryToSortOrder.entries()).map(([category, sortOrder]) =>
      (prisma as any).ingredientCategory.updateMany({
        where: { familyId: user.familyId, category },
        data: { sortOrder },
      })
    )
  )

  // Clear per-list saved category orders so all shopping lists pick up the
  // new global order on their next load (per-list drag can re-save from there).
  await prisma.list.updateMany({
    where: { familyId: user.familyId },
    data: { categoryOrder: null },
  })

  return NextResponse.json({ success: true })
}

export const PATCH = withRouteErrors(_PATCH)
