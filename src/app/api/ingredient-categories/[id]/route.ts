import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

async function _GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const category = await (prisma as any).ingredientCategory.findFirst({
    where: {
      id,
      familyId: user.familyId,
    },
  })

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: category.id,
    key: category.key,
    category: category.category,
    sortOrder: category.sortOrder,
    isCustom: category.isCustom,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  })
}

async function _PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const { key, category: categoryName, sortOrder, aisle, color } = body

  // Check if category exists and belongs to user's family
  const existingCategory = await (prisma as any).ingredientCategory.findFirst({
    where: {
      id,
      familyId: user.familyId,
    },
  })

  if (!existingCategory) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  // Prepare update data
  const updateData: any = {}
  
  if (key !== undefined) {
    if (typeof key !== 'string' || key.trim() === '') {
      return NextResponse.json(
        { error: 'Key must be a non-empty string' },
        { status: 400 }
      )
    }
    const trimmedKey = key.trim()
    
    // Check if new key already exists for this family (excluding current category)
    if (trimmedKey !== existingCategory.key) {
      const duplicateCategory = await (prisma as any).ingredientCategory.findFirst({
        where: {
          familyId: user.familyId,
          key: trimmedKey,
          NOT: { id },
        },
      })

      if (duplicateCategory) {
        return NextResponse.json(
          { error: 'An ingredient category with this key already exists for your family' },
          { status: 409 }
        )
      }
    }
    
    updateData.key = trimmedKey
  }

  if (categoryName !== undefined) {
    if (typeof categoryName !== 'string' || categoryName.trim() === '') {
      return NextResponse.json(
        { error: 'Category must be a non-empty string' },
        { status: 400 }
      )
    }
    updateData.category = categoryName.trim()
  }

  if (sortOrder !== undefined) {
    if (typeof sortOrder !== 'number' || sortOrder < 0) {
      return NextResponse.json(
        { error: 'Sort order must be a non-negative number' },
        { status: 400 }
      )
    }
    updateData.sortOrder = sortOrder
  }

  if (color !== undefined) {
    updateData.color = color && typeof color === 'string' ? color.trim() : null
  }

  if (aisle !== undefined) {
    updateData.aisle = aisle && typeof aisle === 'string' ? aisle.trim() : null
  }

  const updatedCategory = await (prisma as any).ingredientCategory.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json({
    id: updatedCategory.id,
    key: updatedCategory.key,
    category: updatedCategory.category,
    color: updatedCategory.color,
    sortOrder: updatedCategory.sortOrder,
    isCustom: updatedCategory.isCustom,
    aisle: updatedCategory.aisle,
    createdAt: updatedCategory.createdAt.toISOString(),
    updatedAt: updatedCategory.updatedAt.toISOString(),
  })
}

async function _DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  // Check if category exists and belongs to user's family
  const category = await (prisma as any).ingredientCategory.findFirst({
    where: {
      id,
      familyId: user.familyId,
    },
  })

  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  }

  // Only allow deletion of custom categories
  if (!category.isCustom) {
    return NextResponse.json(
      { error: 'Only custom categories can be deleted' },
      { status: 403 }
    )
  }

  await (prisma as any).ingredientCategory.delete({
    where: { id },
  })

  return NextResponse.json({
    success: true,
    message: `Category "${category.category}" has been deleted`,
  })
}

export const GET = withRouteErrors(_GET)
export const PUT = withRouteErrors(_PUT)
export const DELETE = withRouteErrors(_DELETE)
