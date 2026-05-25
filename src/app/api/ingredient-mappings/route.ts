import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'

export async function GET() {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const mappings = await prisma.ingredientMapping.findMany({
    where: { familyId: user.familyId },
    orderBy: { ingredient: 'asc' },
  })
  
  return NextResponse.json(mappings)
}

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { ingredient, category } = body
  
  if (!ingredient || !category) {
    return NextResponse.json(
      { error: 'ingredient and category are required' },
      { status: 400 }
    )
  }
  
  // Check if mapping already exists
  const existing = await prisma.ingredientMapping.findFirst({
    where: {
      familyId: user.familyId,
      ingredient: ingredient.trim(),
    },
  })
  
  if (existing) {
    // Update existing mapping
    const updated = await prisma.ingredientMapping.update({
      where: { id: existing.id },
      data: { category: category.trim() },
    })
    return NextResponse.json(updated)
  }
  
  // Create new mapping
  const mapping = await prisma.ingredientMapping.create({
    data: {
      familyId: user.familyId,
      ingredient: ingredient.trim(),
      category: category.trim(),
    },
  })
  
  return NextResponse.json(mapping)
}