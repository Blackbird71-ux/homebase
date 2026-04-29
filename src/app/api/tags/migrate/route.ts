import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function POST() {
  const user = await requireSession()

  const recipes = await (prisma as any).recipe.findMany({
    where: { familyId: user.familyId },
    select: { id: true, tags: true },
  })

  let migratedTags = 0
  let updatedRecipes = 0

  for (const recipe of recipes) {
    if (!recipe.tags) continue
    const names = recipe.tags
      .split(',')
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0)

    if (names.length === 0) continue

    for (const name of names) {
      // Upsert the Tag record
      const tag = await (prisma as any).tag.upsert({
        where: { familyId_name: { familyId: user.familyId, name } },
        create: { name, familyId: user.familyId },
        update: {},
      })

      // Create RecipeTag relationship if missing
      const existing = await (prisma as any).recipeTag.findFirst({
        where: { recipeId: recipe.id, tagId: tag.id },
      })
      if (!existing) {
        await (prisma as any).recipeTag.create({
          data: { recipeId: recipe.id, tagId: tag.id },
        })
        migratedTags++
      }
    }

    // Clear the legacy string
    await (prisma as any).recipe.update({
      where: { id: recipe.id },
      data: { tags: null },
    })
    updatedRecipes++
  }

  return NextResponse.json({ migratedTags, updatedRecipes })
}
