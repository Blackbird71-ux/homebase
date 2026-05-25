import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { createAuditLog } from '@/lib/audit-log'

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { title } = body

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  // Check if a recipe with this exact title already exists
  const existing = await prisma.recipe.findFirst({
    where: {
      title: title.trim(),
      familyId: user.familyId,
    },
    select: { id: true, title: true },
  })

  if (existing) {
    return NextResponse.json(existing)
  }

  // Create a minimal recipe with just the title
  const recipe = await prisma.recipe.create({
    data: {
      title: title.trim(),
      description: '',
      ingredients: '[]',
      instructions: '[]',
      prepTime: 0,
      cookTime: 0,
      servings: 1,
      familyId: user.familyId,
      createdBy: user.id,
    },
    select: { id: true, title: true },
  })

  void createAuditLog(
    user,
    'create',
    'recipe',
    recipe.id,
    `Quick-added recipe "${recipe.title}" via meal planner`,
    { quick: true, title: recipe.title }
  )

  return NextResponse.json(recipe, { status: 201 })
}