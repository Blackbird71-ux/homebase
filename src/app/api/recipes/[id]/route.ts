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
    const tagNames = tagsInput.split(',').map((t: string) => t.trim()).filter(Boolean)
    if (tagNames.length === 0) return []

    // Convert tag names to tag IDs
    const tagIds: string[] = []
    for (const name of tagNames) {
      try {
        const existing = await prisma.tag.findFirst({
          where: {
            name,
            familyId,
          },
        })

        if (existing) {
          tagIds.push(existing.id)
        } else {
          // Create new tag
          const newTag = await prisma.tag.create({
            data: {
              name,
              familyId,
            },
          })
          tagIds.push(newTag.id)
        }
      } catch (error) {
        console.error(`Error processing tag "${name}":`, error)
        // Try to find the tag again in case of race condition
        const existingAfterError = await prisma.tag.findFirst({
          where: {
            name,
            familyId,
          },
        })
        if (existingAfterError) {
          tagIds.push(existingAfterError.id)
        } else {
          console.error(`Failed to process tag "${name}"`)
        }
      }
    }
    return tagIds
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
      ? await prisma.tag.findMany({
          where: {
            id: { in: tagIds },
            familyId,
          },
        })
      : []

    // Create new tags for names that don't exist
    const newTagPromises = tagNames.map(async (name) => {
      try {
        const existing = await prisma.tag.findFirst({
          where: {
            name,
            familyId,
          },
        })

        if (existing) return existing.id

        const newTag = await prisma.tag.create({
          data: {
            name,
            familyId,
          },
        })
        return newTag.id
      } catch (error) {
        console.error(`Error creating tag "${name}":`, error)
        // Try to find the tag again in case of race condition
        const existingAfterError = await prisma.tag.findFirst({
          where: {
            name,
            familyId,
          },
        })
        if (existingAfterError) {
          return existingAfterError.id
        } else {
          console.error(`Failed to create tag "${name}"`)
          throw error // Re-throw to fail the update
        }
      }
    })

    const newTagIds = await Promise.all(newTagPromises)

    return [...existingTags.map((t: any) => t.id), ...newTagIds]
  }

  return []
}

// Helper function to update recipe tags
async function updateRecipeTags(recipeId: string, tagIds: string[]) {
  // Delete existing recipe-tag relationships
  await prisma.recipeTag.deleteMany({
    where: { recipeId },
  })

  // Create new relationships
  if (tagIds.length > 0) {
    await prisma.recipeTag.createMany({
      data: tagIds.map((tagId) => ({
        recipeId,
        tagId,
      })),
    })
  }
}

// Helper function to get recipe with tags
async function getRecipeWithTags(id: string, familyId: string) {
  const recipe = await prisma.recipe.findFirst({
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
  try {
    const user = await requireSession()
    const { id } = await params

    const body = await req.json()

    const { title, description, ingredients, instructions, tags, prepTime, cookTime, servings, sourceUrl, image, bookId } = body

    const existing = await prisma.recipe.findFirst({
      where: { id, familyId: user.familyId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Process tags if provided
    if (tags !== undefined) {
      const tagIds = await processTagsInput(tags, user.familyId, user.id)
      await updateRecipeTags(id, tagIds)
    }

    // Helper to safely stringify ingredients/instructions
    const safeStringify = (value: any): string => {
      if (typeof value === 'string') {
        // Check if it's already valid JSON
        try {
          JSON.parse(value)
          return value // Already valid JSON string
        } catch {
          // Not JSON, treat it as a plain string and wrap in JSON array
          // This handles the case where ingredients/instructions might be sent as plain text
          return JSON.stringify([value])
        }
      }

      // If it's already an array, stringify it
      if (Array.isArray(value)) {
        return JSON.stringify(value)
      }

      // For any other type, stringify it
      return JSON.stringify(value)
    }

    const updateData: any = {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(ingredients !== undefined && { ingredients: safeStringify(ingredients) }),
      ...(instructions !== undefined && { instructions: safeStringify(instructions) }),
      // Keep legacy tags field for backward compatibility (set to 'legacy-tags' if using new system, null if no tags)
      ...(tags !== undefined && { tags: tags && tags.length > 0 ? 'legacy-tags' : null }),
      ...(prepTime !== undefined && { prepTime }),
      ...(cookTime !== undefined && { cookTime }),
      ...(servings !== undefined && { servings }),
      ...(sourceUrl !== undefined && { sourceUrl }),
      ...(image !== undefined && { image: image ?? null }),
    }

    // Handle bookId specially - only update if key exists in body
    if ('bookId' in body) {
      const newBookId = bookId ?? null

      // Validate bookId if provided
      if (newBookId) {
        const book = await prisma.recipeBook.findFirst({
          where: { id: newBookId, familyId: user.familyId },
        })

        if (!book) {
          return NextResponse.json(
            { error: 'Invalid recipe book' },
            { status: 400 }
          )
        }
      }

      updateData.bookId = newBookId
    }

    const updated = await prisma.recipe.update({
      where: { id },
      data: updateData,
    })

    // Get the full recipe with tags for response
    const fullRecipe = await getRecipeWithTags(id, user.familyId)
    return NextResponse.json(fullRecipe)
  } catch (error) {
    console.error('PUT /api/recipes/[id] - Recipe update error:', error)
    console.error('PUT /api/recipes/[id] - Error stack:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
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
