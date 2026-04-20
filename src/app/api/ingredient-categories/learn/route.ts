import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { items } = body

  if (!Array.isArray(items)) {
    return NextResponse.json(
      { error: 'Items must be an array' },
      { status: 400 }
    )
  }

  // Validate each item
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      return NextResponse.json(
        { error: 'Each item must be an object with key and category properties' },
        { status: 400 }
      )
    }
    
    if (!item.key || typeof item.key !== 'string' || item.key.trim() === '') {
      return NextResponse.json(
        { error: 'Each item must have a non-empty key string' },
        { status: 400 }
      )
    }
    
    if (!item.category || typeof item.category !== 'string' || item.category.trim() === '') {
      return NextResponse.json(
        { error: 'Each item must have a non-empty category string' },
        { status: 400 }
      )
    }
  }

  const results = []
  
  for (const item of items) {
    const trimmedKey = item.key.trim()
    const trimmedCategory = item.category.trim()

    try {
      // Check if category already exists for this key and family
      const existingCategory = await (prisma as any).ingredientCategory.findFirst({
        where: {
          familyId: user.familyId,
          key: trimmedKey,
        },
      })

      if (existingCategory) {
        // Update existing category
        const updatedCategory = await (prisma as any).ingredientCategory.update({
          where: { id: existingCategory.id },
          data: {
            category: trimmedCategory,
            isCustom: true,
            updatedAt: new Date(),
          },
        })
        
        results.push({
          key: trimmedKey,
          category: trimmedCategory,
          action: 'updated',
          id: updatedCategory.id,
        })
      } else {
        // Create new category
        const newCategory = await (prisma as any).ingredientCategory.create({
          data: {
            key: trimmedKey,
            category: trimmedCategory,
            sortOrder: 0,
            isCustom: true,
            familyId: user.familyId,
          },
        })
        
        results.push({
          key: trimmedKey,
          category: trimmedCategory,
          action: 'created',
          id: newCategory.id,
        })
      }
    } catch (error) {
      results.push({
        key: trimmedKey,
        category: trimmedCategory,
        action: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return NextResponse.json({
    success: true,
    message: `Processed ${items.length} items`,
    results,
  })
}