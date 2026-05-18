import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { DEFAULT_ITEMS } from '@/components/budget-planner/defaultItems'

export async function GET() {
  const session = await requireSession()

  let items = await prisma.budgetPlannerItem.findMany({
    where: { userId: session.id },
    orderBy: { sortOrder: 'asc' },
  })

  if (items.length === 0) {
    await prisma.budgetPlannerItem.createMany({
      data: DEFAULT_ITEMS.map((item) => ({ ...item, userId: session.id })),
    })
    items = await prisma.budgetPlannerItem.findMany({
      where: { userId: session.id },
      orderBy: { sortOrder: 'asc' },
    })
  }

  return NextResponse.json(items)
}

export async function POST(req: Request) {
  const session = await requireSession()
  const body = await req.json()

  const { type, category, subcategory, amount, frequency } = body

  if (!type || !category || !subcategory) {
    return NextResponse.json(
      { error: 'type, category, and subcategory are required' },
      { status: 400 }
    )
  }

  if (!['income', 'expense'].includes(type)) {
    return NextResponse.json(
      { error: 'type must be "income" or "expense"' },
      { status: 400 }
    )
  }

  // Get the highest sortOrder for this user/type to append at the end
  const lastItem = await prisma.budgetPlannerItem.findFirst({
    where: { userId: session.id, type },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  const item = await prisma.budgetPlannerItem.create({
    data: {
      userId: session.id,
      type,
      category,
      subcategory,
      amount: typeof amount === 'number' ? amount : 0,
      frequency: frequency ?? 'monthly',
      sortOrder: (lastItem?.sortOrder ?? -1) + 1,
    },
  })

  return NextResponse.json(item, { status: 201 })
}
