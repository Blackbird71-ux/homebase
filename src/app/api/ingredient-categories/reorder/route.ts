import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function PATCH(req: Request) {
  const user = await requireSession()
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

  await (prisma as any).$transaction(
    items.map((item: any) =>
      (prisma as any).ingredientCategory.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      })
    )
  )

  return NextResponse.json({ success: true })
}
