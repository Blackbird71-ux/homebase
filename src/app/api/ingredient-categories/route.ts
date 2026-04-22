import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET() {
  const user = await requireSession()
  
  const categories = await (prisma as any).ingredientCategory.findMany({
    where: { familyId: user.familyId },
    orderBy: [
      { sortOrder: 'asc' },
      { category: 'asc' },
    ],
  })

  return NextResponse.json(
    categories.map((cat: any) => ({
      id: cat.id,
      key: cat.key,
      category: cat.category,
      sortOrder: cat.sortOrder,
      isCustom: cat.isCustom,
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString(),
    }))
  )
}

export async function POST(req: Request) {
  try {
    console.log('POST /api/ingredient-categories - Starting request')
    const user = await requireSession()
    console.log('POST /api/ingredient-categories - User authenticated:', user.id, 'Family:', user.familyId)
    
    const body = await req.json()
    console.log('POST /api/ingredient-categories - Request body:', JSON.stringify(body))
    const { key, category, sortOrder } = body

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

    console.log('POST /api/ingredient-categories - Creating new category')
    const ingredientCategory = await (prisma as any).ingredientCategory.create({
      data: {
        key: trimmedKey,
        category: trimmedCategory,
        sortOrder: sortOrder ?? 0,
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