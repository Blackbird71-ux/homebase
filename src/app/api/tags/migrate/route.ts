import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function POST() {
  const user = await requireSession()

  // Clean up incorrectly created 'legacy-tags' Tag record (created by prior migration bug
  // that treated the sentinel string as a real tag name)
  const sentinelTag = await (prisma as any).tag.findFirst({
    where: { familyId: user.familyId, name: 'legacy-tags' },
  })
  if (sentinelTag) {
    await (prisma as any).recipeTag.deleteMany({ where: { tagId: sentinelTag.id } })
    await (prisma as any).tag.delete({ where: { id: sentinelTag.id } })
  }

  const recipes = await (prisma as any).recipe.findMany({
    where: { familyId: user.familyId },
    select: { id: true, tags: true },
  })

  let migratedTags = 0
  let updatedRecipes = 0

  for (const recipe of recipes) {
    // Skip null and the sentinel value used by the new relational system
    if (!recipe.tags || recipe.tags === 'legacy-tags') continue
    const names = recipe.tags
      .split(',')
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0 && t !== 'legacy-tags')

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
