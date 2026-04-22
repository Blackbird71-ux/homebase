import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

interface ExportItem {
  text: string
  key: string
  category: string
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { items, mode } = body as { items: ExportItem[]; mode: 'replace' | 'append' }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 })
  }
  if (mode !== 'replace' && mode !== 'append') {
    return NextResponse.json({ error: 'mode must be replace or append' }, { status: 400 })
  }
  if (items.some(i => !i.text?.trim() || !i.key?.trim() || !i.category?.trim())) {
    return NextResponse.json({ error: 'each item must have text, key, and category' }, { status: 400 })
  }
  // No longer validating against hardcoded categories - any category is allowed

  await Promise.all(
    items.map((item) =>
      prisma.ingredientCategory.upsert({
        where: { familyId_key: { familyId: user.familyId, key: item.key } },
        update: { category: item.category },
        create: { familyId: user.familyId, key: item.key, category: item.category },
      })
    )
  )

  let list = await prisma.list.findFirst({
    where: { familyId: user.familyId, name: 'Groceries', type: 'SHOPPING', isActive: true },
  })
  if (!list) {
    try {
      list = await prisma.list.create({
        data: { name: 'Groceries', type: 'SHOPPING', familyId: user.familyId },
      })
    } catch {
      list = await prisma.list.findFirst({
        where: { familyId: user.familyId, name: 'Groceries', type: 'SHOPPING', isActive: true },
      })
      if (!list) throw new Error('Failed to find or create Groceries list')
    }
  }

  const resolvedList = list!  // guaranteed non-null: either found or created above

  if (mode === 'replace') {
    await prisma.listItem.deleteMany({ where: { listId: resolvedList.id } })
  }

  await prisma.listItem.createMany({
    data: items.map((item, i) => ({
      content: item.text,
      category: item.category,
      sortOrder: i,
      createdBy: user.id,
      listId: resolvedList.id,
    })),
  })

  return NextResponse.json({ listId: resolvedList.id, itemCount: items.length })
}
