import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { DEFAULT_ITEMS } from '@/components/budget-planner/defaultItems'

export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let items = await prisma.budgetPlannerItem.findMany({
    where: { userId: user.id },
    orderBy: { sortOrder: 'asc' },
  })

  if (items.length === 0) {
    await prisma.budgetPlannerItem.createMany({
      data: DEFAULT_ITEMS.map((item) => ({ ...item, userId: user.id })),
    })
    items = await prisma.budgetPlannerItem.findMany({
      where: { userId: user.id },
      orderBy: { sortOrder: 'asc' },
    })
  }

  return NextResponse.json(items)
}

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    where: { userId: user.id, type },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  const item = await prisma.budgetPlannerItem.create({
    data: {
      userId: user.id,
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
