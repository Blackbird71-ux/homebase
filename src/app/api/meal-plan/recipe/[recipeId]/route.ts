import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _DELETE(
  _req: Request,
  { params }: { params: Promise<{ recipeId: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { recipeId } = await params

  const mealPlanRecipe = await prisma.mealPlanRecipe.findFirst({
    where: { id: recipeId },
    include: { mealPlan: { select: { id: true, familyId: true } } },
  })

  if (!mealPlanRecipe || mealPlanRecipe.mealPlan.familyId !== user.familyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const mealPlanId = mealPlanRecipe.mealPlanId

  const remainingCount = await prisma.mealPlanRecipe.count({ where: { mealPlanId } })

  if (remainingCount <= 1) {
    await prisma.mealPlan.delete({ where: { id: mealPlanId } })
    return NextResponse.json({ mealPlanDeleted: true, mealPlanId })
  }

  await prisma.mealPlanRecipe.delete({ where: { id: recipeId } })
  return NextResponse.json({ mealPlanDeleted: false, mealPlanId })
}

export const DELETE = withRouteErrors(_DELETE)
