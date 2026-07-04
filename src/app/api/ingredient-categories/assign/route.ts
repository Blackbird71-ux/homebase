import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _POST(req: Request) {
  try {
    const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // Batch-fetch the owned list items and categories once, then validate each
    // update against those maps (avoids the previous 3N per-row queries).
    const ingredientIds = [...new Set(updates.map(u => u.ingredientId as string))]
    const categoryIds = [...new Set(
      updates.map(u => u.categoryId).filter((c: unknown): c is string => typeof c === 'string')
    )]

    const [items, categories] = await Promise.all([
      prisma.listItem.findMany({
        where: { id: { in: ingredientIds }, list: { familyId: user.familyId } },
        select: { id: true },
      }),
      prisma.ingredientCategory.findMany({
        where: { id: { in: categoryIds }, familyId: user.familyId },
        select: { id: true, category: true },
      }),
    ])

    const ownedItemIds = new Set(items.map(i => i.id))
    const categoryNameById = new Map(categories.map(c => [c.id, c.category]))

    const results: Array<{
      ingredientId: string
      categoryId: string | null
      success: boolean
      error?: string
      categoryName?: string | null
    }> = []
    // id -> resolved category name (string) or null; last write wins on duplicate ids.
    const toUpdate = new Map<string, string | null>()

    for (const update of updates) {
      const ingredientId = update.ingredientId as string
      const categoryId = (update.categoryId ?? null) as string | null

      if (!ownedItemIds.has(ingredientId)) {
        results.push({
          ingredientId,
          categoryId,
          success: false,
          error: 'Ingredient not found or does not belong to your family',
        })
        continue
      }

      let categoryName: string | null = null
      if (categoryId) {
        const found = categoryNameById.get(categoryId)
        if (found === undefined) {
          results.push({
            ingredientId,
            categoryId,
            success: false,
            error: 'Category not found or does not belong to your family',
          })
          continue
        }
        categoryName = found
      }

      toUpdate.set(ingredientId, categoryName)
      results.push({ ingredientId, categoryId, categoryName, success: true })
    }

    // Group by target category value → one updateMany per distinct value, in a transaction.
    const idsByCategory = new Map<string | null, string[]>()
    for (const [id, cat] of toUpdate) {
      const arr = idsByCategory.get(cat) ?? []
      arr.push(id)
      idsByCategory.set(cat, arr)
    }

    if (idsByCategory.size > 0) {
      await prisma.$transaction(
        [...idsByCategory.entries()].map(([category, ids]) =>
          prisma.listItem.updateMany({ where: { id: { in: ids } }, data: { category } })
        )
      )
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

export const POST = withRouteErrors(_POST)
