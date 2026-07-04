import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

// Helper function to get recipe with all relations
async function getRecipeWithRelations(id: string, familyId: string) {
  return await (prisma as any).recipe.findFirst({
    where: { id, familyId },
    include: {
      recipeTags: {
        include: {
          tag: true,
        },
      },
    },
  })
}

// Helper function to safe parse JSON arrays
function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

async function _POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    
    // Fetch the source recipe with all relations
    const sourceRecipe = await getRecipeWithRelations(id, user.familyId)
    
    if (!sourceRecipe) {
      return NextResponse.json(
        { error: 'Recipe not found' },
        { status: 404 }
      )
    }

    // Parse ingredients and instructions
    const ingredients = safeParseArray(sourceRecipe.ingredients)
    const instructions = safeParseArray(sourceRecipe.instructions)
    
    // Extract tag IDs from recipeTags
    const tagIds = sourceRecipe.recipeTags?.map((rt: any) => rt.tagId) || []

    // Create new recipe with "(Copy)" suffix in title.
    // Transaction: a tag-link failure must not leave a half-copied recipe behind.
    // Note: skipDuplicates is not supported on SQLite; source tagIds are unique via the RecipeTag PK.
    const newRecipe = await prisma.$transaction(async (tx) => {
      const created = await tx.recipe.create({
        data: {
          title: `${sourceRecipe.title} (Copy)`,
          description: sourceRecipe.description,
          ingredients: JSON.stringify(ingredients),
          instructions: JSON.stringify(instructions),
          tags: sourceRecipe.tags, // Keep legacy tags field
          prepTime: sourceRecipe.prepTime,
          cookTime: sourceRecipe.cookTime,
          servings: sourceRecipe.servings,
          sourceUrl: sourceRecipe.sourceUrl,
          image: sourceRecipe.image,
          bookId: sourceRecipe.bookId,
          createdBy: user.id,
          familyId: user.familyId,
        },
      })

      // Copy recipe-tag relationships if they exist
      if (tagIds.length > 0) {
        await tx.recipeTag.createMany({
          data: tagIds.map((tagId: string) => ({
            recipeId: created.id,
            tagId,
          })),
        })
      }

      return created
    })

    // Fetch the new recipe with tags for response
    const createdRecipe = await getRecipeWithRelations(newRecipe.id, user.familyId)
    
    // Format response
    const response = {
      id: createdRecipe.id,
      title: createdRecipe.title,
      description: createdRecipe.description,
      ingredients: safeParseArray(createdRecipe.ingredients),
      instructions: safeParseArray(createdRecipe.instructions),
      tags: createdRecipe.recipeTags?.map((rt: any) => rt.tag.name) || [],
      prepTime: createdRecipe.prepTime,
      cookTime: createdRecipe.cookTime,
      servings: createdRecipe.servings,
      sourceUrl: createdRecipe.sourceUrl,
      image: createdRecipe.image,
      bookId: createdRecipe.bookId,
      createdAt: createdRecipe.createdAt.toISOString(),
    }

    return NextResponse.json(response, { status: 201 })
    
  } catch (error) {
    console.error('[duplicate-recipe] Error:', error)
    return NextResponse.json(
      { error: 'Failed to duplicate recipe' },
      { status: 500 }
    )
  }
}

export const POST = withRouteErrors(_POST)
