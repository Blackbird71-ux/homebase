import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

// Helper function to process tags input (supports both old and new formats)
async function processTagsInput(tagsInput: any, familyId: string, userId: string) {
  if (!tagsInput) return []

  // Handle string format (backward compatibility)
  if (typeof tagsInput === 'string') {
    return tagsInput.split(',').map((t: string) => t.trim()).filter(Boolean)
  }

  // Handle array format
  if (Array.isArray(tagsInput)) {
    const tagIds: string[] = []
    const tagNames: string[] = []
    
    // Separate IDs and names
    tagsInput.forEach((tag) => {
      if (typeof tag === 'string') {
        if (tag.match(/^[0-9a-f-]+$/i)) {
          // Looks like an ID
          tagIds.push(tag)
        } else {
          tagNames.push(tag.trim())
        }
      } else if (tag && typeof tag === 'object' && tag.id) {
        tagIds.push(tag.id)
      }
    })

    // Find existing tags by ID
    const existingTags = tagIds.length > 0
      ? await (prisma as any).tag.findMany({
          where: {
            id: { in: tagIds },
            familyId,
          },
        })
      : []

    // Create new tags for names that don't exist
    const newTagPromises = tagNames.map(async (name) => {
      const existing = await (prisma as any).tag.findFirst({
        where: {
          name,
          familyId,
        },
      })
      
      if (existing) return existing.id
      
      const newTag = await (prisma as any).tag.create({
        data: {
          name,
          familyId,
        },
      })
      return newTag.id
    })

    const newTagIds = await Promise.all(newTagPromises)
    
    return [...existingTags.map((t: any) => t.id), ...newTagIds]
  }

  return []
}

// Helper function to update recipe tags
async function updateRecipeTags(recipeId: string, tagIds: string[]) {
  // Delete existing recipe-tag relationships
  await (prisma as any).recipeTag.deleteMany({
    where: { recipeId },
  })

  // Create new relationships
  if (tagIds.length > 0) {
    await (prisma as any).recipeTag.createMany({
      data: tagIds.map((tagId) => ({
        recipeId,
        tagId,
      })),
      skipDuplicates: true,
    })
  }
}

// Helper function to get recipe with tags
async function getRecipeWithTags(id: string, familyId: string) {
  const recipe = await (prisma as any).recipe.findFirst({
    where: { id, familyId },
    include: {
      recipeTags: {
        include: {
          tag: true,
        },
      },
    },
  })

  if (!recipe) return null

  const legacyTags = recipe.tags ? recipe.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []
  const newTags = recipe.recipeTags?.map((rt: any) => ({
    id: rt.tag.id,
    name: rt.tag.name,
  })) || []

  return {
    ...recipe,
    ingredients: safeParseArray(recipe.ingredients),
    instructions: safeParseArray(recipe.instructions),
    // Include both formats during transition
    tags: [...newTags.map((t: any) => t.name), ...legacyTags.filter((t: string) => t !== 'legacy-tags')],
    tagObjects: newTags,
    createdAt: recipe.createdAt.toISOString(),
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  
  const recipe = await getRecipeWithTags(id, user.familyId)
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  
  return NextResponse.json(recipe)
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { title, description, ingredients, instructions, tags, prepTime, cookTime, servings, sourceUrl, image, bookId } = body

  const existing = await prisma.recipe.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Process tags if provided
  if (tags !== undefined) {
    const tagIds = await processTagsInput(tags, user.familyId, user.id)
    await updateRecipeTags(id, tagIds)
  }

  const updated = await prisma.recipe.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(ingredients !== undefined && { ingredients: JSON.stringify(ingredients) }),
      ...(instructions !== undefined && { instructions: JSON.stringify(instructions) }),
      // Keep legacy tags field for backward compatibility (set to 'legacy-tags' if using new system)
      ...(tags !== undefined && { tags: 'legacy-tags' }),
      ...(prepTime !== undefined && { prepTime }),
      ...(cookTime !== undefined && { cookTime }),
      ...(servings !== undefined && { servings }),
      ...(sourceUrl !== undefined && { sourceUrl }),
      ...(image !== undefined && { image: image ?? null }),
      ...('bookId' in body && { bookId: bookId ?? null }),
    },
  })

  // Get the full recipe with tags for response
  const fullRecipe = await getRecipeWithTags(id, user.familyId)
  return NextResponse.json(fullRecipe)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const existing = await prisma.recipe.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  
  // Delete recipe (cascade will delete recipe-tag relationships)
  await prisma.recipe.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
