import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { DEFAULT_ITEMS } from '@/components/budget-planner/defaultItems'

export async function POST() {
  const session = await requireSession()

  // Delete all existing items for this user
  await prisma.budgetPlannerItem.deleteMany({
    where: { userId: session.id },
  })

  // Create default items
  const items = await prisma.budgetPlannerItem.createMany({
    data: DEFAULT_ITEMS.map((item) => ({
      userId: session.id,
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
    where: { userId: session.id },
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json(createdItems)
}
