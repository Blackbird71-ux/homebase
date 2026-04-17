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
    list = await prisma.list.create({
      data: { name: 'Groceries', type: 'SHOPPING', familyId: user.familyId },
    })
  }

  if (mode === 'replace') {
    await prisma.listItem.deleteMany({ where: { listId: list.id } })
  }

  await prisma.listItem.createMany({
    data: items.map((item, i) => ({
      content: item.text,
      category: item.category,
      sortOrder: i,
      createdBy: user.id,
      listId: list!.id,
    })),
  })

  return NextResponse.json({ listId: list.id, itemCount: items.length })
}
