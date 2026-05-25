import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { DEFAULT_ITEMS } from '@/components/budget-planner/defaultItems'

export async function POST() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Delete all existing items for this user
  await prisma.budgetPlannerItem.deleteMany({
    where: { userId: user.id },
  })

  // Create default items
  const items = await prisma.budgetPlannerItem.createMany({
    data: DEFAULT_ITEMS.map((item) => ({
      userId: user.id,
      type: item.type,
      category: item.category,
      subcategory: item.subcategory,
      amount: item.amount,
      frequency: item.frequency,
      sortOrder: item.sortOrder,
    })),
  })

  // Return the newly created items
  const createdItems = await prisma.budgetPlannerItem.findMany({
    where: { userId: user.id },
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json(createdItems)
}
