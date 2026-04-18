import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(list.items)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { content, category, dueDate, sortOrder, recipeId, recipeName } = body

  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const parsed = dueDate ? new Date(dueDate) : null
  if (parsed !== null && isNaN(parsed.getTime())) {
    return NextResponse.json({ error: 'dueDate is not a valid ISO date' }, { status: 400 })
  }

  const list = await prisma.list.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const item = await prisma.listItem.create({
    data: {
      content,
      category: category ?? null,
      dueDate: parsed,
      sortOrder: sortOrder ?? 0,
      recipeId: recipeId ?? null,
      recipeName: recipeName ?? null,
      createdBy: user.id,
      listId: id,
    },
  })
  return NextResponse.json(item, { status: 201 })
}
