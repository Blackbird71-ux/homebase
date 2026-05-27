import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { DEFAULT_SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import { KEYWORD_MAP } from '@/lib/ingredient-helpers'

export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  // Check if family has any ingredient categories
  const existingCategories = await (prisma as any).ingredientCategory.findMany({
    where: { familyId: user.familyId },
    orderBy: [
      { sortOrder: 'asc' },
      { category: 'asc' },
    ],
  })

  // If no categories exist, create default ones
  if (existingCategories.length === 0) {
    console.log('No ingredient categories found for family, creating default categories and keyword mappings')
    
    const createdCategories = []
    
    // First, create system categories
    for (let i = 0; i < DEFAULT_SHOPPING_CATEGORIES.length; i++) {
      const categoryName = DEFAULT_SHOPPING_CATEGORIES[i]
      try {
        // Create system category
        const systemCategory = await (prisma as any).ingredientCategory.create({
          data: {
            key: `system_${categoryName.toLowerCase()}`,
            category: categoryName,
            sortOrder: i * 10, // Space them out for reordering
            isCustom: false,
            familyId: user.familyId,
          },
        })
        createdCategories.push(systemCategory)
        
        // Create keyword mappings for this category if it exists in KEYWORD_MAP
        if (KEYWORD_MAP[categoryName as keyof typeof KEYWORD_MAP]) {
          const keywords = KEYWORD_MAP[categoryName as keyof typeof KEYWORD_MAP]
          for (const keyword of keywords) {
            try {
              await (prisma as any).ingredientCategory.create({
                data: {
                  key: keyword.toLowerCase(),
                  category: categoryName,
                  sortOrder: i * 10,
                  isCustom: false,
                  familyId: user.familyId,
                },
              })
              // Don't add keyword mappings to the main categories list
            } catch (error) {
              console.error(`Failed to create keyword mapping ${keyword} -> ${categoryName}:`, error)
            }
          }
        }
      } catch (error) {
        console.error(`Failed to create default category ${categoryName}:`, error)
      }
    }
    
    // Return only the system categories (not keyword mappings)
    return NextResponse.json(
      createdCategories.map((cat: any) => ({
        id: cat.id,
        key: cat.key,
        category: cat.category,
        color: cat.color,
        sortOrder: cat.sortOrder,
        isCustom: cat.isCustom,
        aisle: cat.aisle,
        createdAt: cat.createdAt.toISOString(),
        updatedAt: cat.updatedAt.toISOString(),
      }))
    )
  }

  // If no system_ categories exist yet (legacy families pre-dating the system_ convention),
  // create them now so the shopping list always has the base categories available.
  const hasSystemCats = existingCategories.some((cat: any) => cat.key.startsWith('system_'))
  if (!hasSystemCats) {
    for (let i = 0; i < DEFAULT_SHOPPING_CATEGORIES.length; i++) {
      const categoryName = DEFAULT_SHOPPING_CATEGORIES[i]
      try {
        const created = await (prisma as any).ingredientCategory.create({
          data: {
            key: `system_${categoryName.toLowerCase()}`,
            category: categoryName,
            sortOrder: i * 10,
            isCustom: false,
            familyId: user.familyId,
          },
        })
        existingCategories.push(created)
      } catch {
        // Already exists — skip
      }
    }
  }

  // Filter out keyword mappings (only return categories that start with 'system_' or are custom)
  const categoriesOnly = existingCategories.filter((cat: any) =>
    cat.key.startsWith('system_') || cat.isCustom
  )

  // Deduplicate by category name. The learn API can promote keyword mappings to
  // isCustom=true, which causes the same category name to appear many times.
  // Prefer system_ records; otherwise keep whichever has the lowest sortOrder.
  const seen = new Map<string, any>()
  for (const cat of categoriesOnly) {
    const existing = seen.get(cat.category)
    if (!existing || cat.key.startsWith('system_')) {
      seen.set(cat.category, cat)
    }
  }
  const deduped = [...seen.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.category.localeCompare(b.category))

  return NextResponse.json(
    deduped.map((cat: any) => ({
      id: cat.id,
      key: cat.key,
      category: cat.category,
      color: cat.color,
      sortOrder: cat.sortOrder,
      isCustom: cat.isCustom,
      aisle: cat.aisle,
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString(),
    }))
  )
}

export async function POST(req: Request) {
  try {
    console.log('POST /api/ingredient-categories - Starting request')
    const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.log('POST /api/ingredient-categories - User authenticated:', user.id, 'Family:', user.familyId)
    
    const body = await req.json()
    console.log('POST /api/ingredient-categories - Request body:', JSON.stringify(body))
    const { key, category, sortOrder, color } = body

    // Validation
    if (!key || typeof key !== 'string' || key.trim() === '') {
      console.log('POST /api/ingredient-categories - Validation failed: key is invalid', { key, type: typeof key })
      return NextResponse.json(
        { error: 'Key is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    if (!category || typeof category !== 'string' || category.trim() === '') {
      console.log('POST /api/ingredient-categories - Validation failed: category is invalid', { category, type: typeof category })
      return NextResponse.json(
        { error: 'Category is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    const trimmedKey = key.trim()
    const trimmedCategory = category.trim()
    
    console.log('POST /api/ingredient-categories - Trimmed values:', { trimmedKey, trimmedCategory, sortOrder })

    // Check if key already exists for this family
    console.log('POST /api/ingredient-categories - Checking for existing category with key:', trimmedKey)
    const existingCategory = await (prisma as any).ingredientCategory.findFirst({
      where: {
        familyId: user.familyId,
        key: trimmedKey,
      },
    })

    if (existingCategory) {
      console.log('POST /api/ingredient-categories - Category already exists:', existingCategory.id)
      return NextResponse.json(
        { error: 'An ingredient category with this key already exists for your family' },
        { status: 409 }
      )
    }

    let resolvedSortOrder = sortOrder
    if (resolvedSortOrder == null) {
      const agg = await (prisma as any).ingredientCategory.aggregate({
        where: { familyId: user.familyId },
        _max: { sortOrder: true },
      })
      resolvedSortOrder = ((agg._max.sortOrder as number | null) ?? 0) + 10
    }

    console.log('POST /api/ingredient-categories - Creating new category')
    const ingredientCategory = await (prisma as any).ingredientCategory.create({
      data: {
        key: trimmedKey,
        category: trimmedCategory,
        sortOrder: resolvedSortOrder,
        isCustom: true,
        familyId: user.familyId,
      },
    })
    
    console.log('POST /api/ingredient-categories - Category created:', ingredientCategory.id)

    return NextResponse.json(
      {
        id: ingredientCategory.id,
        key: ingredientCategory.key,
        category: ingredientCategory.category,
        color: ingredientCategory.color,
        sortOrder: ingredientCategory.sortOrder,
        isCustom: ingredientCategory.isCustom,
        createdAt: ingredientCategory.createdAt.toISOString(),
        updatedAt: ingredientCategory.updatedAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('POST /api/ingredient-categories - Error:', error)
    console.error('POST /api/ingredient-categories - Error stack:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}