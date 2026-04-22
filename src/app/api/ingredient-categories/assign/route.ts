import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function POST(req: Request) {
  try {
    const user = await requireSession()
    const body = await req.json()
    const { updates } = body

    if (!Array.isArray(updates)) {
      return NextResponse.json(
        { error: 'Updates must be an array' },
        { status: 400 }
      )
    }

    // Validate each update
    for (const update of updates) {
      if (!update || typeof update !== 'object') {
        return NextResponse.json(
          { error: 'Each update must be an object with ingredientId and categoryId properties' },
          { status: 400 }
        )
      }
      
      if (!update.ingredientId || typeof update.ingredientId !== 'string') {
        return NextResponse.json(
          { error: 'Each update must have a valid ingredientId string' },
          { status: 400 }
        )
      }
      
      // categoryId can be null (to unassign)
      if (update.categoryId !== null && update.categoryId !== undefined && typeof update.categoryId !== 'string') {
        return NextResponse.json(
          { error: 'categoryId must be a string or null' },
          { status: 400 }
        )
      }
    }

    const results = []
    
    for (const update of updates) {
      const { ingredientId, categoryId } = update
      
      try {
        // Verify the ingredient exists and belongs to user's family
        // Note: We need to check if ingredient exists in the system
        // For now, we'll assume it's a list item ID
        const listItem = await (prisma as any).listItem.findFirst({
          where: {
            id: ingredientId,
            list: {
              familyId: user.familyId
            }
          },
          include: {
            list: true
          }
        })

        if (!listItem) {
          results.push({
            ingredientId,
            categoryId,
            success: false,
            error: 'Ingredient not found or does not belong to your family'
          })
          continue
        }

        // If categoryId is provided, verify it exists and belongs to user's family
        let category = null
        if (categoryId) {
          category = await (prisma as any).ingredientCategory.findFirst({
            where: {
              id: categoryId,
              familyId: user.familyId
            }
          })

          if (!category) {
            results.push({
              ingredientId,
              categoryId,
              success: false,
              error: 'Category not found or does not belong to your family'
            })
            continue
          }
        }

        // Update the list item with the category
        const updatedItem = await (prisma as any).listItem.update({
          where: { id: ingredientId },
          data: {
            category: category ? category.category : null
          }
        })

        results.push({
          ingredientId,
          categoryId,
          categoryName: category ? category.category : null,
          success: true
        })
      } catch (error) {
        results.push({
          ingredientId,
          categoryId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({
      success: true,
      message: `Processed ${updates.length} assignments (${successful} successful, ${failed} failed)`,
      results
    })
  } catch (error) {
    console.error('POST /api/ingredient-categories/assign - Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}