import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getLocalImageUrl } from '@/lib/image-cache'
import { createAuditLog } from '@/lib/audit-log'
import { jsonWithETag } from '@/lib/http-cache'

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
        // CUIDs are 25 chars, UUIDs are 36 — only treat as ID if long enough to be one
        if (tag.length >= 20 && tag.match(/^[0-9a-f-]+$/i)) {
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

// Helper function to create recipe with tags
async function createRecipeWithTags(data: any, tagIds: string[]) {
  const recipe = await prisma.recipe.create({
    data: {
      ...data,
      // Keep legacy tags field for backward compatibility
      tags: tagIds.length > 0 ? 'legacy-tags' : null,
    },
  })

  // Create recipe-tag relationships
  if (tagIds.length > 0) {
    await (prisma as any).recipeTag.createMany({
      data: tagIds.map((tagId) => ({
        recipeId: recipe.id,
        tagId,
      })),
      skipDuplicates: true,
    })
  }

  return recipe
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
    image: getLocalImageUrl(recipe.image),
    ingredients: safeParseArray(recipe.ingredients),
    instructions: safeParseArray(recipe.instructions),
    // Include both formats during transition
    tags: [...newTags.map((t: any) => t.name).filter((n: string) => n !== 'legacy-tags'), ...legacyTags.filter((t: string) => t !== 'legacy-tags')],
    tagObjects: newTags,
    createdAt: recipe.createdAt.toISOString(),
  }
}

export async function GET(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const tags = searchParams.get('tags') ?? ''
  const bookId = searchParams.get('bookId')

  const recipes = await (prisma as any).recipe.findMany({
    where: {
      familyId: user.familyId,
      ...(search && { title: { contains: search } }),
      ...(bookId !== null && { bookId: bookId === 'null' ? null : bookId }),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      recipeTags: {
        include: {
          tag: true,
        },
      },
    },
  })

  // Filter by tag client-side (support both old and new systems during transition)
  const tagList = tags ? tags.split(',').map((t) => t.trim().toLowerCase()) : []
  const filtered = tagList.length
    ? recipes.filter((r: any) => {
        // Check new tag system
        const newTagNames = (r as any).recipeTags?.map((rt: any) => rt.tag.name.toLowerCase()) || []
        // Check legacy tag system
        const legacyTags = (r.tags ?? '').split(',').map((t: string) => t.trim().toLowerCase())
        const allTags = [...newTagNames, ...legacyTags.filter((t: string) => t !== 'legacy-tags')]
        return tagList.some((t) => allTags.includes(t))
      })
    : recipes

  return jsonWithETag(
    req,
    filtered.map((r: any) => {
      const legacyTags = r.tags ? r.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []
      const newTags = (r as any).recipeTags?.map((rt: any) => ({
        id: rt.tag.id,
        name: rt.tag.name,
      })) || []

      return {
        ...r,
        image: getLocalImageUrl(r.image),
        ingredients: safeParseArray(r.ingredients),
        instructions: safeParseArray(r.instructions),
        // Include both formats during transition
        tags: [...newTags.map((t: any) => t.name).filter((n: string) => n !== 'legacy-tags'), ...legacyTags.filter((t: string) => t !== 'legacy-tags')],
        tagObjects: newTags,
        isFavourite: r.isFavourite ?? false,
        createdAt: r.createdAt.toISOString(),
      }
    })
  )
}

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { title, description, notes, ingredients, instructions, tags, prepTime, cookTime, servings, sourceUrl, image, bookId, calories, fatContent, proteinContent, carbContent, sodiumContent } = body

  if (!title || !Array.isArray(ingredients) || !Array.isArray(instructions)) {
    return NextResponse.json(
      { error: 'title, ingredients (array), and instructions (array) are required' },
      { status: 400 }
    )
  }

  // Process tags input
  const tagIds = await processTagsInput(tags, user.familyId, user.id)

  const recipe = await createRecipeWithTags({
    title,
    description: description ?? null,
    notes: notes ?? null,
    ingredients: JSON.stringify(ingredients),
    instructions: JSON.stringify(instructions),
    prepTime: prepTime ?? null,
    cookTime: cookTime ?? null,
    servings: servings ?? null,
    sourceUrl: sourceUrl ?? null,
    image: image ?? null,
    bookId: bookId ?? null,
    calories: calories ?? null,
    fatContent: fatContent ?? null,
    proteinContent: proteinContent ?? null,
    carbContent: carbContent ?? null,
    sodiumContent: sodiumContent ?? null,
    createdBy: user.id,
    familyId: user.familyId,
  }, tagIds)

  // Get the full recipe with tags for response
  const fullRecipe = await getRecipeWithTags(recipe.id, user.familyId)

  void createAuditLog(
    user,
    'create',
    'recipe',
    recipe.id,
    `Created recipe "${title}"`,
    { recipeId: recipe.id }
  )

  return NextResponse.json(fullRecipe, { status: 201 })
}
