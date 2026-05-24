import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ recipeId: string }> }
) {
  const user = await requireSession()
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
