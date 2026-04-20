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
  const user = await requireSession()
  const body = await req.json()
  const { key, category, sortOrder } = body

  // Validation
  if (!key || typeof key !== 'string' || key.trim() === '') {
    return NextResponse.json(
      { error: 'Key is required and must be a non-empty string' },
      { status: 400 }
    )
  }

  if (!category || typeof category !== 'string' || category.trim() === '') {
    return NextResponse.json(
      { error: 'Category is required and must be a non-empty string' },
      { status: 400 }
    )
  }

  const trimmedKey = key.trim()
  const trimmedCategory = category.trim()

  // Check if key already exists for this family
  const existingCategory = await (prisma as any).ingredientCategory.findFirst({
    where: {
      familyId: user.familyId,
      key: trimmedKey,
    },
  })

  if (existingCategory) {
    return NextResponse.json(
      { error: 'An ingredient category with this key already exists for your family' },
      { status: 409 }
    )
  }

  const ingredientCategory = await (prisma as any).ingredientCategory.create({
    data: {
      key: trimmedKey,
      category: trimmedCategory,
      sortOrder: sortOrder ?? 0,
      isCustom: true,
      familyId: user.familyId,
    },
  })

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
}